# Inscripción de asignaturas UNIMINUTO — simulación local

Simulación en Docker de la arquitectura descrita en el informe "Arquitectura de datos –
Sistema de inscripción de asignaturas UNIMINUTO" (en adelante, "el informe"). Este
archivo resume las decisiones del informe y es la referencia para los agentes.

Todo subagente lee este archivo completo antes de empezar.

## Problema y regla central

Hoy el estudiante inscribe con un Excel de NRC sin cupos ni validación previa.
**Regla central (informe, paso 2): el estudiante nunca ve un NRC que no pueda inscribir**
— sin cupo, con cruce de horario o de una materia sin prerrequisitos aprobados.

## Forma de trabajo (OPC)

- El operador (usuario) define, revisa y aprueba. El orquestador planea y delega.
- Una fase a la vez. Al cerrar una fase: pruebas en verde, resumen de lo que funciona,
  y esperar OK del operador.
- Especificación primero: cada tarea parte de una historia de usuario (HU1–HU5) con
  criterios Dado/Cuando/Entonces.
- Nada de datos personales reales. Todos los estudiantes y docentes son sintéticos
  (Faker `es_CO`, semilla fija `20271`).
- Sin secretos en el repo: `.env.example` versionado, `.env` ignorado.

### Subagentes (`.claude/agents/`)

| Agente | Modelo | Responsabilidad |
| --- | --- | --- |
| `data-synth` | haiku | NRC, estudiantes e historiales sintéticos desde `data/reference/` |
| `infra` | sonnet | Docker Compose, healthchecks, Makefile, `.env` |
| `backend` | sonnet | API FastAPI, cupos/cruces/prerrequisitos, eventos, worker |
| `data-lake` | sonnet | Bronce → plata → oro, consultas DuckDB |
| `ui-designer` | opus | Brief, tokens, sistema de diseño, revisión visual |
| `frontend` | sonnet | Pantallas Next.js siguiendo a `ui-designer` |
| `qa` | haiku | Unitarias, integración, E2E, concurrencia, carga, capturas |
| `reviewer` | sonnet | Revisión de fase, solo lectura |

## Fases

1. Plan + `CLAUDE.md` + subagentes. ✅
2. Infra Docker + datos sintéticos cargados. ✅
3. Backend con inscripción atómica y eventos. ✅
4. Brief de diseño → sistema de diseño en Storybook. ✅
5. Pantallas del estudiante con cupos en vivo. ✅
6. Data lake y página de analítica. ✅
7. Pruebas de concurrencia y carga + capturas.
8. README, diagrama y guion de demo de 5 minutos.

## Arquitectura

Separar operación de analítica: el estudiante solo toca NoSQL rápido; todo lo demás
viaja por eventos al data lake sin frenar la inscripción. El "sistema académico oficial"
es la fuente de verdad y se simula como colecciones de Mongo propias.

| Azure (producción) | Local (Docker) | Servicio compose | Puerto host |
| --- | --- | --- | --- |
| Cosmos DB API MongoDB | MongoDB 7 | `mongo` | 27017 |
| Azure Cache for Redis | Redis 7 | `redis` | 6379 |
| Event Hubs | Redpanda (Kafka API) | `redpanda` | 19092 |
| ADLS Gen2 | MinIO (`bronze`, `silver`, `gold`) | `minio` | 9000 / 9001 consola |
| Data Factory / Fabric | Workers Python + DuckDB sobre Parquet | `lake-worker` | — |
| App Service + Functions | API FastAPI + worker de confirmación | `api`, `enroll-worker` | 8000 |
| App Service (web) | Next.js | `web` | 3000 |
| Entra ID | Login simulado con JWT, usuarios sintéticos | (en `api`) | — |
| Power BI | Página `/coordinacion/analitica` en la web (lee `/api/v1/coordinacion/analitica/*`, que consulta gold con DuckDB) | `web`, `api` | — |

Storybook corre fuera de Docker (`make storybook`, puerto 6006).

**Restricción de máquina: 8 GB de RAM.** Todo servicio en compose lleva `mem_limit`.
Redpanda en modo dev (`--smp 1 --memory 512M --overprovisioned`).

### Flujo de inscripción (HU4)

