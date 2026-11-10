"""Integración del worker (consolidar, devolver, conciliar) contra Redis y Mongo de Docker.

Usa un periodo de prueba propio (``tst-xxxx``): no toca los datos de la simulación.
"""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from collections.abc import AsyncIterator
from typing import Any

import pytest
from redis.asyncio import Redis

from worker import scripts
from worker.config import Settings
from worker.proceso import Confirmador, ahora_iso

from .conftest import requiere_servicios

pytestmark = [pytest.mark.integration, requiere_servicios]


class Entorno:
    def __init__(self, redis: Redis, db: Any, fallo: float = 0.0) -> None:
        self.redis: Any = redis  # redis-py tipa mal los retornos async
        self.db = db
        self.run = uuid.uuid4().hex[:8]
        self.periodo = f"tst-{self.run}"
        self.est = f"tst-{self.run}-0001"
        self.publicados: list[tuple[str, str, dict[str, Any]]] = []
        self.reservar = scripts.cargar(redis, "reservar")
        self.settings = Settings(periodo=self.periodo, fallo_sistema_academico=fallo)

        async def publicar(topic: str, clave: str, evento: dict[str, Any]) -> None:
            self.publicados.append((topic, clave, evento))

        async def sin_espera(_: float) -> None:
            return None

        self.conf = Confirmador(self.settings, redis, db, publicar, dormir=sin_espera)

    async def reservar_nrc(
        self, nrc: str, cupos: int = 5, ttl: int = 300, crear: bool = True
    ) -> str:
        """Reserva con ``reservar.lua`` y devuelve el reservaId."""
        p = self.periodo
        if crear:
            await self.redis.set(f"cupos:{p}:{nrc}", cupos)
            await self.redis.set(f"cupototal:{p}:{nrc}", cupos)
        reserva_id = str(uuid.uuid4())
        valor = json.dumps({"materiaId": f"M-{nrc}", "bloques": []})
        res = await self.reservar(
            keys=[
                f"cupos:{p}:{nrc}",
                f"ocupado:{self.est}",
                f"reserva:{self.est}:{nrc}",
                "reservas:pendientes",
            ],
            args=[
                nrc,
                valor,
                int(time.time() * 1000) + ttl * 1000,
                ttl,
                f"{self.est}|{nrc}",
                f"cupos:{p}",
                reserva_id,
            ],
        )
        assert res[0] == "ok"
        return reserva_id

    def evento(self, nrc: str, reserva_id: str | None = None, **extra: Any) -> dict[str, Any]:
        e: dict[str, Any] = {
            "eventId": str(uuid.uuid4()),
            "tipo": "intento",
            "ocurridoEn": ahora_iso(),
            "periodo": self.periodo,
            "estudianteId": self.est,
            "nrc": nrc,
            "materiaId": f"M-{nrc}",
            "resultado": "exito",
            "latenciaMs": 3,
            "alternativaNrc": None,
            "reservaId": reserva_id,
        }
        e.update(extra)
        self.ids.append(e["eventId"])
        return e

    async def cancelar(self, nrc: str) -> None:
        """Lo que hace la API: Mongo primero (cancelada) y después devolver.lua."""
        ahora = ahora_iso()
        await self.db["inscripciones"].update_one(
            {"_id": f"{self.periodo}|{self.est}|{nrc}"},
            {
                "$set": {"estado": "cancelada", "actualizadaEn": ahora},
                "$setOnInsert": {"estudianteId": self.est, "nrc": nrc, "periodo": self.periodo},
            },
            upsert=True,
        )
        await self.conf.devolver(self.est, nrc)

    async def libres(self, nrc: str) -> int:
        return int(await self.redis.get(f"cupos:{self.periodo}:{nrc}"))

    async def estado(self, nrc: str) -> dict[str, Any] | None:
        doc: dict[str, Any] | None = await self.db["inscripciones"].find_one(
            {"_id": f"{self.periodo}|{self.est}|{nrc}"}
        )
        return doc

    async def limpiar(self) -> None:
        claves = [k async for k in self.redis.scan_iter(match=f"*{self.run}*")]
        claves += [k async for k in self.redis.scan_iter(match=f"*:{self.est}*")]
        if claves:
            await self.redis.delete(*claves)
        for m in await self.redis.zrange("reservas:pendientes", 0, -1):
            if m.startswith(f"tst-{self.run}"):
                await self.redis.zrem("reservas:pendientes", m)
        await self.db["inscripciones"].delete_many({"periodo": self.periodo})
        await self.db["eventos_procesados"].delete_many({"_id": {"$in": self.ids}})

    ids: list[str]


