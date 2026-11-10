"""Difusión de cambios de cupo: Redis Pub/Sub ``cupos:{periodo}`` -> clientes SSE.

Una sola suscripción a Redis por proceso; cada cliente SSE recibe una cola acotada.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from collections import Counter
from collections.abc import AsyncGenerator

from redis.asyncio import Redis

log = logging.getLogger("api.stream")
HEARTBEAT_S = 15.0


class Conexion:
    """Cupo de conexión SSE de un estudiante; ``cerrar`` es idempotente."""

    def __init__(self, difusor: Difusor, estudiante_id: str) -> None:
        self._difusor = difusor
        self.estudiante_id = estudiante_id
        self._abierta = True

    def cerrar(self) -> None:
        if self._abierta:
            self._abierta = False
            self._difusor._liberar(self.estudiante_id)


class Difusor:
    def __init__(self, redis: Redis, canal: str, max_por_estudiante: int = 3) -> None:
        self._redis = redis
        self._canal = canal
        self._max = max_por_estudiante
        self._colas: set[asyncio.Queue[str]] = set()
        self._por_estudiante: Counter[str] = Counter()
        self._tarea: asyncio.Task[None] | None = None

    def iniciar(self) -> None:
        self._tarea = asyncio.create_task(self._correr(), name="difusor-cupos")

    async def detener(self) -> None:
        if self._tarea is not None:
            self._tarea.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._tarea

    @property
    def clientes(self) -> int:
        return len(self._colas)

    def abrir(self, estudiante_id: str) -> Conexion | None:
        """Reserva un cupo de conexión; None si el estudiante ya tiene el máximo."""
        if self._por_estudiante[estudiante_id] >= self._max:
            return None
        self._por_estudiante[estudiante_id] += 1
        return Conexion(self, estudiante_id)

    def _liberar(self, estudiante_id: str) -> None:
        self._por_estudiante[estudiante_id] -= 1
        if self._por_estudiante[estudiante_id] <= 0:
            del self._por_estudiante[estudiante_id]

    async def _correr(self) -> None:
        while True:
            pubsub = self._redis.pubsub()
            try:
                await pubsub.subscribe(self._canal)
                while True:
                    msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                    if msg is not None:
                        self._repartir(str(msg["data"]))
            except asyncio.CancelledError:
                await pubsub.aclose()  # type: ignore[no-untyped-call]
                raise
            except Exception as exc:
                log.warning(
                    "suscripción a %s caída (%s); reintento", self._canal, type(exc).__name__
                )
                await asyncio.sleep(1.0)

    def _repartir(self, datos: str) -> None:
        for cola in self._colas:
            if cola.full():
                with contextlib.suppress(asyncio.QueueEmpty):
                    cola.get_nowait()  # cliente lento: descarta el evento más viejo
            cola.put_nowait(datos)

    async def eventos(
        self, hasta: float | None = None, conexion: Conexion | None = None
    ) -> AsyncGenerator[str, None]:
        """Flujo SSE con `event: ping` cada 15 s (un comentario SSE no llega a JS, y el
        watchdog del cliente necesita verlo). Termina al llegar a ``hasta`` (epoch s), que es
        cuando vence la sesión que pidió el ticket."""
        cola: asyncio.Queue[str] = asyncio.Queue(maxsize=256)
        self._colas.add(cola)
        try:
            yield "retry: 3000\n\n"
            while True:
                espera = HEARTBEAT_S
                if hasta is not None:
                    restante = hasta - time.time()
                    if restante <= 0:
                        yield "event: sesion_expirada\ndata: {}\n\n"
                        return
                    espera = min(espera, restante)
                try:
                    datos = await asyncio.wait_for(cola.get(), timeout=espera)
                    yield f"event: cupo\ndata: {datos}\n\n"
                except TimeoutError:
                    if hasta is None or hasta - time.time() > 0:
                        yield "event: ping\ndata: {}\n\n"
        finally:
            self._colas.discard(cola)
            if conexion is not None:
                conexion.cerrar()
