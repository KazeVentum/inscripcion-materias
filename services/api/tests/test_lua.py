"""Integración: scripts Lua contra el Redis de Docker (claves de un periodo de prueba aislado)."""

from __future__ import annotations

import asyncio
import json
import random
import time
import uuid
from collections.abc import AsyncIterator
from typing import Any

import pytest
from redis.asyncio import Redis
from redis.commands.core import AsyncScript

from app import scripts

from .conftest import requiere_servicios

pytestmark = [pytest.mark.integration, requiere_servicios]

MARTES_2030 = [{"dia": "MAR", "inicio": "20:30", "fin": "21:59"}]


class Entorno:
    """Periodo y prefijo propios de la prueba; limpia todo lo que crea."""

    def __init__(self, redis: Redis) -> None:
        self.redis: Any = redis  # redis-py tipa mal los retornos async (Awaitable | T)
        self.run = uuid.uuid4().hex[:8]
        self.periodo = f"tst-{self.run}"
        self.reservar: AsyncScript = scripts.cargar(redis, "reservar")
        self.devolver: AsyncScript = scripts.cargar(redis, "devolver")
        self.claves: set[str] = set()

    def est(self, n: int) -> str:
        return f"tst-{self.run}-{n:04d}"

    async def crear_nrc(self, nrc: str, cupos: int, total: int | None = None) -> None:
        k1, k2 = f"cupos:{self.periodo}:{nrc}", f"cupototal:{self.periodo}:{nrc}"
        await self.redis.set(k1, cupos)
        await self.redis.set(k2, total if total is not None else cupos)
        self.claves.update({k1, k2})

    async def libres(self, nrc: str) -> int:
        return int(await self.redis.get(f"cupos:{self.periodo}:{nrc}") or -1)

    async def reservar_nrc(
        self,
        est: str,
        nrc: str,
        materia: str,
        bloques: list[dict[str, str]] | None = None,
        reserva_id: str = "rid",
    ) -> list[Any]:
        p = self.periodo
        member = f"{est}|{nrc}"
        self.claves.update({f"ocupado:{est}", f"reserva:{est}:{nrc}", "reservas:pendientes"})
        valor = json.dumps({"materiaId": materia, "bloques": bloques or []})
        res: list[Any] = await self.reservar(
            keys=[
                f"cupos:{p}:{nrc}",
                f"ocupado:{est}",
                f"reserva:{est}:{nrc}",
                "reservas:pendientes",
            ],
            args=[
                nrc,
                valor,
                int(time.time() * 1000) + 300_000,
                300,
                member,
                f"cupos:{p}",
                reserva_id,
            ],
        )
        return res

    async def devolver_nrc(self, est: str, nrc: str, conciliar: bool = False) -> list[Any]:
        p = self.periodo
        res: list[Any] = await self.devolver(
            keys=[
                f"cupos:{p}:{nrc}",
                f"cupototal:{p}:{nrc}",
                f"ocupado:{est}",
                f"reserva:{est}:{nrc}",
                "reservas:pendientes",
            ],
            args=[nrc, f"{est}|{nrc}", f"cupos:{p}", "conciliar" if conciliar else ""],
        )
        return res

    async def limpiar(self) -> None:
        pendientes = await self.redis.zrange("reservas:pendientes", 0, -1)
        propios = [m for m in pendientes if m.startswith(f"tst-{self.run}")]
        if propios:
            await self.redis.zrem("reservas:pendientes", *propios)
        claves = self.claves - {"reservas:pendientes"}
        if claves:
            await self.redis.delete(*claves)


@pytest.fixture
async def env(redis: Redis) -> AsyncIterator[Entorno]:
    e = Entorno(redis)
    yield e
    await e.limpiar()


async def test_reservar_descuenta_y_marca_ocupado(env: Entorno) -> None:
    await env.crear_nrc("N1", 5)
    est = env.est(1)
    pubsub = env.redis.pubsub()
    await pubsub.subscribe(f"cupos:{env.periodo}")
    await pubsub.get_message(timeout=1)  # confirmación de suscripción

    res = await env.reservar_nrc(est, "N1", "MAT1", MARTES_2030)

    assert res == ["ok", 4]
    assert await env.libres("N1") == 4
    ocupado = await env.redis.hgetall(f"ocupado:{est}")
    assert json.loads(ocupado["N1"])["materiaId"] == "MAT1"
    assert 0 < await env.redis.ttl(f"reserva:{est}:N1") <= 300
    assert await env.redis.zscore("reservas:pendientes", f"{est}|N1") is not None
    msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=2)
    assert msg is not None and json.loads(msg["data"]) == {"nrc": "N1", "libres": 4}
    await pubsub.aclose()