@pytest.fixture
async def env(redis: Redis, db: Any) -> AsyncIterator[Entorno]:
    e = Entorno(redis, db)
    e.ids = []
    yield e
    await e.limpiar()


async def test_consolida_reserva_vigente(env: Entorno) -> None:
    rid = await env.reservar_nrc("100")
    ev = env.evento("100", rid)

    assert await env.conf.procesar(ev) == "confirmada"

    doc = await env.estado("100")
    assert doc is not None and doc["estado"] == "confirmada"
    assert doc["_id"] == f"{env.periodo}|{env.est}|100"
    assert await env.redis.exists(f"reserva:{env.est}:100") == 0
    assert await env.redis.zscore("reservas:pendientes", f"{env.est}|100") is None
    assert await env.redis.hexists(f"ocupado:{env.est}", "100")  # sigue ocupando el horario
    assert await env.libres("100") == 4  # el cupo queda descontado
    topic, clave, pub = env.publicados[0]
    assert topic == "inscripcion.resultados" and clave == env.est
    assert pub["tipo"] == "confirmacion" and pub["resultado"] == "exito"
    assert pub["nrc"] == "100" and pub["periodo"] == env.periodo


async def test_reentrega_del_mismo_evento_es_idempotente(env: Entorno) -> None:
    rid = await env.reservar_nrc("100")
    ev = env.evento("100", rid)
    assert await env.conf.procesar(ev) == "confirmada"
    assert await env.conf.procesar(ev) is None  # misma entrega otra vez
    assert len(env.publicados) == 1
    doc = await env.estado("100")
    assert doc is not None and doc["estado"] == "confirmada"
    assert await env.libres("100") == 4


async def test_caida_entre_upsert_y_consolidar_se_repara_con_la_reentrega(env: Entorno) -> None:
    rid = await env.reservar_nrc("100")
    ev = env.evento("100", rid)
    # el worker alcanzó a escribir Mongo y cayó antes de consolidar.lua
    assert await env.conf._escribir(ev, "confirmada")
    assert await env.redis.exists(f"reserva:{env.est}:100") == 1

    await env.conf.procesar(ev)  # reentrega del mismo evento (otro eventId no hace falta)

    doc = await env.estado("100")
    assert doc is not None and doc["estado"] == "confirmada"
    assert await env.redis.exists(f"reserva:{env.est}:100") == 0  # la reentrega consolidó
    assert await env.redis.zscore("reservas:pendientes", f"{env.est}|100") is None
    assert await env.libres("100") == 4  # cupo consistente: ni devuelto ni descontado de más


async def test_caida_entre_upsert_y_consolidar_la_conciliacion_solo_hace_zrem(env: Entorno) -> None:
    rid = await env.reservar_nrc("100")
    assert await env.conf._escribir(env.evento("100", rid), "confirmada")
    await env.redis.delete(f"reserva:{env.est}:100")  # venció el TTL antes de reentregar
    await env.redis.zadd("reservas:pendientes", {f"{env.est}|100": int(time.time() * 1000) - 1})

    await env.conf.conciliar()

    assert await env.redis.zscore("reservas:pendientes", f"{env.est}|100") is None
    assert await env.libres("100") == 4
    assert await env.redis.hexists(f"ocupado:{env.est}", "100")
    doc = await env.estado("100")
    assert doc is not None and doc["estado"] == "confirmada"


