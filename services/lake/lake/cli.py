"""`python -m lake.cli` — corre bronce -> plata -> oro a demanda (make lake)."""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
import time

from minio.deleteobjects import DeleteObject

from . import bronce, pipeline, s3
from .config import Settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logging.getLogger("aiokafka").setLevel(logging.WARNING)
log = logging.getLogger("lake.cli")


async def _bronce_al_dia(s: Settings, espera_s: float) -> None:
    """Deja bronce al dia.

    Con el lake-worker vivo (miembro del grupo `lake-bronce`) solo espera a que el lag llegue
    a 0 y, si no llega, falla: ingerir desde aqui con el mismo grupo provocaria un rebalanceo
    y competiria por los offsets. Sin worker, ingiere en este proceso.
    """
    if await bronce.grupo_activo(s):
        limite = time.monotonic() + espera_s
        pendiente = await bronce.lag(s)
        while pendiente and time.monotonic() < limite:
            await asyncio.sleep(1.5)
            pendiente = await bronce.lag(s)
        if pendiente:
            raise SystemExit(
                f"el lake-worker sigue vivo y quedan {pendiente} mensajes sin ingerir tras "
                f"{espera_s:.0f} s; reintente con --espera-s mayor o detenga el lake-worker"
            )
        return
    log.info("no hay lake-worker en el grupo; se ingiere desde este proceso")
    await bronce.ingerir(s, asyncio.Event(), heartbeat=False, hasta_vaciar=True)


def limpiar(s: Settings) -> None:
    """Vacia bronce, plata y oro (no toca Redpanda: los offsets del grupo siguen donde estaban)."""
    c = s3.cliente(s)
    s3.asegurar_buckets(c, s)
    for bucket in (s.bucket_bronce, s.bucket_plata, s.bucket_oro):
        objetos = s3.listar(c, bucket)
        for _ in c.remove_objects(bucket, [DeleteObject(o) for o in objetos]):
            pass  # remove_objects es perezoso; iterar ejecuta el borrado
        print(f"  {bucket}: {len(objetos)} objetos borrados")


def main() -> int:
    ap = argparse.ArgumentParser(description="Data lake: bronce -> plata -> oro")
    ap.add_argument("--sin-bronce", action="store_true", help="omite la espera/ingesta a bronce")
    ap.add_argument("--espera-s", type=float, default=15.0)
    ap.add_argument(
        "--limpiar",
        action="store_true",
        help="vacia bronce, plata y oro (tras dejar el lag en 0) y termina",
    )
    args = ap.parse_args()
    s = Settings()
    if args.limpiar:
        asyncio.run(_bronce_al_dia(s, args.espera_s))
        limpiar(s)
        return 0
    if not args.sin_bronce:
        asyncio.run(_bronce_al_dia(s, args.espera_s))
    meta = pipeline.recalcular(s)
    pipeline.imprimir(meta)
    return 0 if meta["validacion"]["cuadra"] else 1


if __name__ == "__main__":
    sys.exit(main())