1. `POST /inscripciones` → valida prerrequisitos y jornada en la API (dato estable, Mongo); un
   NRC fuera de la jornada del estudiante responde `409 fuera_de_jornada` sin tocar Redis.
2. Script **Lua atómico** en Redis (un solo `EVALSHA`; nada de leer-y-escribir desde Python).
   En orden, y abortando sin escribir nada al primer fallo:
   - `cupos:{periodo}:{nrc}` debe existir (si no → `error`).
   - Ninguna entrada de `ocupado:{estudianteId}` con la misma `materiaId` (→ `ya_inscrita`).
   - Ningún bloque de `ocupado:{estudianteId}` cruza con los del NRC (`cjson.decode`; → `cruce`).
     Así dos solicitudes simultáneas del mismo estudiante no pueden dejar un cruce.
   - `cupos > 0` (→ `sin_cupo`, la API responde `409` con el NRC alternativo más cercano).
   - `DECR cupos`, `HSET ocupado:{est} {nrc} {"materiaId","bloques"}`,
     `SET reserva:{est}:{nrc} {reservaId}` con TTL `RESERVA_TTL_S`,
     `ZADD reservas:pendientes {vencimientoMs} "{est}|{nrc}"` y `PUBLISH cupos:{periodo}`.
3. Publica en `inscripcion.intentos` (siempre, con su resultado y `reservaId`). Clave Kafka =
   `estudianteId`. Si el intento exitoso no se puede publicar (`send_and_wait` falla), la API
   devuelve el cupo y responde `503`: nunca promete una reserva que el worker no verá.
4. `enroll-worker` consume y confirma contra el sistema académico simulado (Mongo):
   - Idempotencia **por estado**: si la inscripción ya es terminal, no toca Redis.
   - **Mongo primero**: upsert `confirmada` en `_id = "{periodo}|{est}|{nrc}"` sin pisar
     `cancelada`; después `consolidar.lua` borra la reserva (solo si su `reservaId` coincide) y
     su miembro del ZSET. Si el worker cae entre ambos pasos, la conciliación lo cierra.
   - Si el sistema académico falla: `rechazada` y devolución en modo `conciliar`.
   - Eventos inválidos o que fallan 3 veces van a `inscripcion.dlq`; el worker no se detiene.
5. **Devolución de cupo** (rechazo, cancelación o conciliación) también en Lua (`devolver.lua`):
   idempotente (solo si `ocupado` aún tiene el NRC), `INCR cupos` sin superar `cupototal`,
   `HDEL ocupado`, `DEL reserva`, `ZREM`, `PUBLISH`. Si falta `cupototal`, error sin escribir.
   Cancelación: Mongo `cancelada` primero, luego `devolver.lua`.
6. Conciliación cada 30 s en `enroll-worker`: `ZRANGEBYSCORE reservas:pendientes -inf {ahora}`
   → si Mongo ya dice `confirmada`, solo `ZREM`; si no, devuelve el cupo y marca `rechazada`
   (motivo `reserva_vencida`).
7. Cada cambio de cupo sale de los Lua por Redis Pub/Sub `cupos:{periodo}` con
   `{nrc, libres}` → la API lo emite por **SSE** (`GET /stream/cupos?ticket=`). El ticket se
   pide con `POST /stream/ticket` (JWT `aud=stream`, 60 s); el JWT de sesión nunca va en la URL.

Los scripts Lua viven solo en `services/lua/` y se copian a las imágenes de api y worker.

**Límite conocido de la simulación:** Redis es la única copia viva de `ocupado` y de los
cupos durante el periodo; si se pierde, se reconstruye con `make seed` (no hay job de
reconstrucción Mongo → Redis). En producción haría falta ese job y claves con hash tags
para Redis Cluster.

### Tópicos Redpanda

| Tópico | Productor | Consumidores |
| --- | --- | --- |
| `inscripcion.intentos` | api | enroll-worker, lake-worker |
| `inscripcion.resultados` | enroll-worker | lake-worker |
| `oferta.busquedas` | api | lake-worker |
| `inscripcion.dlq` | enroll-worker | (inspección manual) |

`inscripcion.intentos` lleva eventos `tipo=intento` y `tipo=cancelacion`; los consumidores
filtran por `tipo`.

Envelope de evento (JSON):

