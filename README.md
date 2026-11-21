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

Solo necesitas **Docker Desktop** (Windows, macOS o Linux) abierto y con al menos **4 GB** de
RAM. No hace falta `make`, Python, Node ni crear archivos de configuración.

```bash
git clone https://github.com/KazeVentum/inscripcion-materias.git
cd inscripcion-materias
```

Y luego **un** comando, según tu sistema:

| Sistema | Comando |
| --- | --- |
| Windows (CMD o PowerShell) | `.\iniciar.cmd` (o doble clic en `iniciar.cmd`) |
| macOS / Linux / WSL / Git Bash | `./iniciar.sh` |
| Cualquiera, directo con Docker | `docker compose up -d --build --wait` |

Los tres hacen lo mismo; los scripts además verifican que Docker esté instalado y corriendo, y
al final muestran las URLs y los usuarios. Si `./iniciar.sh` responde "permiso denegado"
(p. ej. al descargar el ZIP en vez de clonar), usa `sh iniciar.sh`.

Al levantar se hace todo solo:

1. Construye las imágenes y levanta Mongo, Redis, Redpanda y MinIO.
2. Crea los buckets del data lake y los tópicos de eventos.
3. **Carga los datos sintéticos** (64 materias, 696 NRC, 3.500 estudiantes) si la base está
   vacía. Si ya tenía datos, los conserva.
4. Arranca la API, los workers y la web, y espera a que todo esté sano.
5. **Llena la analítica del coordinador** si el data lake está vacío: 500 estudiantes sintéticos
   usan la API real (búsquedas, inscripciones, disputas por el último cupo, cancelaciones) y se
   calcula plata → oro. Corre por detrás y termina menos de un minuto después de que abre la web.

La primera vez tarda unos minutos (construye las imágenes); después, unos 30 segundos.

`.env` es **opcional**: `docker-compose.yml` trae por defecto los mismos valores de desarrollo de
`.env.example` (ninguno es un secreto real). Crea un `.env` solo si quieres cambiar alguno.

**¿Ya lo tenías clonado y te salía vacío, sin materias ni NRC?** Actualiza y vuelve a levantar;
la base vacía se llena sola:

```bash
git pull
docker compose up -d --build --wait
```

Cuando termina, abre:

| Qué | URL |
| --- | --- |
| Aplicación web | http://localhost:3000 |
| API (OpenAPI) | http://localhost:8000/docs |
| Consola MinIO | http://localhost:9001 (`minio-dev` / `minio-dev-secret`) |

Puertos que deben estar libres: 3000, 8000, 6379, 9000, 9001, 19092, 27017.

### Usuarios de demostración

Contraseña para todos: `uniminuto2027` (variable `DEMO_PASSWORD`).

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

La página de analítica (`coord-0001`) lee la capa oro del data lake. El `lake-worker` la llena
sola la primera vez y después la recalcula cada 5 minutos con el tráfico nuevo. El avance se ve
con `docker compose logs -f lake-worker` (línea `plata/oro recalculados ... cuadra=True`).

## Comandos útiles (solo Docker, cualquier sistema)

| Qué | Comando |
| --- | --- |
| Levantar todo | `docker compose up -d --build --wait` |
| Ver el estado | `docker compose ps` |
| Ver logs | `docker compose logs -f --tail=100` (o `... logs -f api`) |
| Detener (conserva los datos) | `docker compose down` |
| Borrar todo y empezar de cero | `docker compose down -v` y volver a levantar |
| Recargar los datos sintéticos¹ | `docker compose run --rm -e SEED_FORZAR=1 seed` |
| Generar otra tanda de analítica | `docker compose --profile demo run --rm analitica-demo` |
| Vaciar el data lake | `docker compose exec lake-worker python -m lake.cli --limpiar` |
| Recalcular plata → oro ya | `docker compose exec lake-worker python -m lake.cli` |

¹ Borra las inscripciones hechas durante la demo. Después conviene vaciar el data lake y generar
otra tanda de analítica, para no mezclar eventos viejos con los cupos nuevos.

## Requisitos para desarrollar (opcional)

