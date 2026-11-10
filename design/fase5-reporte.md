# Fase 5 — Pantallas del estudiante con cupos en vivo

## Qué se hizo
- `/login`: código o correo sintético + contraseña, isotipo (`web/public/logo-uniminuto.png`, 120 px; 168 en escritorio) sobre placa azul en claro y directo sobre el fondo en oscuro (token nuevo `--placa-logo`). Mensajes para 401, 429 (con cuenta atrás por `Retry-After`) y sin red. Cuentas demo est-000001..5 sugeridas; la contraseña no está en el código del cliente.
- `/inscripcion`: materias habilitadas por semestre (HU1), NRC con cupos/días/horas (HU2), vista previa en la semana al pasar/tocar, inscribir en un clic con estados Inscribir → Inscribiendo… → Reservado (contador) → Inscrita (HU4), polling de `GET /inscripciones/{nrc}`, aviso de alternativa en lugar de la tarjeta agotada (409 de la API, o calculada en el cliente si el SSE anuncia el agotamiento), cancelar con diálogo de confirmación. Móvil: pestañas Materias/Semana, semana compacta fija y bandeja de acción; escritorio: lista 420 px + semana completa.
- `/horario`: semana con lo inscrito/reservado, lista con cancelar, exportar `.ics` (America/Bogota, RRULE semanal).
- `/coordinacion/analitica`: solo estado vacío ("los datos llegarán en la fase 6").
- Cupos en vivo: `POST /stream/ticket` → `EventSource /api/v1/stream/cupos?ticket=`; en cada caída se cierra la fuente y se pide ticket nuevo con espera exponencial; tras reconectar se invalidan las cachés. Estados: en vivo / reconectando / sin conexión (franja, cupos atenuados, Inscribir deshabilitado con motivo).
- Proxy: `rewrites` de Next (`/api/v1/*` → `API_INTERNAL_URL`, `http://api:8000` en Docker). Necesitó `compress: false` y `experimental.proxyTimeout` de 2 h (por defecto corta a 30 s). Verificado: el primer evento y los `cupo` llegan en ~40 ms por el proxy.
- Docker: `web/Dockerfile` multi-stage (Node 24 alpine, standalone, usuario 10001), servicio `web` en 127.0.0.1:3000, `mem_limit 320m`, `read_only` + tmpfs `/tmp`, `cap_drop ALL`, healthcheck. `make up` lo levanta. `make e2e` corre Playwright; `make screenshots` toma las capturas.

## Decisiones
- JWT en `sessionStorage`: sobrevive al F5, muere con la pestaña, no es cookie (sin CSRF) y nunca va en una URL. Un XSS lo leería igual que a una variable en memoria; en memoria cada recarga pediría la clave otra vez. Estudiante nunca en claro fuera de la sesión de la pestaña.
- Las listas de NRC usan `staleTime: Infinity`: un NRC que se agota queda en pantalla con su alternativa en vez de desaparecer en un refetch. Se refrescan al cambiar el horario (inscribir/cancelar) o tras reconectar el stream.
- Con una reserva viva, `/horario` se refresca cada 3 s hasta que el worker confirme (cubre recargas a mitad de reserva).
- `.ics`: el sistema no entrega fechas del periodo; se asume 2027-1 = 16 semanas desde el lunes 25-ene-2027 (constantes en `src/lib/ics.ts`). Solo exporta inscripciones confirmadas con horario (los NRC virtuales no tienen bloques).
- Un solo layout se renderiza a la vez (hook `useMediaQuery`), no dos copias por CSS, para no duplicar ids ni consultas.

## Pruebas y resultados
- `npm run typecheck`, `npm run lint` (ESLint + Prettier): limpios.
- `npm test`: 156 pruebas Vitest en 11 archivos (cliente API, sesión, stream con EventSource falso y reconexión/ticket nuevo/resincronización, `.ics`, espera de confirmación, mensajes de error, alternativa local, caché de cupos, hooks `useCuposEnVivo` y `useInscripcion` en jsdom con API simulada).
- `npm run test:stories`: 113 pruebas en 20 archivos (incluye a11y de la nueva story `UI/Campo`).
- `make test`: seed 29, api 81, worker 19, web 156 + 113: verde.
- `make e2e` (stack real, tras `make seed`): 19/19 verdes. HU1 (lista = API; Práctica solo para est-000004), HU2 (cambios por Pub/Sub llegan sin recargar hasta "Se agotó"; sin conexión), HU3 (contra Mongo: existe un NRC que cruza y no se ve), HU4 (inscribir→confirmar→cancelar; último cupo tomado por otro estudiante → alternativa → inscrita; 409 sin_cupo con evento perdido; cruce tras reservar), login (401, 429, JWT fuera de URLs), horario/.ics, analítica, móvil 390.
- Capturas: `web/tests/screenshots/fase5/` (login, inscripción, horario, analítica × móvil/escritorio × claro/oscuro).

## Pendientes / notas
- `Campo` (input) es componente nuevo fuera del sistema de `ui-designer`: debe revisarlo; igual el token `--placa-logo`.
- No hay prueba de contraste automática de las pantallas reales (solo las stories); revisión visual a cargo de `ui-designer`.
- Los E2E mutan Redis/Mongo (cupos del NRC 92117, inscripciones demo) y los restauran; si un test se interrumpe, `make seed` restablece el estado. Corren en serie (1 worker).
- El estado vacío de `/horario` y los de error no tienen E2E (se verificaron por diseño/typecheck, no en navegador).
- Analítica real y el rol de coordinación llegan en la fase 6.
