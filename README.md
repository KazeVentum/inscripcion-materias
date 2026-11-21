# Inscripción de asignaturas UNIMINUTO — simulación local

Simulación en Docker de la arquitectura de datos propuesta para la inscripción de asignaturas de
UNIMINUTO. La regla central: **el estudiante nunca ve un NRC que no pueda inscribir** (sin cupo,
con cruce de horario o sin prerrequisitos aprobados).

Cada servicio de Azure se reemplaza por un equivalente local:

| Azure (producción) | Local (Docker) | Puerto |
| --- | --- | --- |
| Cosmos DB API MongoDB | MongoDB 7 | 27017 |
| Azure Cache for Redis | Redis 7 (cupos atómicos con Lua) | 6379 |
| Event Hubs | Redpanda (API Kafka) | 19092 |
| ADLS Gen2 | MinIO (`bronze`, `silver`, `gold`) | 9000 / 9001 (consola) |
| Data Factory / Fabric | `lake-worker` (Python + DuckDB sobre Parquet) | — |
| App Service + Functions | API FastAPI + `enroll-worker` | 8000 |
| App Service (web) | Next.js | 3000 |
| Entra ID | Login simulado con JWT | — |
| Power BI | Página `/coordinacion/analitica` | — |

Todos los estudiantes y docentes son **sintéticos** (Faker `es_CO`, semilla `20271`). No hay
datos personales reales.

## Inicio rápido (un solo comando)

Solo necesitas **Docker** (Docker Desktop u OrbStack) abierto y con al menos **4 GB** de RAM.

```bash
git clone https://github.com/KazeVentum/inscripcion-materias.git
cd inscripcion-materias
make up
```

Eso es todo. `make up`:

1. Crea `.env` desde `.env.example` (valores solo de desarrollo, nada secreto).
2. Construye las imágenes y levanta Mongo, Redis, Redpanda y MinIO.
3. Crea los buckets del data lake y los tópicos de eventos.
4. **Genera y carga los datos sintéticos** (64 materias, 696 NRC, 3.500 estudiantes) si la base
   está vacía. Si ya tenía datos, los conserva.
5. Arranca la API, los workers y la web, y espera a que todo esté sano.
6. **Llena la analítica del coordinador** si el data lake está vacío: 500 estudiantes sintéticos
   usan la API real (búsquedas, inscripciones, disputas por el último cupo, cancelaciones) y se
   calcula plata → oro. Corre por detrás y tarda menos de un minuto después de que la web abre.

La primera vez tarda unos minutos (construye las imágenes); después, unos 30 segundos.

**¿No tienes `make`?** (p. ej. Windows sin WSL) — usa estos dos comandos, que hacen lo mismo:

```bash
cp .env.example .env            # en PowerShell: Copy-Item .env.example .env
docker compose up -d --build --wait
```

**¿Ya lo tenías clonado y te salía vacío, sin materias ni NRC?** Actualiza y vuelve a levantar;
la siembra detecta la base vacía y la llena sola:

```bash
git pull
make up
```

Cuando termina, abre:

| Qué | URL |
| --- | --- |
| Aplicación web | http://localhost:3000 |
| API (OpenAPI) | http://localhost:8000/docs |
| Consola MinIO | http://localhost:9001 (`minio-dev` / `minio-dev-secret`) |

Puertos que deben estar libres: 3000, 8000, 6379, 9000, 9001, 19092, 27017.

### Usuarios de demostración

Contraseña para todos: `uniminuto2027` (variable `DEMO_PASSWORD` de `.env`).

| Usuario | Para mostrar |
| --- | --- |
| `est-000001` | Estudiante de 1.er semestre |
| `est-000002` | Tiene clase MAR/JUE 20:30: no ve NRC que se crucen (HU3) |
| `est-000003` | Estudiante de 6.º semestre |
| `est-000004` | 9.º semestre, habilitado para Práctica profesional |
| `est-000005` | Estudiante con rezago (materias atrasadas) |
| `est-000006` | 3.er semestre, jornada **tarde** (los demás son de noche) |
| `coord-0001` | Coordinador: página de analítica (HU5) |

### Analítica del coordinador

La página de analítica (`coord-0001`) lee la capa oro del data lake. `make up` la llena sola la
primera vez (servicio `analitica-demo`); puedes ver el avance con
`docker compose logs -f analitica-demo`, que termina en `RESULTADO: los conteos cuadran`.

Para regenerarla con tráfico nuevo:

```bash
make analitica      # simula otra tanda de tráfico y recalcula plata → oro
```

Después de un `make seed`, empieza limpio para no mezclar eventos viejos:

```bash
make lake-limpiar && make analitica
```

El `lake-worker` además recalcula plata y oro cada 5 minutos con lo que llegue.

