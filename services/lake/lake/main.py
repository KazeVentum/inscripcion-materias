"""lake-worker: ingesta continua a bronce y recalculo periodico de plata y oro."""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import signal
import time

from . import bronce, demo, pipeline
from .config import Settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logging.getLogger("aiokafka").setLevel(logging.WARNING)
log = logging.getLogger("lake.worker")


async def _analitica_demo(s: Settings) -> bool:
    """Si el lake esta vacio simula trafico y espera a que bronce lo ingiera.

    Devuelve True si conviene recalcular ya. Un fallo aqui no detiene la ingesta.
    """
    try:
        if not await demo.preparar(s):
            return False
        limite = time.monotonic() + 120
        while await bronce.lag(s) and time.monotonic() < limite:
            await asyncio.sleep(1.5)
        return True
    except Exception:
        log.exception("no se pudo generar la analitica de demostracion; sigue la ingesta normal")
        return False


async def _recalculo(s: Settings, parar: asyncio.Event) -> None:
    # primer calculo poco despues de arrancar y luego cada `recalculo_min` minutos.
    # Con ANALITICA_DEMO=1 y el lake vacio, antes simula trafico y recalcula en cuanto bronce
    # esta al dia (un solo DuckDB a la vez: mismo bucle).
    espera = 20.0
    if os.environ.get("ANALITICA_DEMO", "0") == "1" and await _analitica_demo(s):
        espera = 0.0
    while not parar.is_set():
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(parar.wait(), timeout=espera)
        if parar.is_set():
            break
        espera = s.recalculo_min * 60
        try:
            meta = await asyncio.to_thread(pipeline.recalcular, s)
            v = meta["validacion"]
            log.info(
                "plata/oro recalculados: bronce=%d plata=%d duplicados=%d invalidos=%d cuadra=%s",
                v["bronce"]["lineas"],
                v["plata"]["eventos"],
                v["plata"]["duplicados"],
                v["plata"]["invalidos"],
                v["cuadra"],
            )
        except Exception:
            log.exception("fallo el recalculo de plata/oro; se reintenta en el siguiente ciclo")


async def correr() -> None:
    s = Settings()
    parar = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, parar.set)
    tarea = asyncio.create_task(_recalculo(s, parar))
    try:
        await bronce.ingerir(s, parar)
    finally:
        parar.set()
        await tarea


def main() -> None:
    asyncio.run(correr())


if __name__ == "__main__":
    main()
