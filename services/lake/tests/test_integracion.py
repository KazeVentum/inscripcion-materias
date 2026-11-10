"""Integracion contra el stack: MinIO + httpfs, Redpanda y el lake real."""

from __future__ import annotations

import asyncio
import contextlib
import json
import os
import uuid
from collections.abc import Iterator

import httpx
import pytest
from aiokafka import AIOKafkaProducer
from aiokafka.admin import AIOKafkaAdminClient
from minio.deleteobjects import DeleteObject

from lake import bronce, oro, pipeline, plata, s3, validacion
from lake.catalogo import FilaEstudiante, FilaNrc
from lake.config import Settings
from lake.duck import conectar

from .conftest import requiere_stack

pytestmark = [pytest.mark.integration, requiere_stack]


def _evento(eid: str, est: str = "est-900001", res: str = "exito") -> dict[str, object]:
    return {
        "eventId": eid,
        "tipo": "intento",
        "ocurridoEn": "2026-11-09T21:00:00.123Z",
        "periodo": "2027-1",
        "estudianteId": est,
        "nrc": "100",
        "materiaId": "M1",
        "resultado": res,
        "latenciaMs": 7,
        "alternativaNrc": None,
    }


@pytest.fixture
def aislado() -> Iterator[Settings]:
    """Buckets y grupo propios: la prueba no toca el lake real."""
    sufijo = uuid.uuid4().hex[:8]
    s = Settings(
        bucket_bronce=f"t-bronze-{sufijo}",
        bucket_plata=f"t-silver-{sufijo}",
        bucket_oro=f"t-gold-{sufijo}",
        topics=(f"lake.prueba.{sufijo}",),
        grupo=f"lake-prueba-{sufijo}",
        lote_max=100,
        lote_max_s=0.2,
    )
    c = s3.cliente(s)
    s3.asegurar_buckets(c, s)
    yield s
    for b in (s.bucket_bronce, s.bucket_plata, s.bucket_oro):
        for _ in c.remove_objects(b, [DeleteObject(o) for o in s3.listar(c, b)]):
            pass
        c.remove_bucket(b)

    async def borrar_topic() -> None:
        admin = AIOKafkaAdminClient(bootstrap_servers=s.kafka_brokers)
        await admin.start()
        try:
            await admin.delete_topics(list(s.topics))
        finally:
            await admin.close()

    with contextlib.suppress(Exception):  # limpieza del topic de prueba: no rompe la prueba
        asyncio.run(borrar_topic())


async def _publicar(s: Settings, valores: list[bytes]) -> None:
    prod = AIOKafkaProducer(bootstrap_servers=s.kafka_brokers)
    await prod.start()
    try:
        for v in valores:
            await prod.send_and_wait(s.topics[0], v, key=b"k")
    finally:
        await prod.stop()


async def test_ingesta_escribe_bronce_y_confirma_offsets_despues(aislado: Settings) -> None:
    s = aislado
    valores = [
        json.dumps(_evento("a1")).encode(),
        json.dumps(_evento("a1")).encode(),  # redelivery: plata lo deduplicara
        b"esto no es json",
        json.dumps(_evento("a2")).encode(),
    ]
    await _publicar(s, valores)
    escritos = await asyncio.wait_for(
        bronce.ingerir(s, asyncio.Event(), heartbeat=False, hasta_vaciar=True), timeout=60
    )
    assert escritos == 4
    assert await bronce.lag(s) == 0  # offsets confirmados tras escribir

    c = s3.cliente(s)
    objetos = s3.listar(c, s.bucket_bronce)
    assert all(
        o.startswith(("tipo=intento/fecha=2026-11-09/", "tipo=invalido/fecha=")) for o in objetos
    )
    lineas = [x for o in objetos for x in s3.leer(c, s.bucket_bronce, o).decode().splitlines()]
    assert len(lineas) == 4 and "esto no es json" in lineas  # crudo, tal cual llego

    # una segunda corrida del mismo grupo no relee nada (no hay duplicados nuevos)
    assert await bronce.ingerir(s, asyncio.Event(), heartbeat=False, hasta_vaciar=True) == 0


