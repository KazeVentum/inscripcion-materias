"""Carga real en Mongo y Redis (integración): dos cargas seguidas deben ser idénticas y consistentes.

Requiere MONGO_URL y REDIS_URL alcanzables; si no responden, la prueba se salta.
"""

from __future__ import annotations

import os
from typing import Any

import pytest
import redis
from pymongo import MongoClient
from pymongo.errors import PyMongoError

from seed.load import DEFAULT_MONGO_URL, DEFAULT_REDIS_URL, cargar

MONGO_URL = os.environ.get("MONGO_URL", DEFAULT_MONGO_URL)
REDIS_URL = os.environ.get("REDIS_URL", DEFAULT_REDIS_URL)


def _servicios_disponibles() -> bool:
    try:
        cliente: MongoClient[Any] = MongoClient(MONGO_URL, serverSelectionTimeoutMS=2000)
        try:
            cliente.admin.command("ping")
        finally:
            cliente.close()
        r = redis.Redis.from_url(REDIS_URL, socket_connect_timeout=2)
        try:
            r.ping()
        finally:
            r.close()
    except (PyMongoError, redis.RedisError, OSError):
        return False
    return True


def _estado_redis() -> dict[str, Any]:
    r = redis.Redis.from_url(REDIS_URL, decode_responses=True)
    try:
        estado: dict[str, Any] = {}
        for patron in ("cupos:*", "cupototal:*"):
            for clave in sorted(r.scan_iter(match=patron)):
                estado[clave] = r.get(clave)
        for clave in sorted(r.scan_iter(match="ocupado:*")):
            estado[clave] = dict(r.hgetall(clave))
        return estado
    finally:
        r.close()


@pytest.mark.integration
def test_cargar_dos_veces_es_idempotente_y_consistente(datos: dict[str, list[dict[str, Any]]]) -> None:
    if not _servicios_disponibles():
        pytest.skip(f"Mongo ({MONGO_URL}) o Redis ({REDIS_URL}) no responden")

    assert cargar(datos, MONGO_URL, REDIS_URL) == []
    primera = _estado_redis()
    assert primera, "Redis debe quedar con claves cupos/cupototal/ocupado"

    assert cargar(datos, MONGO_URL, REDIS_URL) == []
    assert _estado_redis() == primera
