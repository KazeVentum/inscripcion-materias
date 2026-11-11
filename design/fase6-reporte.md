# Fase 6 — Data lake y analítica de coordinación

## Qué se construyó

- `lake-worker`: ingesta continua de `inscripcion.intentos`, `inscripcion.resultados` y
  `oferta.busquedas` a **bronce** (JSON lines, offset confirmado solo tras escribir), y cada 5 min
  recálculo de **plata** (Parquet, ids seudonimizados con SHA-256 + sal) y **oro** con DuckDB.
- Oro: `demanda_nrc`, `ocupacion_franja`, `combinaciones_nrc`, `auditoria_intentos`,
  `demanda_insatisfecha` + `_meta/validacion.json`.
- `make simular`: ~500 estudiantes sintéticos usan la API real (búsquedas, inscripciones, disputas
  por el último cupo, cancelaciones, rechazos por jornada y prerrequisito).
- Rol `coordinador` (`coord-0001`), endpoints `/api/v1/coordinacion/analitica/*` y página
  `/coordinacion/analitica` (HU5): KPIs, dónde abrir más grupos, ocupación por franja y sede,
  demanda por NRC, combinaciones frecuentes y auditoría con p50/p95.

## Verificado (2026-11-10)

| Prueba | Resultado |
| --- | --- |
| `make lake` tras `make simular` | 5570 líneas bronce = 5570 eventos plata, 0 duplicados, 0 inválidos; 10/10 checks OK |
| `make test` | seed 34 · api 130 · worker 19 · lake 19 · web 220 · stories 138 — todo verde |
| `make e2e` | 33/33 (incluye separación de roles en ambos sentidos) |
| `make lint` | ruff + mypy --strict + typecheck/eslint verdes |
| Capturas | `web/tests/screenshots/fase6/` móvil/escritorio × claro/oscuro |

## Hallazgos de revisión corregidos

- La pantalla de inscripción abría el SSE antes de que la guardia redirigiera al coordinador.
- La cuadratura bronce → plata era tautológica: ahora cuenta líneas físicas; lo ilegible se
  cuenta como inválido (`linea_ilegible`, `mensaje_vacio`).
- Con MinIO caído la ingesta acumulaba mensajes sin tope: ahora pausa la lectura con backoff.
- Plata y oro se escriben en staging y solo se publican si cuadran.
- La API usa un usuario MinIO de solo lectura sobre `gold` (no puede leer bronce).
- `make lake` ya no compite con el lake-worker en el mismo grupo de consumidores.
- Logs de login sin id; caché de analítica no se muta; meta incompleta responde vacío (no 500).

## Límites conocidos (para la sustentación)

- Recálculo completo: techo del orden de 1–2 millones de eventos con 192 MB; producción haría
  plata incremental por fecha.
- Es **seudonimización**, no anonimización: con la sal se puede recorrer el espacio de ids.
  `combinaciones_nrc` exige mínimo 2 estudiantes (k=2).
- Tras `make seed`, correr `make lake-limpiar` antes de simular.
- El límite de 10 logins fallidos por minuto es por usuario: alguien podría bloquear a otro.

## Demo

```
make up && make seed && make lake-limpiar && make simular && make lake
```

Luego entrar en http://localhost:3000 como `coord-0001`.
