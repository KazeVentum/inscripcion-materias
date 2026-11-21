"""Analítica de demostración: que /coordinacion/analitica no arranque vacía.

- Si oro ya existe (`gold/_meta/validacion.json`), no hace nada.
- Si bronce está vacío, corre el simulador de tráfico contra la API real (mismos estudiantes
  sintéticos y semilla que `make simular`).
- Después se recalcula plata → oro.

El lake-worker llama a `preparar()` al arrancar (ANALITICA_DEMO=1, default en compose) y hace él
mismo el recálculo, así no hay dos DuckDB a la vez. `python -m lake.demo` (servicio
`analitica-demo`, `make analitica`) hace todo en un proceso aparte; con `ANALITICA_FORZAR=1`
simula y recalcula aunque ya haya oro.
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
import time

from . import pipeline, s3, simulador
from .cli import _bronce_al_dia
from .config import Settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logging.getLogger("aiokafka").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)
log = logging.getLogger("lake.demo")

META_ORO = "_meta/validacion.json"


async def preparar(s: Settings, forzar: bool = False) -> bool:
    """Simula tráfico si hace falta. Devuelve True si después hay que recalcular plata y oro."""
    c = s3.cliente(s)
    s3.asegurar_buckets(c, s)
    if not forzar and s3.listar(c, s.bucket_oro, META_ORO):
        log.info("la capa oro ya existe; no se simula tráfico de demostración")
        return False
    if not forzar and s3.listar(c, s.bucket_bronce):
        log.info("bronce ya tiene eventos pero no hay oro; solo se recalcula")
        return True

    password = os.environ.get("DEMO_PASSWORD")
    if not password:
        raise RuntimeError("falta DEMO_PASSWORD para simular tráfico")
    estudiantes = int(os.environ.get("SIM_ESTUDIANTES", "500"))
    log.info("simulando tráfico de %d estudiantes sintéticos contra la API...", estudiantes)
    t0 = time.monotonic()
    cuenta = await simulador.simular(
        os.environ.get("API_URL", "http://api:8000"),
        password,
        estudiantes,
        int(os.environ.get("SEED", "20271")),
        12,
        30,
        0.05,
        s.mongo_url,
        s.redis_url,
        s.periodo,
    )
    log.info("simulación lista en %.1f s: %s", time.monotonic() - t0, dict(sorted(cuenta.items())))
    if not cuenta["sesiones"]:
        raise RuntimeError("ningún estudiante sintético pudo iniciar sesión")
    return True


def main() -> int:
    s = Settings()
    forzar = os.environ.get("ANALITICA_FORZAR", "0") == "1"
    if not asyncio.run(preparar(s, forzar)):
        return 0
    asyncio.run(_bronce_al_dia(s, espera_s=120.0))
    meta = pipeline.recalcular(s)
    pipeline.imprimir(meta)
    return 0 if meta["validacion"]["cuadra"] else 1


if __name__ == "__main__":
    sys.exit(main())
