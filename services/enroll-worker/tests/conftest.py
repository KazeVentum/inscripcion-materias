"""Fixtures: las pruebas de integración se saltan si Redis/Mongo no están alcanzables."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator
from typing import Any

import pytest
import redis as redis_sync
from pymongo import AsyncMongoClient, MongoClient
from redis.asyncio import Redis

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017/inscripcion")


def _servicios_ok() -> bool:
    try:
        redis_sync.Redis.from_url(REDIS_URL, socket_connect_timeout=1).ping()
        MongoClient(MONGO_URL, serverSelectionTimeoutMS=1500).admin.command("ping")
        return True
    except Exception:  # cualquier fallo de conexión implica "saltar"
        return False


requiere_servicios = pytest.mark.skipif(
    not _servicios_ok(), reason="Redis/Mongo de Docker no alcanzables (make up)"
)


@pytest.fixture
async def redis() -> AsyncIterator[Redis]:
    r = Redis.from_url(REDIS_URL, decode_responses=True)
    yield r
    await r.aclose()


@pytest.fixture
async def db() -> AsyncIterator[Any]:
    cliente: AsyncMongoClient[dict[str, Any]] = AsyncMongoClient(MONGO_URL)
    yield cliente.get_default_database()
    await cliente.close()