def test_plata_y_oro_sobre_minio_con_httpfs(aislado: Settings) -> None:
    s = aislado
    c = s3.cliente(s)
    lineas = [json.dumps(_evento(f"e{i}", f"est-90000{i % 3}")) for i in range(6)]
    lineas += [lineas[0], "basura"]
    s3.subir(
        c,
        s.bucket_bronce,
        "tipo=intento/fecha=2026-11-09/a.jsonl",
        ("\n".join(lineas) + "\n").encode(),
        "application/x-ndjson",
    )
    nrcs = [FilaNrc("100", "M1", "Materia", 3, 1, "A", "Calle 80", "presencial", "noche", 10, 4)]
    ests = [FilaEstudiante(f"est-90000{i}", "ISIS", 1, "noche") for i in range(3)]
    con = conectar(s)
    try:
        pl = plata.ejecutar(con, s, nrcs, ests)
        oro.ejecutar(con, s)
        val = validacion.validar(con, s, pl)
    finally:
        con.close()
    assert (pl["lineas"], pl["eventos"], pl["duplicados"], pl["invalidos"]) == (8, 6, 1, 1)
    assert val["cuadra"], [x for x in val["checks"] if not x["ok"]]
    assert {o.rsplit("/", 1)[-1] for o in s3.listar(c, s.bucket_oro)} >= {
        f"{t}.parquet" for t in oro.TABLAS_ORO
    }


def test_lake_real_cuadra_y_no_tiene_datos_personales() -> None:
    """Sobre el lake real (tras make simular): recalcula y exige que los conteos cuadren."""
    s = Settings()
    c = s3.cliente(s)
    if not s3.listar(c, s.bucket_bronce):
        pytest.skip("bronce vacio (make simular && make lake)")
    meta = pipeline.recalcular(s)
    v = meta["validacion"]
    assert v["cuadra"], [x for x in v["checks"] if not x["ok"]]
    p = v["plata"]
    assert v["bronce"]["lineas"] == p["eventos"] + p["duplicados"] + p["invalidos"]
    assert p["eventos"] > 0
    con = conectar(s)
    try:
        # sin eventId repetido en plata
        dup = con.execute(
            f"SELECT count(*) - count(DISTINCT eventId) "
            f"FROM read_parquet('s3://{s.bucket_plata}/intentos.parquet')"
        ).fetchone()[0]
        assert dup == 0
        assert validacion.sin_datos_personales(con, s) == 0
    finally:
        con.close()


def test_api_sirve_el_oro_que_calculo_el_lake() -> None:
    """El resumen de la API coincide con el meta que escribio el lake (si la API esta arriba)."""
    api = os.environ.get("API_URL", "http://localhost:8000")
    pwd = os.environ.get("DEMO_PASSWORD")
    if not pwd:
        pytest.skip("falta DEMO_PASSWORD")
    try:
        r = httpx.post(
            f"{api}/api/v1/auth/login",
            json={"usuario": "coord-0001", "password": pwd},
            timeout=5,
        )
    except httpx.HTTPError:
        pytest.skip("API no alcanzable")
    h = {"Authorization": f"Bearer {r.json()['accessToken']}"}
    res = httpx.get(f"{api}/api/v1/coordinacion/analitica/resumen", headers=h, timeout=10).json()
    if res["generadoEn"] is None:
        pytest.skip("gold aun no existe")
    s = Settings()
    meta = json.loads(s3.leer(s3.cliente(s), s.bucket_oro, pipeline.META))
    # la API cachea ~10 s: si el lake recalculo en medio, se compara con el meta mas reciente
    assert res["validacion"]["cuadra"] is True
    assert res["eventos"] <= meta["resumen"]["eventos"] or res["generadoEn"] != meta["generadoEn"]
    d = httpx.get(
        f"{api}/api/v1/coordinacion/analitica/demanda-nrc?limite=1000", headers=h, timeout=10
    ).json()
    assert d["total"] >= 1
    assert (
        sum(i["intentos"] for i in d["items"]) <= res["intentos"]
        or d["generadoEn"] != res["generadoEn"]
    )
