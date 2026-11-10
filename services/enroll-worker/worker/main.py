"""Punto de entrada: consume ``inscripcion.intentos`` y concilia reservas cada 30 s."""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import signal
from collections import defaultdict
from pathlib import Path
from typing import Any

from aiokafka import AIOKafkaConsumer, AIOKafkaProducer
from pymongo import AsyncMongoClient
from redis.asyncio import Redis

from .config import Settings
from .proceso import Confirmador

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("worker")


async def _latido(ruta: str, parar: asyncio.Event) -> None:
    """Archivo que el healthcheck de Docker revisa (el worker no expone HTTP)."""
    while not parar.is_set():
        Path(ruta).touch()
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(parar.wait(), timeout=5)


async def _conciliador(conf: Confirmador, intervalo: float, parar: asyncio.Event) -> None:
    while not parar.is_set():
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(parar.wait(), timeout=intervalo)
        if parar.is_set():
            break
        try:
            n = await conf.conciliar()
            if n:
                log.info("conciliación: %d reservas devueltas", n)
        except Exception:
            log.exception("fallo en la conciliación")


async def _procesar_lote(conf: Confirmador, mensajes: list[Any]) -> None:
    """Mensajes de distintos estudiantes en paralelo; los de un mismo estudiante, en orden.

    ``manejar_mensaje`` valida, reintenta y manda a la DLQ: un evento envenenado no frena el bucle.
    """
    por_estudiante: dict[str, list[bytes]] = defaultdict(list)
    for m in mensajes:
        clave = m.key.decode(errors="replace") if m.key else "?"
        por_estudiante[clave].append(m.value)

    async def en_orden(valores: list[bytes]) -> None:
        for v in valores:
            await conf.manejar_mensaje(v)

    await asyncio.gather(*(en_orden(v) for v in por_estudiante.values()))


async def correr() -> None:
    s = Settings()
    mongo: AsyncMongoClient[dict[str, Any]] = AsyncMongoClient(s.mongo_url)
    db = mongo.get_default_database()
    redis = Redis.from_url(s.redis_url, decode_responses=True)
    await db["eventos_procesados"].create_index("procesadoEn", expireAfterSeconds=86400)

    productor = AIOKafkaProducer(
        bootstrap_servers=s.kafka_brokers,
        value_serializer=lambda v: json.dumps(v, ensure_ascii=False).encode(),
        key_serializer=lambda k: k.encode(),
    )
    consumidor = AIOKafkaConsumer(
        s.topic_intentos,
        bootstrap_servers=s.kafka_brokers,
        group_id=s.grupo,
        enable_auto_commit=False,
        auto_offset_reset="earliest",
    )
    await productor.start()
    await consumidor.start()

    async def publicar(topic: str, clave: str, evento: dict[str, Any]) -> None:
        await productor.send_and_wait(topic, value=evento, key=clave)

    conf = Confirmador(s, redis, db, publicar)
    parar = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, parar.set)

    tareas = [
        asyncio.create_task(_latido(s.heartbeat_file, parar)),
        asyncio.create_task(_conciliador(conf, s.conciliacion_s, parar)),
    ]
    log.info("enroll-worker listo (grupo %s)", s.grupo)
    try:
        while not parar.is_set():
            lote = await consumidor.getmany(timeout_ms=1000, max_records=200)
            mensajes = [m for msgs in lote.values() for m in msgs]
            if not mensajes:
                continue
            await _procesar_lote(conf, mensajes)
            await consumidor.commit()
    finally:
        parar.set()
        for t in tareas:
            await t
        await consumidor.stop()
        await productor.stop()
        await redis.aclose()
        await mongo.close()


def main() -> None:
    asyncio.run(correr())


if __name__ == "__main__":
    main()