```json
{
  "eventId": "uuid", "tipo": "intento|confirmacion|cancelacion|busqueda",
  "ocurridoEn": "2026-11-09T21:00:00.123Z", "periodo": "2027-1",
  "estudianteId": "est-000123", "nrc": "80852", "materiaId": "ISUMBG103",
  "resultado": "exito|sin_cupo|cruce|prerrequisito|ya_inscrita|materia_aprobada|fuera_de_jornada|rechazada|error",
  "latenciaMs": 12, "alternativaNrc": "86366"
}
```

Campos opcionales: `reservaId` (intentos exitosos y confirmaciones), `motivo` (rechazos y
errores: `reserva_vencida`, `sistema_academico_no_disponible`…), `conflicto` (NRC con el que
cruza), `resultados` (cantidad de NRC devueltos en una búsqueda), `eventoOrigen` (eventId del
intento que originó una confirmación). Las confirmaciones del worker usan `resultado: exito`
o `rechazada`; las de conciliación llevan `latenciaMs: 0`.

`estudianteId` es un identificador sintético. En plata/oro se usa hash (SHA-256 con sal). En
producción tampoco iría en claro en logs (Ley 1581 de 2012).

## Modelo de datos

### Mongo (`inscripcion` db) — según informe, paso 6

| Colección | Qué guarda | Clave de partición (Cosmos) |
| --- | --- | --- |
| `estudiantes` | id, nombre sintético, correo sintético, programa, sede, semestre, `jornada`, materias aprobadas | `estudianteId` |
| `pensums` | programa, materias por semestre, prerrequisitos | `programaId` |
| `materias` | código, nombre, créditos, semestre, área | `materiaId` |
| `nrc` | NRC, materia, docente, sede, modalidad, periodo, cupo total, bloques embebidos | `materiaId` |
| `inscripciones` | estudiante, NRC, periodo, estado, fechas | `estudianteId` |

NRC de ejemplo (el horario va embebido):

```json
{
  "_id": "80852", "nrc": "80852", "periodo": "2027-1",
  "materiaId": "ISUMBG103", "titulo": "Sistemas Operativos", "creditos": 3,
  "sede": "Calle 80", "modalidad": "presencial", "docente": "Docente sintético",
  "cupoTotal": 18, "franja": "noche", "estado": "activo",
  "bloques": [
    {"dia": "MAR", "inicio": "18:15", "fin": "19:44", "edificio": "RGH", "salon": "A406LS27"},
    {"dia": "JUE", "inicio": "18:15", "fin": "19:44", "edificio": "RGH", "salon": "A402LS25"}
  ]
}
```

- Días: `LUN MAR MIE JUE VIE SAB`. Horas `HH:MM` 24 h. Modalidad: `presencial | virtual | sincronica`.
  Los NRC virtuales no tienen bloques y nunca generan cruce.
- Franja por hora de inicio: mañana < 12:00, tarde < 18:00, noche ≥ 18:00.
- Cruce: mismo día y `inicio_a < fin_b && inicio_b < fin_a`.
- Jornada del estudiante (`jornada`: `noche | tarde`). Ventana: `noche` = todos los bloques con
  inicio ≥ 18:00 y fin ≤ 22:00; `tarde` = inicio ≥ 12:00 y fin ≤ 18:00. Los NRC virtuales (sin
  bloques) se ven en cualquier jornada; los sincrónicos tienen bloques y aplican la ventana.
  `materias/habilitadas`, `materias/{id}/nrc`, las alternativas de `sin_cupo` y las
  recomendaciones solo muestran NRC de la jornada (más la regla de cupo y cruce); `POST
  /inscripciones` rechaza los demás con `fuera_de_jornada` (409). Todos los estudiantes
  sintéticos son `noche`, salvo `est-000006`. El generador garantiza por materia ≥ 3 NRC de
  noche y ≥ 3 de tarde con horarios distintos.
- `GET /api/v1/avance`: obligatorias (no electivas) con `semestre == semestre actual` sin aprobar:
  `semestreActual`, `totalPendientes`, `inscritas`, `faltan`, `habilitadasSinInscribir`,
  `materias[{materiaId, nombre, semestre, estado}]` (`inscrita | habilitada |
  bloqueada_prerrequisito | sin_oferta`), `atrasadas` (semestres anteriores, aparte) y `mensaje`.
