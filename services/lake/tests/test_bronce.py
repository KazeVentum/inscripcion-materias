"""Particionado y at-least-once de la ingesta a bronce (sin servicios)."""

from __future__ import annotations

import json
from types import SimpleNamespace

from aiokafka import TopicPartition

from lake.bronce import Acumulador, Mensaje, clasificar, objetos_del_lote

HOY = "2026-11-10"


def evento(**kw: object) -> bytes:
    base = {"eventId": "e1", "tipo": "intento", "ocurridoEn": "2026-11-09T21:00:00.123Z"}
    return json.dumps({**base, **kw}).encode()


def test_clasifica_por_tipo_y_fecha_del_evento() -> None:
    tipo, fecha, linea = clasificar(evento(), HOY)
    assert (tipo, fecha) == ("intento", "2026-11-09")
    assert json.loads(linea)["eventId"] == "e1"  # el contenido va tal cual


def test_lo_que_no_es_evento_va_a_invalido_con_la_fecha_de_ingesta() -> None:
    for crudo in (b"no es json", b"[1, 2]", b"null", evento(tipo="otro"), b"\xff\xfe"):
        tipo, fecha, _ = clasificar(crudo, HOY)
        assert tipo == "invalido" and (fecha == HOY or crudo == evento(tipo="otro"))


def test_una_linea_por_mensaje_aunque_traiga_saltos() -> None:
    _, _, linea = clasificar(b'{"a":\n1}', HOY)
    assert "\n" not in linea and "\r" not in linea


def test_objetos_agrupan_por_particion_y_nombran_por_offsets() -> None:
    msgs = [
        Mensaje("inscripcion.intentos", 0, 10, evento(eventId="a")),
        Mensaje("inscripcion.intentos", 0, 11, evento(eventId="b")),
        Mensaje("inscripcion.intentos", 1, 5, evento(eventId="c")),
        Mensaje("oferta.busquedas", 0, 3, evento(eventId="d", tipo="busqueda")),
        Mensaje("inscripcion.intentos", 0, 12, b"basura"),
    ]
    objetos = objetos_del_lote(msgs, HOY)
    assert set(objetos) == {
        "tipo=intento/fecha=2026-11-09/inscripcion.intentos-p0-o10-o11.jsonl",
        "tipo=intento/fecha=2026-11-09/inscripcion.intentos-p1-o5-o5.jsonl",
        "tipo=busqueda/fecha=2026-11-09/oferta.busquedas-p0-o3-o3.jsonl",
        f"tipo=invalido/fecha={HOY}/inscripcion.intentos-p0-o12-o12.jsonl",
    }
    primero = objetos["tipo=intento/fecha=2026-11-09/inscripcion.intentos-p0-o10-o11.jsonl"]
    assert [json.loads(x)["eventId"] for x in primero.decode().splitlines()] == ["a", "b"]
    # reescribir el mismo lote produce los mismos nombres: la redelivery sobrescribe
    assert set(objetos_del_lote(msgs, HOY)) == set(objetos)


def test_acumulador_solo_confirma_offsets_del_lote_pendiente() -> None:
    acc = Acumulador()
    tp = TopicPartition("inscripcion.intentos", 0)
    msgs = [SimpleNamespace(topic=tp.topic, partition=0, offset=o, value=b"{}") for o in (4, 5)]
    assert not acc.listo(lote_max=10, lote_max_s=60)
    acc.agregar(tp, msgs)
    assert acc.offsets == {tp: 6}  # el commit apunta al siguiente offset a leer
    assert not acc.listo(lote_max=10, lote_max_s=60)
    assert acc.listo(lote_max=2, lote_max_s=60)  # por tamano
    assert acc.listo(lote_max=10, lote_max_s=0)  # por tiempo
    acc.vaciar()
    assert not acc.mensajes and not acc.offsets


class _Consumidor:
    """Doble de AIOKafkaConsumer: cuenta lecturas y commits."""

    def __init__(self) -> None:
        self.lecturas = 0
        self.commits: list[dict[TopicPartition, int]] = []

    async def getmany(
        self, timeout_ms: int, max_records: int
    ) -> dict[TopicPartition, list[object]]:
        self.lecturas += 1
        o = self.lecturas
        tp = TopicPartition("inscripcion.intentos", 0)
        return {tp: [SimpleNamespace(topic=tp.topic, partition=0, offset=o, value=evento())]}

    async def commit(self, offsets: dict[TopicPartition, int]) -> None:
        self.commits.append(offsets)


def test_si_escribir_falla_el_buffer_no_crece_y_el_commit_va_despues() -> None:
    import asyncio

    from lake.bronce import Estado, ciclo, espera_backoff
    from lake.config import Settings

    s = Settings(hash_salt="x", lote_max=1, lote_max_s=0)
    cons = _Consumidor()
    acc = Acumulador()
    estado = Estado()
    intentos: list[int] = []
    esperas: list[float] = []

    def escribir(msgs: list[Mensaje]) -> int:
        intentos.append(len(msgs))
        if len(intentos) <= 3:
            raise OSError("minio caido")
        return 1

    async def dormir(seg: float) -> None:
        esperas.append(seg)

    async def correr() -> None:
        for _ in range(6):
            await ciclo(cons, acc, escribir, estado, s, dormir=dormir)

    asyncio.run(correr())
    assert intentos[:4] == [1, 1, 1, 1]  # mismo lote de 1 mensaje, nunca crecio
    assert cons.lecturas == 3  # 1 antes del fallo + 2 tras recuperarse; sin leer durante el fallo
    assert esperas[:3] == [1.0, 2.0, 4.0]  # backoff creciente
    assert [c[TopicPartition("inscripcion.intentos", 0)] for c in cons.commits] == [2, 3, 4]
    assert estado.fallos == 0 and estado.total == 3 and not acc.mensajes
    assert espera_backoff(50) == 30.0