async def test_sin_cupo_no_escribe_nada(env: Entorno) -> None:
    await env.crear_nrc("N1", 0, total=5)
    est = env.est(1)
    res = await env.reservar_nrc(est, "N1", "MAT1")
    assert res[0] == "sin_cupo"
    assert await env.libres("N1") == 0
    assert await env.redis.exists(f"ocupado:{est}", f"reserva:{est}:N1") == 0
    assert await env.redis.zscore("reservas:pendientes", f"{est}|N1") is None


async def test_nrc_inexistente_es_error(env: Entorno) -> None:
    res = await env.reservar_nrc(env.est(1), "NOEXISTE", "MAT1")
    assert res[0] == "error"
    assert await env.redis.exists(f"ocupado:{env.est(1)}") == 0


async def test_cruce_no_escribe_nada(env: Entorno) -> None:
    await env.crear_nrc("A", 5)
    await env.crear_nrc("B", 5)
    est = env.est(1)
    assert (await env.reservar_nrc(est, "A", "MAT1", MARTES_2030))[0] == "ok"

    cruza = [{"dia": "MAR", "inicio": "21:00", "fin": "22:30"}]
    res = await env.reservar_nrc(est, "B", "MAT2", cruza)

    assert res == ["cruce", "A"]
    assert await env.libres("B") == 5
    assert await env.redis.hkeys(f"ocupado:{est}") == ["A"]
    assert await env.redis.exists(f"reserva:{est}:B") == 0


async def test_borde_sin_cruce_si_termina_cuando_empieza_el_otro(env: Entorno) -> None:
    await env.crear_nrc("A", 5)
    await env.crear_nrc("B", 5)
    est = env.est(1)
    await env.reservar_nrc(est, "A", "MAT1", MARTES_2030)
    contiguo = [{"dia": "MAR", "inicio": "21:59", "fin": "23:00"}]
    assert (await env.reservar_nrc(est, "B", "MAT2", contiguo))[0] == "ok"


async def test_ya_inscrita_misma_materia_otro_nrc(env: Entorno) -> None:
    await env.crear_nrc("A", 5)
    await env.crear_nrc("B", 5)
    est = env.est(1)
    await env.reservar_nrc(est, "A", "MAT1", [{"dia": "LUN", "inicio": "08:00", "fin": "09:30"}])
    res = await env.reservar_nrc(
        est, "B", "MAT1", [{"dia": "VIE", "inicio": "08:00", "fin": "09:30"}]
    )
    assert res == ["ya_inscrita", "A"]
    assert await env.libres("B") == 5


async def test_devolver_restaura_y_no_supera_cupototal(env: Entorno) -> None:
    await env.crear_nrc("A", 3)
    est = env.est(1)
    await env.reservar_nrc(est, "A", "MAT1")
    assert await env.libres("A") == 2

    assert await env.devolver_nrc(est, "A") == [1, 3]
    assert await env.redis.exists(f"ocupado:{est}", f"reserva:{est}:A") == 0
    assert await env.redis.zscore("reservas:pendientes", f"{est}|A") is None

    # segunda devolución: idempotente, no suma de más
    assert (await env.devolver_nrc(est, "A"))[0] == 0
    assert await env.libres("A") == 3


async def test_devolver_con_cupo_ya_en_el_tope_no_lo_supera(env: Entorno) -> None:
    await env.crear_nrc("A", 3)  # cupos == cupototal == 3
    est = env.est(1)
    await env.redis.hset(f"ocupado:{est}", "A", json.dumps({"materiaId": "M", "bloques": []}))
    env.claves.add(f"ocupado:{est}")
    res = await env.devolver_nrc(est, "A")
    assert res == [1, 3]
    assert await env.libres("A") == 3


async def test_devolver_conciliar_ignora_miembros_ya_consolidados(env: Entorno) -> None:
    await env.crear_nrc("A", 3)
    est = env.est(1)
    await env.reservar_nrc(est, "A", "MAT1")
    await env.redis.zrem("reservas:pendientes", f"{est}|A")  # el worker consolidó
    assert (await env.devolver_nrc(est, "A", conciliar=True))[0] == 0
    assert await env.libres("A") == 2
    assert await env.redis.hexists(f"ocupado:{est}", "A")


