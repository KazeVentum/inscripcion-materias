"""Fixtures: las pruebas de integracion se saltan si el stack de Docker no esta alcanzable."""

from __future__ import annotations

import os
import socket

import pytest


def _abierto(host: str, puerto: int) -> bool:
    try:
        with socket.create_connection((host, puerto), timeout=1):
            return True
    except OSError:
        return False


def _stack_ok() -> bool:
    minio = os.environ.get("MINIO_ENDPOINT", "localhost:9000").split(":")
    kafka = os.environ.get("KAFKA_BROKERS", "localhost:19092").split(":")
    return (
        bool(os.environ.get("HASH_SALT"))
        and _abierto(minio[0], int(minio[1]))
        and _abierto(kafka[0], int(kafka[1]))
        and _abierto("localhost", 27017)
        and _abierto("localhost", 6379)
    )


STACK = _stack_ok()
requiere_stack = pytest.mark.skipif(
    not STACK, reason="stack de Docker no alcanzable o falta HASH_SALT (make up; cargue .env)"
)