async def test_reserva_vencida_con_ocupado_libera_y_rechaza(env: Entorno) -> None:
    rid = await env.reservar_nrc("100")
    await env.redis.delete(f"reserva:{env.est}:100")  # venció el TTL; nadie concilió aún
    ev = env.evento("100", rid)

    assert await env.conf.procesar(ev) == "rechazada"

    doc = await env.estado("100")
    assert doc is not None
    assert doc["estado"] == "rechazada" and doc["motivo"] == "reserva_vencida"
    assert await env.libres("100") == 5  # devolvió el cupo (ocupado aún lo tenía)
    assert not await env.redis.hexists(f"ocupado:{env.est}", "100")
    assert await env.redis.zscore("reservas:pendientes", f"{env.est}|100") is None
    assert env.publicados[0][2]["resultado"] == "error"
    assert env.publicados[0][2]["motivo"] == "reserva_vencida"


async def test_reserva_vencida_ya_conciliada_no_devuelve_dos_veces(env: Entorno) -> None:
    rid = await env.reservar_nrc("100")
    ev = env.evento("100", rid)
    await asyncio.sleep(0.01)
    await env.redis.delete(f"reserva:{env.est}:100")
    await env.redis.zadd("reservas:pendientes", {f"{env.est}|100": int(time.time() * 1000) - 1})
    await env.conf.conciliar()  # devuelve el cupo
    assert await env.libres("100") == 5
    # y luego llega el evento rezagado
    assert await env.conf.procesar(ev) is None  # la conciliación ya la dejó rechazada
    assert await env.libres("100") == 5


async def test_fallo_del_sistema_academico_devuelve_el_cupo(redis: Redis, db: Any) -> None:
    env = Entorno(redis, db, fallo=1.0)
    env.ids = []
    try:
        rid = await env.reservar_nrc("100")
        assert await env.libres("100") == 4
        ev = env.evento("100", rid)

        assert await env.conf.procesar(ev) == "rechazada"

        doc = await env.estado("100")
        assert doc is not None and doc["motivo"] == "sistema_academico_no_disponible"
        assert await env.libres("100") == 5
        assert not await env.redis.hexists(f"ocupado:{env.est}", "100")
        assert await env.redis.zscore("reservas:pendientes", f"{env.est}|100") is None
    finally:
        await env.limpiar()


async def test_duplicado_con_fallo_total_no_degrada_una_confirmada(redis: Redis, db: Any) -> None:
    ok = Entorno(redis, db)
    ok.ids = []
    try:
        rid = await ok.reservar_nrc("100")
        ev = ok.evento("100", rid)
        assert await ok.conf.procesar(ev) == "confirmada"
        libres = await ok.libres("100")

        # worker con el sistema académico caído al 100 % recibe un duplicado con otro eventId
        malo = Entorno(redis, db, fallo=1.0)
        malo.periodo, malo.est = ok.periodo, ok.est
        malo.settings = Settings(periodo=ok.periodo, fallo_sistema_academico=1.0)
        malo.conf = Confirmador(malo.settings, redis, db, ok.conf.publicar, ok.conf.dormir)
        duplicado = dict(ev, eventId=str(uuid.uuid4()))
        ok.ids.append(duplicado["eventId"])
        assert await malo.conf.procesar(duplicado) is None

        doc = await ok.estado("100")
        assert doc is not None and doc["estado"] == "confirmada" and "motivo" not in doc
        assert await ok.libres("100") == libres == 4
        assert await ok.redis.hexists(f"ocupado:{ok.est}", "100")
        assert len(ok.publicados) == 1
    finally:
        await ok.limpiar()


async def test_eventos_que_no_son_intento_exitoso_se_ignoran(env: Entorno) -> None:
    await env.reservar_nrc("100")
    for extra in ({"resultado": "sin_cupo"}, {"tipo": "cancelacion"}, {"tipo": "busqueda"}):
        assert await env.conf.procesar(env.evento("100", **extra)) is None
    assert env.publicados == [] and await env.estado("100") is None