- Periodo simulado: `2027-1`.

### Redis — según informe, paso 6

| Clave | Valor | Uso |
| --- | --- | --- |
| `cupos:{periodo}:{nrc}` | entero, cupos libres | descuento atómico (Lua) |
| `cupototal:{periodo}:{nrc}` | entero, cupo total | tope al devolver cupos |
| `ocupado:{estudianteId}` | hash: campo `nrc` → JSON `{"materiaId", "bloques": [...]}` | filtro de cruces y de materia repetida en ms |
| `reserva:{estudianteId}:{nrc}` | reserva temporal, TTL `RESERVA_TTL_S` (300 s) | no perder el cupo mientras se confirma |
| `reservas:pendientes` | ZSET `"{est}\|{nrc}"`, score = vencimiento (ms) | conciliar reservas vencidas |

`make seed` borra y recarga todas estas claves; no se ejecuta con tráfico de inscripción activo.

### Inscripciones

`_id = "{periodo}|{estudianteId}|{nrc}"`. Estados: `reservada → confirmada | rechazada`,
`reservada | confirmada → cancelada`. `reservada` vive solo en Redis (clave `reserva:`);
Mongo guarda `confirmada`, `rechazada` y `cancelada` (por upsert). Campos: `estudianteId`,
`nrc`, `materiaId`, `periodo`, `estado`, `motivo?`, `creadaEn`, `actualizadaEn` (UTC). Un
estudiante no tiene dos inscripciones activas de la misma materia.

`eventos_procesados` (índice TTL 24 h) registra los eventId ya procesados por el worker; es
una optimización, la garantía de idempotencia es la regla por estado.

### Login simulado (Entra ID)

`POST /api/v1/auth/login` con `estudianteId` (o correo sintético) y `DEMO_PASSWORD`,
igual para todos los estudiantes sintéticos. Devuelve JWT HS256 (`JWT_SECRET` ≥ 32 bytes,
expira en `JWT_TTL_MIN`, exige `exp`/`sub`/`iat`, `aud=inscripcion-api`), con límite de 10
intentos fallidos por minuto por usuario. Demos: `est-000001` (1.er semestre), `est-000002` (clase MAR/JUE 20:30,
HU3), `est-000003` (6.º), `est-000004` (9.º, habilitada para Práctica), `est-000005` (rezago), `est-000006` (3.er semestre, jornada tarde).
`franja` usa los valores `mañana | tarde | noche`.

**Coordinador (HU5):** usuario sintético `coord-0001` (misma `DEMO_PASSWORD`, definido en la
API, no está en `estudiantes`). El JWT lleva `rol` (`estudiante` | `coordinador`); la respuesta
de login también trae `rol`. Todo endpoint de estudiante responde `403 rol_no_permitido` a un
coordinador, y `/coordinacion/*` lo mismo a un estudiante. Endpoints (solo coordinador, leen
gold de MinIO con DuckDB y caché de 10 s; si gold no existe responden vacío con
`generadoEn: null`): `GET /api/v1/coordinacion/me` y
`GET /api/v1/coordinacion/analitica/{resumen, demanda-nrc, ocupacion-franja, combinaciones,
auditoria, demanda-insatisfecha}`. Tipos en `web/src/lib/tipos.ts`.

### Data lake (MinIO)

| Capa | Bucket | Contenido | Formato |
| --- | --- | --- | --- |
| Bronce | `bronze` | eventos crudos tal cual llegan, particionados `tipo=/fecha=` | JSON lines |
| Plata | `silver` | intentos limpios y unidos con NRC/materia/franja, ids anonimizados | Parquet |
| Oro | `gold` | `demanda_nrc`, `ocupacion_franja`, `combinaciones_nrc`, `auditoria_intentos` | Parquet |

Validación de datos: los conteos bronce → plata → oro deben cuadrar.

**Servicio `lake-worker`** (`services/lake`, sin puerto): ingesta continua de
`inscripcion.intentos`, `inscripcion.resultados` y `oferta.busquedas` a bronce (grupo
`lake-bronce`; lotes de 500 mensajes o 3 s; **el offset se confirma solo después de escribir**,
entrega at-least-once) y, cada `LAKE_RECALCULO_MIN` minutos (5), recalcula plata y oro completos
con DuckDB + `httpfs` sobre MinIO. `mem_limit` 384 MB, `read_only`, `cap_drop ALL`.