Para **usar** la app basta Docker. Para correr pruebas, lint, el simulador desde el host o
Storybook necesitas además:

- **make**
- **[uv](https://docs.astral.sh/uv/)** (gestiona Python 3.12 por sí solo) — `make test`, `make lake`,
  `make simular`.
- **Node.js 24** y npm — pruebas de la web, Storybook y E2E.

### Atajos con `make`

Para quien tiene `make`. `up`, `down`, `seed` y `analitica` equivalen a los comandos de Docker
de la tabla anterior; el resto son herramientas de desarrollo.

| Comando | Qué hace |
| --- | --- |
| `make up` | Igual que `docker compose up -d --build --wait` (y crea `.env`) |
| `make down` | Detiene y borra los contenedores (conserva los datos) |
| `make clean` | Como `down`, pero borra también los volúmenes |
| `make ps` / `make logs` | Estado y logs de los servicios |
| `make seed` | Regenera y recarga los datos sintéticos dentro de Docker; borra las inscripciones de la demo (no correr con tráfico activo) |
| `make analitica` | Simula otra tanda de tráfico y recalcula la analítica, todo en Docker |
| `make simular` | Tráfico sintético contra la API desde el host, con `uv` (`ARGS="--estudiantes 800 --semilla 7"`) |
| `make lake` | Recalcula plata y oro desde el host; sale con 1 si los conteos no cuadran |
| `make lake-limpiar` | Vacía los buckets del data lake |
| `make test` | Pruebas unitarias e integración (seed, api, worker, lake, web, stories) |
| `make lint` | ruff + mypy `--strict` + typecheck + ESLint/Prettier |
| `make e2e` | Playwright contra la app levantada |
| `make storybook` | Sistema de diseño en http://localhost:6006 |

Antes de `make test`, `make e2e` o `make storybook`, instala las dependencias de la web una vez:

```bash
cd web && npm ci && npx playwright install chromium
```

`make test` y `make e2e` necesitan el stack levantado (al levantarlo ya queda sembrado). Los
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

- **"Docker no está corriendo" / `cannot connect to the Docker daemon`:** abre Docker Desktop,
  espera a que diga que está listo y vuelve a correr el comando.
- **Un puerto está ocupado:** detén el proceso que lo usa (p. ej. un Mongo o Redis local) y
  vuelve a levantar.
- **Un contenedor se reinicia o queda `unhealthy`:** revisa `docker compose logs <servicio>` y la
  memoria asignada a Docker (mínimo 4 GB en Docker Desktop → Settings → Resources).
- **La analítica sale vacía:** espera un minuto tras levantar y revisa
  `docker compose logs lake-worker`. Para forzarla:
  `docker compose --profile demo run --rm analitica-demo`.
- **Cifras raras en la analítica tras recargar los datos:** quedaron eventos viejos; vacía el
  data lake (`docker compose exec lake-worker python -m lake.cli --limpiar`) y genera otra tanda
  (`docker compose --profile demo run --rm analitica-demo`).
- **La web no muestra materias ni NRC:** revisa `docker compose logs seed`; debe terminar en
  `OK: Mongo y Redis son consistentes` o en `Datos sintéticos ya cargados`. Para forzar la
  recarga: `docker compose run --rm -e SEED_FORZAR=1 seed`.
- **Empezar de cero:** `docker compose down -v` y vuelve a levantar (borra datos y analítica).
- **Windows: errores raros de scripts dentro de los contenedores** (`\r: command not found`): el
  repo fija finales de línea LF con `.gitattributes`; si clonaste antes de este cambio, vuelve a
  clonar.

## Límites conocidos de la simulación

- Redis es la única copia viva de los cupos durante el periodo; si se pierde, se reconstruye
  recargando los datos sintéticos (en producción haría falta un job Mongo → Redis).
- Plata y oro se recalculan completos (techo de 1–2 millones de eventos); en producción serían
  incrementales.
- Los ids de estudiante en el lake están **seudonimizados** (SHA-256 con sal), no anonimizados.
- El límite de 10 logins fallidos por minuto es por usuario.
