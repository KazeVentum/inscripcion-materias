"""Recursos compartidos de la aplicación (se guardan en ``app.state.ctx``)."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from pymongo.asynchronous.database import AsyncDatabase
from redis.asyncio import Redis
from redis.commands.core import AsyncScript

from .catalogo import Catalogo
from .config import Settings
from .eventos import Productor
from .limites import LimiteIntentos
from .stream import Difusor


@dataclass
class Contexto:
    settings: Settings
    db: AsyncDatabase[Any]
    redis: Redis
    catalogo: Catalogo
    productor: Productor
    difusor: Difusor
    lua_reservar: AsyncScript
    lua_devolver: AsyncScript
    recomendador: Any = None
    limite_login: LimiteIntentos = field(default_factory=LimiteIntentos)
