"""Carga de los scripts Lua compartidos (services/lua/, una sola versión para api y worker)."""

from __future__ import annotations

import os
from pathlib import Path

from redis.asyncio import Redis
from redis.commands.core import AsyncScript


def directorio_lua() -> Path:
    env = os.environ.get("LUA_DIR")
    if env:
        return Path(env)
    return Path(__file__).resolve().parents[2] / "lua"  # services/lua


def cargar(redis: Redis, nombre: str) -> AsyncScript:
    texto = (directorio_lua() / f"{nombre}.lua").read_text(encoding="utf-8")
    return redis.register_script(texto)