async def test_cancelacion_completa_antes_del_worker_queda_cancelada_y_un_solo_cupo(
    env: Entorno,
) -> None:
    rid = await env.reservar_nrc("100")
    ev = env.evento("100", rid)
    await asyncio.sleep(0.01)
    await env.cancelar("100")  # Mongo cancelada + devolver.lua (lo hace la API)

    assert await env.conf.procesar(ev) is None

    doc = await env.estado("100")
    assert doc is not None and doc["estado"] == "cancelada"
    assert await env.libres("100") == 5  # devuelto una sola vez
    assert not await env.redis.hexists(f"ocupado:{env.est}", "100")
    assert env.publicados == []


async def test_cancelacion_en_mongo_pero_sin_devolver_aun_no_se_pisa(env: Entorno) -> None:
    rid = await env.reservar_nrc("100")
    ev = env.evento("100", rid)
    await asyncio.sleep(0.01)
    # la API ya escribió la cancelación en Mongo pero aún no llamó a devolver.lua
    await env.db["inscripciones"].insert_one(
        {
            "_id": f"{env.periodo}|{env.est}|100",
            "estudianteId": env.est,
            "nrc": "100",
            "periodo": env.periodo,
            "estado": "cancelada",
            "actualizadaEn": ahora_iso(),
        }
    )
    assert await env.conf.procesar(ev) is None
    doc = await env.estado("100")
    assert doc is not None and doc["estado"] == "cancelada"
    # ahora la API termina: devolver.lua; el cupo vuelve una sola vez
    assert await env.conf.devolver(env.est, "100") is True
    assert await env.conf.devolver(env.est, "100") is False
    assert await env.libres("100") == 5


async def test_confirmacion_bloqueada_por_cancelacion_posterior_devuelve_el_cupo(
    env: Entorno,
) -> None:
    """Carrera: la cancelación se escribe en Mongo entre la lectura del estado y el upsert."""
    rid = await env.reservar_nrc("100")
    ev = env.evento("100", rid)
    await env.db["inscripciones"].insert_one(
        {
            "_id": f"{env.periodo}|{env.est}|100",
            "estudianteId": env.est,
            "nrc": "100",
            "periodo": env.periodo,
            "estado": "cancelada",
            "actualizadaEn": ahora_iso(),
        }
    )
    estado, _ = await env.conf._confirmar(ev)  # salta la comprobación previa de estado terminal
    assert estado is None
    doc = await env.estado("100")
    assert doc is not None and doc["estado"] == "cancelada"
    assert await env.libres("100") == 5  # devolvió el cupo de la reserva aún pendiente


async def test_cancelar_y_reinscribir_con_eventos_desordenados(env: Entorno) -> None:
    rid1 = await env.reservar_nrc("100")
    ev1 = env.evento("100", rid1)
    await asyncio.sleep(0.01)
    await env.cancelar("100")
    await asyncio.sleep(0.01)
    rid2 = await env.reservar_nrc("100", crear=False)
    await asyncio.sleep(0.01)
    ev2 = env.evento("100", rid2)
    assert await env.libres("100") == 4

    # llega primero el evento de la segunda reserva y después el rezagado de la primera
    assert await env.conf.procesar(ev2) == "confirmada"
    assert await env.conf.procesar(ev1) is None

    doc = await env.estado("100")
    assert doc is not None and doc["estado"] == "confirmada"
    assert await env.libres("100") == 4
    assert await env.redis.hexists(f"ocupado:{env.est}", "100")
    assert await env.redis.exists(f"reserva:{env.est}:100") == 0


