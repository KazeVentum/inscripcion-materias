"""Envelope de eventos y productor Kafka (Redpanda). Publicar nunca rompe la petición."""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import time
import uuid
from datetime import UTC, datetime
from typing import Any

from aiokafka import AIOKafkaProducer

log = logging.getLogger("api.eventos")


def ahora_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def construir_evento(
    tipo: str,
    periodo: str,
    estudiante_id: str,
    resultado: str,
    *,
    nrc: str | None = None,
    materia_id: str | None = None,
    latencia_ms: int = 0,
    alternativa_nrc: str | None = None,
    **extra: Any,
) -> dict[str, Any]:
    """Envelope de CLAUDE.md; ``extra`` agrega campos opcionales (p. ej. ``motivo``)."""
    evento: dict[str, Any] = {
        "eventId": str(uuid.uuid4()),
        "tipo": tipo,
        "ocurridoEn": ahora_iso(),
        "periodo": periodo,
        "estudianteId": estudiante_id,
        "nrc": nrc,
        "materiaId": materia_id,
        "resultado": resultado,
        "latenciaMs": latencia_ms,
        "alternativaNrc": alternativa_nrc,
    }
    evento.update(extra)
    return evento


class Productor:
    """Productor Kafka con arranque perezoso: si Redpanda no estaba al iniciar, reintenta con
    backoff (sin bloquear una petición más de ~200 ms)."""

    def __init__(self, brokers: str) -> None:
        self._brokers = brokers
        self._producer: AIOKafkaProducer | None = None
        self.activo = False
        self._lock = asyncio.Lock()
        self._proximo_intento = 0.0
        self._espera = 1.0

    def _nuevo(self) -> AIOKafkaProducer:
        return AIOKafkaProducer(
            bootstrap_servers=self._brokers,
            linger_ms=2,
            value_serializer=lambda v: json.dumps(v, ensure_ascii=False).encode(),
            key_serializer=lambda k: k.encode(),
            request_timeout_ms=5000,
        )

    async def asegurar(self, timeout: float = 0.2) -> bool:
        if self.activo:
            return True
        if self._lock.locked():
            return False  # otro request ya está intentando arrancar
        async with self._lock:
            if self.activo:
                return True
            if time.monotonic() < self._proximo_intento:
                return False
            productor = self._nuevo()
            try:
                await asyncio.wait_for(productor.start(), timeout)
            except Exception as exc:  # broker caído: backoff exponencial hasta 30 s
                log.warning("Kafka no disponible: %s", type(exc).__name__)
                with contextlib.suppress(Exception):
                    await asyncio.wait_for(productor.stop(), 1.0)
                self._proximo_intento = time.monotonic() + self._espera
                self._espera = min(self._espera * 2, 30.0)
                return False
            self._producer = productor
            self.activo = True
            self._espera = 1.0
            return True

    async def iniciar(self) -> None:
        await self.asegurar(timeout=5.0)

    async def detener(self) -> None:
        if self.activo and self._producer is not None:
            await self._producer.stop()
            self.activo = False

    async def publicar(self, topic: str, clave: str, evento: dict[str, Any]) -> None:
        """Encola el evento sin esperar el ack (no suma latencia a la petición)."""
        if not await self.asegurar() or self._producer is None:
            log.warning("evento %s descartado: productor inactivo", evento.get("tipo"))
            return
        try:
            futuro = await self._producer.send(topic, value=evento, key=clave)
            futuro.add_done_callback(_registrar_fallo)
        except Exception as exc:
            log.warning("fallo al publicar en %s: %s", topic, type(exc).__name__)

    async def publicar_confirmado(
        self, topic: str, clave: str, evento: dict[str, Any], timeout: float = 1.5
    ) -> bool:
        """Espera el ack del broker. False si no se pudo entregar (el llamador debe deshacer)."""
        if not await self.asegurar() or self._producer is None:
            return False
        try:
            await asyncio.wait_for(
                self._producer.send_and_wait(topic, value=evento, key=clave), timeout
            )
            return True
        except Exception as exc:
            log.warning("entrega confirmada fallida en %s: %s", topic, type(exc).__name__)
            return False

    async def salud(self) -> bool:
        if not self.activo or self._producer is None:
            return False
        try:
            md = await asyncio.wait_for(self._producer.client.fetch_all_metadata(), 3.0)
            return len(md.brokers()) > 0
        except Exception:
            return False


def _registrar_fallo(futuro: Any) -> None:
    exc = futuro.exception()
    if exc is not None:
        log.warning("entrega Kafka fallida: %s", type(exc).__name__)
