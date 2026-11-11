"""Ingesta a bronce: mensajes de Redpanda -> JSON lines crudos en `bronze`.

Layout: ``tipo={tipo}/fecha={YYYY-MM-DD}/{topic}-p{particion}-o{primero}-o{ultimo}.jsonl``.

Entrega al-menos-una-vez: los offsets se confirman solo despues de escribir el lote en MinIO.
Si el proceso cae entre la escritura y el commit, el lote se reescribe con el mismo nombre
(mismo rango de offsets) o con otro rango; plata deduplica por ``eventId``.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import re
import time
from collections import defaultdict
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from aiokafka import AIOKafkaConsumer, TopicPartition
from minio import Minio

from . import s3
from .config import Settings

log = logging.getLogger("lake.bronce")

TIPOS_VALIDOS = ("intento", "confirmacion", "cancelacion", "busqueda")
TIPO_INVALIDO = "invalido"
_FECHA = re.compile(r"^\d{4}-\d{2}-\d{2}")


@dataclass(frozen=True)
class Mensaje:
    topic: str
    particion: int
    offset: int
    valor: bytes


def clasificar(valor: bytes, hoy: str) -> tuple[str, str, str]:
    """Devuelve (tipo, fecha, linea). La linea es el valor tal cual, en una sola linea.

    El tipo sale del evento; si no es JSON de un objeto con un tipo conocido va a
    ``tipo=invalido`` (se conserva en bronce y plata lo cuenta como invalido). La fecha sale
    de ``ocurridoEn``; si no existe, de la fecha de ingesta.
    """
    texto = valor.decode("utf-8", errors="replace").replace("\r", " ").replace("\n", " ")
    tipo, fecha = TIPO_INVALIDO, hoy
    try:
        obj = json.loads(texto)
    except ValueError:
        return tipo, fecha, texto
    if isinstance(obj, dict):
        t = obj.get("tipo")
        if isinstance(t, str) and t in TIPOS_VALIDOS:
            tipo = t
        o = obj.get("ocurridoEn")
        if isinstance(o, str) and _FECHA.match(o):
            fecha = o[:10]
    return tipo, fecha, texto


def objetos_del_lote(mensajes: list[Mensaje], hoy: str) -> dict[str, bytes]:
    """Agrupa por (tipo, fecha, topic, particion) y arma un objeto JSONL por grupo."""
    grupos: dict[tuple[str, str, str, int], list[tuple[int, str]]] = defaultdict(list)
    for m in mensajes:
        tipo, fecha, linea = clasificar(m.valor, hoy)
        grupos[(tipo, fecha, m.topic, m.particion)].append((m.offset, linea))
    salida: dict[str, bytes] = {}
    for (tipo, fecha, topic, part), filas in grupos.items():
        filas.sort()
        nombre = f"tipo={tipo}/fecha={fecha}/{topic}-p{part}-o{filas[0][0]}-o{filas[-1][0]}.jsonl"
        salida[nombre] = ("\n".join(linea for _, linea in filas) + "\n").encode()
    return salida


def escribir_lote(c: Minio, s: Settings, mensajes: list[Mensaje]) -> int:
    """Escribe el lote en MinIO y devuelve el numero de objetos."""
    hoy = datetime.now(UTC).strftime("%Y-%m-%d")
    objetos = objetos_del_lote(mensajes, hoy)
    for nombre, datos in objetos.items():
        s3.subir(c, s.bucket_bronce, nombre, datos, "application/x-ndjson")
    return len(objetos)


@dataclass
class Acumulador:
    """Buffer del lote en curso: se vacia solo despues de escribir y confirmar offsets."""

    mensajes: list[Mensaje] = field(default_factory=list)
    offsets: dict[TopicPartition, int] = field(default_factory=dict)
    desde: float = 0.0

    def agregar(self, tp: TopicPartition, msgs: list[Any]) -> None:
        if not self.mensajes:
            self.desde = time.monotonic()
        for m in msgs:
            self.mensajes.append(Mensaje(m.topic, m.partition, m.offset, m.value or b""))
        self.offsets[tp] = max(self.offsets.get(tp, -1), msgs[-1].offset + 1)

    def listo(self, lote_max: int, lote_max_s: float) -> bool:
        if not self.mensajes:
            return False
        return len(self.mensajes) >= lote_max or time.monotonic() - self.desde >= lote_max_s

    def vaciar(self) -> None:
        self.mensajes.clear()
        self.offsets.clear()


async def _latido(ruta: str, parar: asyncio.Event) -> None:
    while not parar.is_set():
        Path(ruta).touch()
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(parar.wait(), timeout=5)


def nuevo_consumidor(s: Settings) -> AIOKafkaConsumer:
    return AIOKafkaConsumer(
        *s.topics,
        bootstrap_servers=s.kafka_brokers,
        group_id=s.grupo,
        enable_auto_commit=False,
        auto_offset_reset="earliest",
    )


BACKOFF_MAX_S = 30.0


def espera_backoff(fallos: int) -> float:
    """Espera creciente (1, 2, 4... s) con tope tras `fallos` escrituras fallidas seguidas."""
    return float(min(2 ** max(fallos - 1, 0), BACKOFF_MAX_S)) if fallos else 0.0


@dataclass
class Estado:
    fallos: int = 0  # escrituras fallidas seguidas del lote pendiente
    total: int = 0  # mensajes escritos a bronce


async def ciclo(
    consumidor: Any,
    acc: Acumulador,
    escribir: Callable[[list[Mensaje]], int],
    estado: Estado,
    s: Settings,
    *,
    hasta_vaciar: bool = False,
    dormir: Callable[[float], Awaitable[None]] = asyncio.sleep,
) -> bool:
    """Una vuelta: lee (salvo que haya un lote que no se pudo escribir), escribe y confirma.

    Si `escribir` falla, el lote queda en el buffer y NO se vuelve a leer hasta escribirlo
    (el buffer no crece); entre intentos espera con backoff creciente. Devuelve si llegaron
    mensajes nuevos.
    """
    lote: dict[TopicPartition, list[Any]] = {}
    if estado.fallos:
        await dormir(espera_backoff(estado.fallos))
    else:
        lote = await consumidor.getmany(timeout_ms=500, max_records=s.lote_max)
        for tp, msgs in lote.items():
            if msgs:
                acc.agregar(tp, msgs)
    if acc.listo(s.lote_max, 0 if estado.fallos or (hasta_vaciar and not lote) else s.lote_max_s):
        try:
            n = await asyncio.to_thread(escribir, acc.mensajes)
            # commit SOLO despues de escribir (at-least-once)
            await consumidor.commit(dict(acc.offsets))
        except Exception:
            estado.fallos += 1
            log.exception(
                "fallo al escribir el lote en bronce (intento %d); se reintenta", estado.fallos
            )
            return bool(lote)
        estado.fallos = 0
        estado.total += len(acc.mensajes)
        log.info("bronce: %d mensajes en %d objetos", len(acc.mensajes), n)
        acc.vaciar()
    return bool(lote)


async def ingerir(
    s: Settings,
    parar: asyncio.Event,
    *,
    heartbeat: bool = True,
    hasta_vaciar: bool = False,
) -> int:
    """Bucle de ingesta. Con ``hasta_vaciar`` termina cuando no llegan mas mensajes.

    Devuelve el numero de mensajes escritos a bronce.
    """
    c = s3.cliente(s)
    await asyncio.to_thread(s3.asegurar_buckets, c, s)
    consumidor = nuevo_consumidor(s)
    await consumidor.start()
    tarea = asyncio.create_task(_latido(s.heartbeat_file, parar)) if heartbeat else None
    acc = Acumulador()
    estado = Estado()
    vacios = 0
    log.info("ingesta a bronce lista (grupo %s, topics %s)", s.grupo, ",".join(s.topics))

    def escribir(mensajes: list[Mensaje]) -> int:
        return escribir_lote(c, s, mensajes)

    try:
        while not parar.is_set():
            llegaron = await ciclo(consumidor, acc, escribir, estado, s, hasta_vaciar=hasta_vaciar)
            if hasta_vaciar and estado.fallos >= 5:
                raise RuntimeError("no se pudo escribir a bronce tras 5 intentos")
            if hasta_vaciar:
                vacios = 0 if llegaron else vacios + 1
                if vacios >= 3 and not acc.mensajes:
                    break
        if acc.mensajes:  # cierre ordenado: no perder el lote en curso
            await asyncio.to_thread(escribir_lote, c, s, acc.mensajes)
            await consumidor.commit(dict(acc.offsets))
            estado.total += len(acc.mensajes)
    finally:
        parar.set()
        if tarea is not None:
            await tarea
        await consumidor.stop()
    return estado.total


async def lag(s: Settings) -> int:
    """Mensajes pendientes del grupo de bronce (fin de log - offset confirmado)."""
    consumidor = AIOKafkaConsumer(
        bootstrap_servers=s.kafka_brokers, group_id=s.grupo, enable_auto_commit=False
    )
    await consumidor.start()
    try:
        meta = await consumidor._client.fetch_all_metadata()
        tps: list[TopicPartition] = []
        for t in s.topics:
            # sin suscripcion, la API publica no expone las particiones: se leen del metadato
            for p in meta.partitions_for_topic(t) or set():
                tps.append(TopicPartition(t, p))
        if not tps:
            return 0
        fines = await consumidor.end_offsets(tps)
        inicios = await consumidor.beginning_offsets(tps)
        pendiente = 0
        for tp in tps:
            conf = await consumidor.committed(tp)
            # sin offset confirmado el grupo arrancaria en el inicio del log (retencion), no en 0
            base = inicios[tp] if conf is None else conf
            pendiente += max(fines[tp] - base, 0)
        return pendiente
    finally:
        await consumidor.stop()


async def grupo_activo(s: Settings) -> bool:
    """True si el grupo de bronce tiene miembros conectados (el lake-worker esta vivo)."""
    from aiokafka.admin import AIOKafkaAdminClient

    admin = AIOKafkaAdminClient(bootstrap_servers=s.kafka_brokers)
    await admin.start()
    try:
        grupos = await admin.describe_consumer_groups([s.grupo])
        # cada respuesta trae `groups`: (error, grupo, estado, tipo, protocolo, miembros, ...)
        return any(g[5] for r in grupos for g in r.groups)
    finally:
        await admin.close()