async def test_evento_de_la_primera_reserva_no_consolida_la_segunda(env: Entorno) -> None:
    rid1 = await env.reservar_nrc("100")
    ev1 = env.evento("100", rid1)
    await asyncio.sleep(0.01)
    await env.cancelar("100")
    await asyncio.sleep(0.01)
    rid2 = await env.reservar_nrc("100", crear=False)
    # se borra la marca de cancelada para aislar la comparación de reservaId
    await env.db["inscripciones"].delete_many({"periodo": env.periodo})

    assert await env.conf.procesar(ev1) is None  # reserva ajena: no consolida ni rechaza
    assert await env.redis.get(f"reserva:{env.est}:100") == rid2
    assert await env.estado("100") is None
    assert await env.libres("100") == 4
    # y el consolidar.lua también lo impide aunque se llame directamente
    r = await env.conf.lua_consolidar(
        keys=[f"reserva:{env.est}:100", "reservas:pendientes"], args=[f"{env.est}|100", rid1]
    )
    assert int(r) == 2
    assert await env.redis.get(f"reserva:{env.est}:100") == rid2


async def test_evento_envenenado_va_a_la_dlq_y_el_worker_sigue(env: Entorno) -> None:
    rid = await env.reservar_nrc("100")
    bueno = env.evento("100", rid)

    await env.conf.manejar_mensaje(b"{esto no es json")
    await env.conf.manejar_mensaje(json.dumps({"foo": "bar"}).encode())
    sin_nrc = {**env.evento("100"), "nrc": None}
    await env.conf.manejar_mensaje(json.dumps(sin_nrc).encode())
    dlq = [p for p in env.publicados if p[0] == "inscripcion.dlq"]
    assert len(dlq) == 3 and all(p[2]["error"] for p in dlq)

    await env.conf.manejar_mensaje(json.dumps(bueno).encode())  # el siguiente sí se procesa
    doc = await env.estado("100")
    assert doc is not None and doc["estado"] == "confirmada"


async def test_excepcion_repetida_va_a_la_dlq_tras_3_intentos(
    env: Entorno, monkeypatch: pytest.MonkeyPatch
) -> None:
    llamadas = 0

    async def explota(_: dict[str, Any]) -> str | None:
        nonlocal llamadas
        llamadas += 1
        raise RuntimeError("mongo caído")

    monkeypatch.setattr(env.conf, "procesar", explota)
    await env.conf.manejar_mensaje(json.dumps(env.evento("100")).encode())
    assert llamadas == 3
    dlq = [p for p in env.publicados if p[0] == "inscripcion.dlq"]
    assert len(dlq) == 1 and dlq[0][2]["intentos"] == 3 and "mongo caído" in dlq[0][2]["error"]


async def test_conciliacion_devuelve_reservas_vencidas(env: Entorno) -> None:
    await env.reservar_nrc("100")
    assert await env.libres("100") == 4
    await env.redis.delete(f"reserva:{env.est}:100")
    await env.redis.zadd("reservas:pendientes", {f"{env.est}|100": int(time.time() * 1000) - 1000})

    assert await env.conf.conciliar() >= 1

    assert await env.libres("100") == 5
    assert not await env.redis.hexists(f"ocupado:{env.est}", "100")
    assert await env.redis.zscore("reservas:pendientes", f"{env.est}|100") is None
    doc = await env.estado("100")
    assert doc is not None and doc["estado"] == "rechazada" and doc["motivo"] == "reserva_vencida"


async def test_conciliacion_no_devuelve_si_hay_confirmada(env: Entorno) -> None:
    await env.reservar_nrc("100")
    await env.redis.zadd("reservas:pendientes", {f"{env.est}|100": int(time.time() * 1000) - 1000})
    await env.db["inscripciones"].insert_one(
        {
            "_id": f"{env.periodo}|{env.est}|100",
            "estudianteId": env.est,
            "nrc": "100",
            "periodo": env.periodo,
            "estado": "confirmada",
        }
    )
    await env.conf.conciliar()
    assert await env.libres("100") == 4  # el cupo sigue descontado
    assert await env.redis.hexists(f"ocupado:{env.est}", "100")
    assert await env.redis.zscore("reservas:pendientes", f"{env.est}|100") is None


async def test_conciliacion_ignora_reservas_aun_vigentes(env: Entorno) -> None:
    await env.reservar_nrc("100")
    await env.conf.conciliar()
    assert await env.libres("100") == 4
    assert await env.redis.exists(f"reserva:{env.est}:100") == 1