## Requisitos para desarrollar (opcional)

Para **usar** la app basta Docker. Para correr pruebas, lint, el data lake desde el host o
Storybook necesitas además:

- **make**
- **[uv](https://docs.astral.sh/uv/)** (gestiona Python 3.12 por sí solo) — `make test`, `make lake`,
  `make simular`.
- **Node.js 24** y npm — pruebas de la web, Storybook y E2E.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `make up` | Levanta todo y espera a que esté sano |
| `make down` | Detiene y borra los contenedores (conserva los datos) |
| `make clean` | Como `down`, pero borra también los volúmenes |
| `make ps` / `make logs` | Estado y logs de los servicios |
| `make seed` | Regenera y recarga los datos sintéticos dentro de Docker; borra las inscripciones de la demo (no correr con tráfico activo) |
| `make analitica` | Simula tráfico y recalcula la analítica, todo en Docker |
| `make simular` | Tráfico sintético contra la API desde el host, con `uv` (`ARGS="--estudiantes 800 --semilla 7"`) |
| `make lake` | Recalcula plata y oro; sale con 1 si los conteos no cuadran |
| `make lake-limpiar` | Vacía los buckets del data lake |
| `make test` | Pruebas unitarias e integración (seed, api, worker, lake, web, stories) |
| `make lint` | ruff + mypy `--strict` + typecheck + ESLint/Prettier |
| `make e2e` | Playwright contra la app levantada |
| `make storybook` | Sistema de diseño en http://localhost:6006 |

Antes de `make test`, `make e2e` o `make storybook`, instala las dependencias de la web una vez:

```bash
cd web && npm ci && npx playwright install chromium
```

`make test` y `make e2e` necesitan el stack levantado (`make up` ya lo deja sembrado). Los
E2E modifican cupos e inscripciones y los restauran; si se interrumpen, `make seed` deja todo
como al inicio.

## Cómo funciona una inscripción

1. `POST /api/v1/inscripciones` valida prerrequisitos y jornada contra Mongo.
2. Un script **Lua atómico** en Redis comprueba la materia repetida, el cruce de horario y el cupo,
   y reserva el cupo en una sola operación (cero sobrecupos).
3. La API publica el intento en Redpanda (`inscripcion.intentos`).
4. `enroll-worker` confirma contra el "sistema académico" simulado (Mongo). Si falla, devuelve el
   cupo; cada 30 s concilia las reservas vencidas.
5. Cada cambio de cupo sale por Redis Pub/Sub y la web lo recibe por **SSE**: la pantalla se
   actualiza sin recargar.
6. `lake-worker` copia todos los eventos a bronce y calcula plata y oro (Parquet + DuckDB) para la
   analítica.

Detalle completo de decisiones, modelo de datos y eventos: [`CLAUDE.md`](CLAUDE.md). Diseño:
[`design/brief.md`](design/brief.md). Reportes de fase: [`design/`](design/).

## Estructura

```
data/reference/          pensum, prerrequisitos y distribución de NRC
data/seed/               generador de datos sintéticos
services/api/            API FastAPI
services/enroll-worker/  confirmación de inscripciones y conciliación
services/lake/           data lake (bronce → plata → oro) y simulador de tráfico
services/lua/            scripts atómicos de Redis
web/                     Next.js + Storybook + Playwright
design/                  brief de diseño y reportes de fase
```

## Solución de problemas

- **Un puerto está ocupado:** detén el proceso que lo usa (p. ej. un Mongo o Redis local) y
  vuelve a correr `make up`.
- **Un contenedor se reinicia o queda `unhealthy`:** revisa `make logs` y la memoria asignada a
  Docker (mínimo 4 GB).
- **La analítica sale vacía:** espera un minuto tras `make up` y revisa
  `docker compose logs analitica-demo`. Para forzarla: `make analitica`.
- **Cifras raras en la analítica tras `make seed`:** quedaron eventos viejos; corre
  `make lake-limpiar && make analitica`.
- **La web no muestra materias ni NRC:** revisa `docker compose logs seed`; debe terminar en
  `OK: Mongo y Redis son consistentes` o en `Datos sintéticos ya cargados`. Para forzar la
  recarga: `make seed`.
- **Empezar de cero:** `make clean && make up` (borra los volúmenes y vuelve a sembrar).

## Límites conocidos de la simulación

- Redis es la única copia viva de los cupos durante el periodo; si se pierde, se reconstruye con
  `make seed` (en producción haría falta un job Mongo → Redis).
- Plata y oro se recalculan completos (techo de 1–2 millones de eventos); en producción serían
  incrementales.
- Los ids de estudiante en el lake están **seudonimizados** (SHA-256 con sal), no anonimizados.
- El límite de 10 logins fallidos por minuto es por usuario.