- Bronce: `tipo={intento|confirmacion|cancelacion|busqueda|invalido}/fecha={ocurridoEn UTC}/
  {topic}-p{particion}-o{primero}-o{ultimo}.jsonl`. Lo que no es un evento va a `tipo=invalido`.
- Plata (`silver/*.parquet`): `intentos` (unido a NRC/materia/sede/modalidad/franja/cupoTotal y
  a programa/semestre/jornada del estudiante), `confirmaciones`, `cancelaciones`, `busquedas`,
  `dim_nrc`. `estudianteId` → `estudianteHash = sha256(HASH_SALT + ":" + estudianteId)`. Sin
  nombres, correos, docentes ni el id en claro. Se deduplica por `eventId`; son inválidos
  (contados por motivo, no escritos) el JSON roto, sin `eventId`/estudiante/NRC, tipo o
  resultado desconocido, fecha inválida o latencia negativa.
- Oro (`gold/*.parquet`): `demanda_nrc` (intentos, éxitos, sin_cupo, ocupación, cupos vacíos,
  `llenoEn`, `tiempoHastaLlenarseS`), `ocupacion_franja`, `combinaciones_nrc` (pares de NRC
  activos por programa y semestre, mínimo 2 estudiantes), `auditoria_intentos` (p50/p95 por
  tipo y resultado; `fecha` nula = total) y `demanda_insatisfecha` (materias con más
  `sin_cupo`, HU5). Más `gold/_meta/validacion.json` (`generadoEn`, KPIs y checks).
- Cuadratura: `líneas bronce = eventos plata + duplicados + inválidos`, y las sumas de oro
  (intentos, éxitos, sin_cupo, eventos) igualan a plata; además no puede haber datos personales.
- Ocupación actual = `cupoTotal − cupos libres en Redis` al recalcular (snapshot en `dim_nrc`);
  el momento de llenado se infiere con la ocupación inicial = ocupados − neto de los eventos.
  Tras un `make seed` hay que correr `make lake-limpiar`, o los eventos viejos mezclan estados.
- Publicación: plata y oro se calculan en `_stg/<id>/` y solo se publican si la cuadratura da
  OK; si no, queda el oro anterior. Bronce se cuenta por líneas físicas, independiente del parser.
- La API lee MinIO con el usuario `api-lector` (solo lectura sobre `gold`), nunca con root.
- **Límite conocido:** plata/oro se recalculan completos (DuckDB 192 MB, temporales ≤ 128 MB);
  techo del orden de 1–2 millones de eventos. En producción: plata incremental por `fecha=`.

## Datos de referencia (`data/reference/`)

Los insumos originales (informe, pensum, Excel de NRC, manual de marca) son del operador,
viven solo en su máquina (`docs/`, ignorado por git) y **ningún agente los usa ni los
versiona**. Todo lo necesario ya está extraído aquí:

- `pensum.json`: Ingeniería de Sistemas, SNIES 90714, 64 materias, 163 créditos,
  10 semestres; cada materia con `materiaId`, nombre, créditos, semestre, área y si es electiva.
- `prerrequisitos.yaml`: prerrequisitos por línea de área (los insumos no los traían) y
  créditos mínimos para Práctica profesional y Opción de grado.
- `nrc_distribucion.json`: estadísticas de NRC reales (sin filas reales): rango y mediana
  de cupos, proporción presencial/virtual/sincrónica, sesiones por NRC, franjas, bloques
  horarios frecuentes, sedes/edificios y patrones de salón. Guía para generar NRC creíbles.

No se generan ni versionan archivos Excel. El modelo canónico de NRC es el de Mongo.

## Identidad visual (resumen del manual)

- Claro: Azul UNIMINUTO `#003366` (primario), Dorado `#F2A900` (acento), Blanco, Gris `#555555`.
- Oscuro: fondo `#0A0F1D`, superficie `#121A2D`, primario `#1E6BFF`, acento `#F5B014`,
  texto `#E2E8F0` / `#94A3B8`.
