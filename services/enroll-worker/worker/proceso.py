"""Lógica de confirmación: sistema académico simulado, consolidación y conciliación.

Orden de la confirmación (Mongo primero): upsert ``confirmada`` y después ``consolidar.lua``.
Si el worker cae entre ambos, la conciliación ve la inscripción confirmada y solo hace ZREM.

``Confirmador`` recibe sus dependencias (Redis, Mongo, función de publicación y de espera) para
poder probarse contra los servicios reales sin Kafka.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import random
import time
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, ValidationError
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError
from redis.asyncio import Redis

from . import scripts
from .config import Settings

log = logging.getLogger("worker")

Publicar = Callable[[str, str, dict[str, Any]], Awaitable[None]]
Dormir = Callable[[float], Awaitable[None]]

RESERVAS_PENDIENTES = "reservas:pendientes"
TERMINALES = ("confirmada", "rechazada", "cancelada")


class EventoEntrada(BaseModel):
    """Esquema mínimo de los eventos de ``inscripcion.intentos`` (el resto de campos se permite)."""

    model_config = ConfigDict(extra="allow")

    eventId: str
    tipo: str
    ocurridoEn: str
    periodo: str
    estudianteId: str
    nrc: str | None = None
    materiaId: str | None = None
    resultado: str
    latenciaMs: int = 0
    reservaId: str | None = None


def ahora_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def validar_evento(crudo: bytes | str) -> dict[str, Any]:
    """Parsea y valida un mensaje. Lanza ValueError/ValidationError si es inválido."""
    datos = json.loads(crudo)
    evento = EventoEntrada.model_validate(datos).model_dump()
    if evento["tipo"] == "intento" and evento["resultado"] == "exito" and not evento["nrc"]:
        raise ValueError("intento exitoso sin nrc")
    return evento


def evento_resultado(
    origen: dict[str, Any],
    resultado: str,
    latencia_ms: int,
    motivo: str | None = None,
) -> dict[str, Any]:
    """Envelope de CLAUDE.md, tipo ``confirmacion`` (``motivo`` es un campo opcional extra)."""
    evento: dict[str, Any] = {
        "eventId": str(uuid.uuid4()),
        "tipo": "confirmacion",
        "ocurridoEn": ahora_iso(),
        "periodo": origen["periodo"],
        "estudianteId": origen["estudianteId"],
        "nrc": origen["nrc"],
        "materiaId": origen.get("materiaId"),
        "resultado": resultado,
        "latenciaMs": latencia_ms,
        "alternativaNrc": None,
        "eventoOrigen": origen["eventId"],
    }
    if motivo is not None:
        evento["motivo"] = motivo
    return evento


class Confirmador:
    def __init__(
        self,
        settings: Settings,
        redis: Redis,
        db: AsyncDatabase[Any],
        publicar: Publicar,
        dormir: Dormir = asyncio.sleep,
        aleatorio: random.Random | None = None,
    ) -> None:
        self.s = settings
        self.redis: Any = redis  # redis-py tipa mal los retornos async
        self.db = db
        self.publicar = publicar
        self.dormir = dormir
        self.rnd = aleatorio or random.Random()
        self.lua_consolidar = scripts.cargar(redis, "consolidar")
        self.lua_devolver = scripts.cargar(redis, "devolver")

    # ------------------------------------------------------------------ utilidades

    def _id(self, est: str, nrc: str, periodo: str | None = None) -> str:
        return f"{periodo or self.s.periodo}|{est}|{nrc}"

    async def devolver(self, est: str, nrc: str, conciliar: bool = False) -> bool:
        p = self.s.periodo
        res = await self.lua_devolver(
            keys=[
                f"cupos:{p}:{nrc}",
                f"cupototal:{p}:{nrc}",
                f"ocupado:{est}",
                f"reserva:{est}:{nrc}",
                RESERVAS_PENDIENTES,
            ],
            args=[nrc, f"{est}|{nrc}", f"cupos:{p}", "conciliar" if conciliar else ""],
        )
        if int(res[0]) == -1:
            log.error("devolver sin cupototal (nrc=%s): cupo no devuelto", nrc)
        return int(res[0]) == 1

    async def _escribir(
        self,
        evento: dict[str, Any],
        estado: str,
        motivo: str | None = None,
        no_pisar: tuple[str, ...] = (),
    ) -> bool:
        """Upsert condicionado de la inscripción. Devuelve False si quedó bloqueado.

        Nunca pisa una cancelación igual o posterior al evento ni los estados de ``no_pisar``.
        Un DuplicateKeyError significa o bien carrera entre dos upserts (se reintenta una vez)
        o bien que el documento existente no cumple el filtro (bloqueado).
        """
        ahora = ahora_iso()
        filtro = {
            "_id": self._id(evento["estudianteId"], evento["nrc"], evento["periodo"]),
            "$nor": [
                {"estado": {"$in": list(no_pisar)}},
                {"estado": "cancelada", "actualizadaEn": {"$gte": evento["ocurridoEn"]}},
            ],
        }
        poner: dict[str, Any] = {"estado": estado, "actualizadaEn": ahora}
        update: dict[str, Any] = {
            "$set": poner,
            "$setOnInsert": {
                "estudianteId": evento["estudianteId"],
                "nrc": evento["nrc"],
                "materiaId": evento.get("materiaId"),
                "periodo": evento["periodo"],
                "creadaEn": ahora,
            },
        }
        if motivo is not None:
            poner["motivo"] = motivo
        else:
            update["$unset"] = {"motivo": ""}
        for _ in range(2):
            try:
                await self.db["inscripciones"].update_one(filtro, update, upsert=True)
                return True
            except DuplicateKeyError:
                continue
        return False

    async def sistema_academico(self) -> bool:
        """Simula la latencia (50-200 ms) y la tasa de fallo del sistema oficial."""
        espera = self.rnd.uniform(self.s.latencia_min_ms, self.s.latencia_max_ms) / 1000
        await self.dormir(espera)
        return self.rnd.random() >= self.s.fallo_sistema_academico

    async def _marcar_procesado(self, event_id: str) -> None:
        with contextlib.suppress(DuplicateKeyError):
            await self.db["eventos_procesados"].insert_one(
                {"_id": event_id, "procesadoEn": datetime.now(UTC)}
            )

    async def _terminal(self, evento: dict[str, Any]) -> bool:
        """La inscripción ya está en un estado final igual o posterior al evento."""
        doc = await self.db["inscripciones"].find_one(
            {"_id": self._id(evento["estudianteId"], evento["nrc"], evento["periodo"])}
        )
        if doc is None or doc["estado"] not in TERMINALES:
            return False
        ultimo = doc.get("actualizadaEn", doc.get("creadaEn", ""))
        return bool(ultimo >= evento["ocurridoEn"])

    # ------------------------------------------------------------------- procesar

    async def procesar(self, evento: dict[str, Any]) -> str | None:
        """Procesa un evento de ``inscripcion.intentos``.

        Devuelve el estado final (``confirmada``/``rechazada``) o None si se ignoró (no aplica,
        duplicado, rezagado o cancelado). Idempotente por eventId y por estado en Mongo.
        """
        if evento.get("tipo") != "intento" or evento.get("resultado") != "exito":
            return None
        event_id = evento["eventId"]
        if await self.db["eventos_procesados"].find_one({"_id": event_id}) is not None:
            log.info("evento %s ya procesado; se ignora", event_id)
            return None
        est, nrc = evento["estudianteId"], evento["nrc"]
        reserva_id = evento.get("reservaId")

        # Idempotencia por estado: un duplicado o rezagado no toca Redis ni degrada el estado.
        if await self._terminal(evento):
            if reserva_id:
                # reentrega tras caída entre el upsert y consolidar.lua: limpia la reserva
                # (compara reservaId; no toca cupo ni ocupado)
                await self.lua_consolidar(
                    keys=[f"reserva:{est}:{nrc}", RESERVAS_PENDIENTES],
                    args=[f"{est}|{nrc}", reserva_id],
                )
            await self._marcar_procesado(event_id)
            log.info("evento %s sobre inscripción ya terminal; se ignora", event_id)
            return None
        if await self._reserva_ajena(est, nrc, reserva_id):
            await self._marcar_procesado(event_id)
            log.info("evento %s de una reserva anterior del mismo NRC; se ignora", event_id)
            return None

        t0 = time.perf_counter()
        if not await self.sistema_academico():
            # solo si la reserva sigue pendiente: nunca devuelve un cupo ya consolidado
            await self.devolver(est, nrc, conciliar=True)
            ok = await self._escribir(
                evento, "rechazada", "sistema_academico_no_disponible", no_pisar=("confirmada",)
            )
            estado = "rechazada" if ok else None
            motivo: str | None = "sistema_academico_no_disponible"
        else:
            estado, motivo = await self._confirmar(evento)

        if estado is None:
            await self._marcar_procesado(event_id)
            return None
        latencia = int((time.perf_counter() - t0) * 1000)
        resultado = "exito" if estado == "confirmada" else "error"
        await self.publicar(
            self.s.topic_resultados, est, evento_resultado(evento, resultado, latencia, motivo)
        )
        await self._marcar_procesado(event_id)
        log.info("inscripcion estudiante=%s nrc=%s estado=%s", est, nrc, estado)
        return estado

    async def _reserva_ajena(self, est: str, nrc: str, reserva_id: str | None) -> bool:
        if not reserva_id:
            return False
        actual = await self.redis.get(f"reserva:{est}:{nrc}")
        return actual is not None and actual != reserva_id

    async def _confirmar(self, evento: dict[str, Any]) -> tuple[str | None, str | None]:
        est, nrc = evento["estudianteId"], evento["nrc"]
        reserva_id = evento.get("reservaId")
        existe = await self.redis.get(f"reserva:{est}:{nrc}")
        if existe is None:
            return await self._vencida(evento)
        if reserva_id and existe != reserva_id:
            return None, None  # otra reserva tomó el NRC mientras esperábamos

        # 1) Mongo primero; bloqueado = cancelada (igual o posterior al evento)
        if not await self._escribir(evento, "confirmada"):
            await self.devolver(est, nrc, conciliar=True)
            return None, None
        # 2) Redis: borrar la reserva y su miembro del ZSET
        res = int(
            await self.lua_consolidar(
                keys=[f"reserva:{est}:{nrc}", RESERVAS_PENDIENTES],
                args=[f"{est}|{nrc}", reserva_id or ""],
            )
        )
        if res == 1:
            return "confirmada", None
        # La reserva desapareció entre la comprobación y la consolidación (cancelada o vencida).
        doc = await self.db["inscripciones"].find_one(
            {"_id": self._id(est, nrc, evento["periodo"])}
        )
        if doc is not None and doc["estado"] == "cancelada":
            return None, None
        if await self.redis.hexists(f"ocupado:{est}", nrc):
            return "confirmada", None  # el cupo sigue ocupado: la confirmación es coherente
        # el cupo ya fue devuelto: la confirmación en Mongo no es válida
        await self._escribir(evento, "rechazada", "reserva_vencida", no_pisar=("cancelada",))
        return "rechazada", "reserva_vencida"

    async def _vencida(self, evento: dict[str, Any]) -> tuple[str | None, str | None]:
        """Sin reserva: solo se rechaza si ``ocupado`` ya no tiene el NRC; si lo tiene (nadie
        devolvió el cupo) se devuelve (idempotente) antes de rechazar."""
        est, nrc = evento["estudianteId"], evento["nrc"]
        if await self.redis.hexists(f"ocupado:{est}", nrc):
            await self.devolver(est, nrc)
        if not await self._escribir(
            evento, "rechazada", "reserva_vencida", no_pisar=("confirmada",)
        ):
            return None, None
        return "rechazada", "reserva_vencida"

    # ------------------------------------------------------------ mensajes y DLQ

    async def manejar_mensaje(self, crudo: bytes | str) -> None:
        """Valida y procesa un mensaje; tras ``max_intentos`` fallos lo manda a la DLQ.
        No lanza excepciones de procesamiento: un evento envenenado no tumba el bucle."""
        try:
            evento = validar_evento(crudo)
        except (ValueError, ValidationError) as exc:
            await self._dlq(crudo, f"evento inválido: {type(exc).__name__}", 0)
            return
        ultimo = ""
        for intento in range(1, self.s.max_intentos + 1):
            try:
                await self.procesar(evento)
                return
            except Exception as exc:
                ultimo = f"{type(exc).__name__}: {exc}"
                log.warning(
                    "fallo procesando evento %s (intento %d/%d): %s",
                    evento["eventId"],
                    intento,
                    self.s.max_intentos,
                    type(exc).__name__,
                )
                await self.dormir(0.2 * intento)
        await self._dlq(crudo, ultimo, self.s.max_intentos)

    async def _dlq(self, crudo: bytes | str, error: str, intentos: int) -> None:
        texto = crudo.decode(errors="replace") if isinstance(crudo, bytes) else crudo
        log.error("evento a la DLQ: %s", error)
        await self.publicar(
            self.s.topic_dlq,
            "dlq",
            {"error": error, "intentos": intentos, "ocurridoEn": ahora_iso(), "evento": texto},
        )

    # ---------------------------------------------------------------- conciliación

    async def conciliar(self) -> int:
        """Devuelve el cupo de las reservas vencidas sin inscripción confirmada en Mongo."""
        ahora_ms = int(time.time() * 1000)
        vencidas: list[str] = await self.redis.zrangebyscore(
            RESERVAS_PENDIENTES, "-inf", ahora_ms, start=0, num=500
        )
        devueltas = 0
        for miembro in vencidas:
            est, _, nrc = miembro.partition("|")
            doc = await self.db["inscripciones"].find_one({"_id": self._id(est, nrc)})
            if doc is not None and doc["estado"] == "confirmada":
                await self.redis.zrem(RESERVAS_PENDIENTES, miembro)
                continue
            if await self.devolver(est, nrc, conciliar=True):
                devueltas += 1
                evento = {
                    "eventId": str(uuid.uuid4()),
                    "periodo": self.s.periodo,
                    "estudianteId": est,
                    "nrc": nrc,
                    "materiaId": doc.get("materiaId") if doc else None,
                    "ocurridoEn": ahora_iso(),
                }
                if doc is None or doc["estado"] not in ("cancelada", "rechazada"):
                    await self._escribir(evento, "rechazada", "reserva_vencida", ("confirmada",))
                    await self.publicar(
                        self.s.topic_resultados,
                        est,
                        evento_resultado(evento, "error", 0, "reserva_vencida"),
                    )
                log.info("reserva vencida devuelta estudiante=%s nrc=%s", est, nrc)
        return devueltas