async def test_dos_reservas_simultaneas_del_mismo_estudiante_con_cruce(env: Entorno) -> None:
    for i in range(20):
        a, b = f"A{i}", f"B{i}"
        await env.crear_nrc(a, 5)
        await env.crear_nrc(b, 5)
        est = env.est(i)
        r1, r2 = await asyncio.gather(
            env.reservar_nrc(est, a, "MAT1", [{"dia": "MAR", "inicio": "20:30", "fin": "21:59"}]),
            env.reservar_nrc(est, b, "MAT2", [{"dia": "MAR", "inicio": "21:00", "fin": "22:30"}]),
        )
        estados = sorted([r1[0], r2[0]])
        assert estados == ["cruce", "ok"], f"iteración {i}: {estados}"
        assert len(await env.redis.hkeys(f"ocupado:{est}")) == 1
        # exactamente un cupo descontado entre los dos NRC
        assert await env.libres(a) + await env.libres(b) == 9


async def test_concurrencia_200_estudiantes_contra_10_cupos(env: Entorno) -> None:
    await env.crear_nrc("HOT", 10)
    resultados = await asyncio.gather(
        *(env.reservar_nrc(env.est(i), "HOT", "MATX") for i in range(200))
    )
    estados = [r[0] for r in resultados]
    assert estados.count("ok") == 10
    assert estados.count("sin_cupo") == 190
    assert await env.libres("HOT") == 0
    reservas = [m for m in await env.redis.zrange("reservas:pendientes", 0, -1) if "|HOT" in m]
    assert len([m for m in reservas if m.startswith(f"tst-{env.run}")]) == 10


async def test_reserva_guarda_el_reserva_id(env: Entorno) -> None:
    await env.crear_nrc("N1", 5)
    est = env.est(1)
    await env.reservar_nrc(est, "N1", "MAT1", reserva_id="abc-123")
    assert await env.redis.get(f"reserva:{est}:N1") == "abc-123"


async def test_devolver_sin_cupototal_es_error_y_no_escribe(env: Entorno) -> None:
    p = env.periodo
    est = env.est(1)
    await env.redis.set(f"cupos:{p}:N1", 2)  # sin cupototal
    await env.redis.hset(f"ocupado:{est}", "N1", json.dumps({"materiaId": "M", "bloques": []}))
    await env.redis.set(f"reserva:{est}:N1", "rid")
    await env.redis.zadd("reservas:pendientes", {f"{est}|N1": 1})
    env.claves.update({f"cupos:{p}:N1", f"ocupado:{est}", f"reserva:{est}:N1"})

    assert await env.devolver_nrc(est, "N1") == [-1, -1]

    assert await env.libres("N1") == 2
    assert await env.redis.hexists(f"ocupado:{est}", "N1")
    assert await env.redis.exists(f"reserva:{est}:N1") == 1
    assert await env.redis.zscore("reservas:pendientes", f"{est}|N1") == 1


async def test_cancelar_dos_veces_hace_un_solo_incr(env: Entorno) -> None:
    await env.crear_nrc("N1", 5, total=10)  # holgura: el tope no es lo que frena el segundo INCR
    est = env.est(1)
    await env.reservar_nrc(est, "N1", "MAT1")
    assert await env.libres("N1") == 4
    resultados = await asyncio.gather(env.devolver_nrc(est, "N1"), env.devolver_nrc(est, "N1"))
    assert sorted(r[0] for r in resultados) == [0, 1]
    assert await env.libres("N1") == 5


async def test_carrera_reservar_cancelar_conciliar_conserva_la_invariante(env: Entorno) -> None:
    total = 10
    await env.crear_nrc("RACE", total)
    rnd = random.Random(7)
    estudiantes = [env.est(i) for i in range(40)]

    async def ciclo(est: str, ops: int) -> None:
        for _ in range(ops):
            accion = rnd.choice(["reservar", "reservar", "cancelar", "conciliar"])
            if accion == "reservar":
                await env.reservar_nrc(est, "RACE", f"MAT-{est}")
            else:
                await env.devolver_nrc(est, "RACE", conciliar=accion == "conciliar")

    await asyncio.gather(*(ciclo(e, 3) for e in estudiantes))  # ~120 operaciones

    libres = await env.libres("RACE")
    ocupantes = sum([await env.redis.hexists(f"ocupado:{e}", "RACE") for e in estudiantes])
    assert 0 <= libres <= total
    assert libres + ocupantes == total
