"""SSE: el difusor reenvía lo publicado en el canal Redis ``cupos:{periodo}``."""

from __future__ import annotations

import asyncio
import json
import time
import uuid

import pytest
from redis.asyncio import Redis

from app import stream
from app.stream import Difusor

from .conftest import requiere_servicios

pytestmark = [pytest.mark.integration, requiere_servicios]


async def test_difusor_reenvia_cambios_de_cupo(redis: Redis) -> None:
    canal = f"cupos:tst-{uuid.uuid4().hex[:8]}"
    difusor = Difusor(redis, canal)
    difusor.iniciar()
    try:
        flujo = difusor.eventos()
        assert (await anext(flujo)).startswith("retry:")
        await asyncio.sleep(0.5)  # la suscripción a Redis ya está activa
        await redis.publish(canal, json.dumps({"nrc": "123", "libres": 7}))
        trozo = await asyncio.wait_for(anext(flujo), timeout=3)
        assert trozo.startswith("event: cupo\n")
        datos = json.loads(trozo.split("data: ")[1])
        assert datos == {"nrc": "123", "libres": 7}
        await flujo.aclose()
        assert difusor.clientes == 0
    finally:
        await difusor.detener()


async def test_difusor_envia_heartbeat(redis: Redis, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(stream, "HEARTBEAT_S", 0.1)
    difusor = Difusor(redis, f"cupos:tst-{uuid.uuid4().hex[:8]}")
    flujo = difusor.eventos()
    await anext(flujo)  # retry
    assert await asyncio.wait_for(anext(flujo), timeout=2) == "event: ping\ndata: {}\n\n"
    await flujo.aclose()


async def test_difusor_limita_conexiones_por_estudiante(redis: Redis) -> None:
    difusor = Difusor(redis, "cupos:tst-x", max_por_estudiante=3)
    abiertas = [difusor.abrir("est-1") for _ in range(3)]
    assert all(c is not None for c in abiertas)
    assert difusor.abrir("est-1") is None
    assert difusor.abrir("est-2") is not None  # el límite es por estudiante
    abiertas[0].cerrar()  # type: ignore[union-attr]
    abiertas[0].cerrar()  # type: ignore[union-attr]  # idempotente: no libera dos veces
    assert difusor.abrir("est-1") is not None
    assert difusor.abrir("est-1") is None


async def test_stream_se_cierra_cuando_vence_la_sesion(redis: Redis) -> None:
    difusor = Difusor(redis, "cupos:tst-y")
    conexion = difusor.abrir("est-1")
    assert conexion is not None
    flujo = difusor.eventos(hasta=time.time() + 0.3, conexion=conexion)
    assert (await anext(flujo)).startswith("retry:")
    assert "sesion_expirada" in await asyncio.wait_for(anext(flujo), timeout=2)
    with pytest.raises(StopAsyncIteration):
        await anext(flujo)
    assert difusor.abrir("est-1") is not None and difusor.clientes == 0