- Tipografía digital: Montserrat (titulares) + Open Sans (texto), vía `next/font`.
- Tono: cercano, incluyente, ético, profesional e innovador.
- Logo: ancho mínimo digital 120 px; área de reserva = ancho de la "U" de UNIMINUTO.
  No deformar, no cambiar su tipografía, sin biseles/3D, no sobre fotos saturadas.
  Claro: azul y dorado sobre blanco. Oscuro: isotipo dorado `#F5B014`, texto `#E2E8F0`.
- Temas claro/oscuro con alternancia manual o automática (`prefers-color-scheme`).
- Nota: el manual propone glassmorphism y botón con degradado en modo oscuro; el prompt
  pide evitar la estética genérica de IA. `ui-designer` resuelve esta tensión en el brief
  y la presenta al operador.

## Estructura del repo

```
CLAUDE.md  Makefile  docker-compose.yml  .env.example
data/reference/          pensum, prerrequisitos y distribución de NRC (versionados)
data/seed/               generador sintético (Python); salidas en data/seed/out/ (ignorado)
design/                  brief de diseño y decisiones visuales
services/api/            FastAPI (app/, tests/)
services/enroll-worker/  confirmación contra sistema académico simulado
services/lake/           ingesta bronce, jobs plata/oro (DuckDB), simulador de trafico
web/                     Next.js App Router + Storybook + Playwright
tests/load/              k6 y prueba de concurrencia
```

## Convenciones

- Idioma: dominio y textos de UI en español (`estudiante`, `materia`, `cupos`);
  palabras técnicas en inglés cuando son estándar (`handler`, `client`).
- Python 3.12, gestionado con `uv`. Pydantic v2, tipado estricto (`mypy --strict`),
  `ruff` para lint/format, `pytest` para pruebas.
- TypeScript estricto, ESLint, Prettier. Next.js App Router, TanStack Query, Radix/shadcn
  restilizado, Tailwind solo como utilidades sobre tokens CSS, Motion, Lucide.
- API REST bajo `/api/v1`, OpenAPI automático en `/docs`. Errores con
  `{ "codigo": "sin_cupo", "mensaje": "...", "alternativa": {...} }`.
- Fechas en UTC ISO-8601; la UI muestra hora de Bogotá.
- Commits pequeños por tarea, mensaje en español en imperativo.
- No registrar datos personales en logs.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `make up` | levanta todo (`docker compose up -d --wait`) |
| `make down` | detiene y borra contenedores |
| `make seed` | genera datos sintéticos y los carga en Mongo y Redis |
| `make test` | pruebas unitarias e integración (api, worker, lake, web) |
| `make load-test` | concurrencia (500 vs 10 cupos) + k6 por Docker |
| `make e2e` | Playwright contra la app levantada |
| `make storybook` | Storybook en el puerto 6006 |
| `make lake` | espera a que bronce esté al día, recalcula plata → oro e imprime los conteos de validación (sale con 1 si no cuadran) |
| `make lake-limpiar` | vacía los buckets `bronze`, `silver` y `gold` (empezar una demo sin eventos viejos) |
| `make simular` | ~500 estudiantes sintéticos (no los demos 1–6) usan la API real: búsquedas, inscripciones, disputas por el último cupo, cancelaciones, fuera_de_jornada y prerrequisito. `ARGS="--estudiantes 800 --semilla 7"` |

k6 no está instalado localmente: se ejecuta con la imagen `grafana/k6`.

## Historias de usuario (informe, paso 3)

- **HU1** Ver solo lo que puedo inscribir: tras iniciar sesión, solo veo materias cuyos
  prerrequisitos aprobé.
- **HU2** Cupos y horarios reales: cada NRC muestra cupos, días y horas; si un NRC se
  llena mientras lo miro, la pantalla se actualiza sin recargar.
- **HU3** No ver cruces: con una clase martes y jueves 8:00 p. m. inscrita, no aparecen
  NRC en esos bloques.
- **HU4** Inscribir en un clic: con cupo, se reserva y confirma; si dos piden el último
  cupo a la vez, solo uno lo obtiene y el otro recibe una alternativa.
- **HU5** Planear la oferta: el coordinador ve la demanda histórica por NRC.

RNF: oferta < 1 s, cero sobrecupos, cada intento trazado, uso desde celular sin manual,
privacidad (Ley 1581 de 2012).
