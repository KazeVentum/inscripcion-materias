"""Configuración desde variables de entorno."""

from __future__ import annotations

import os
from dataclasses import dataclass, field


def _env(nombre: str, defecto: str) -> str:
    return os.environ.get(nombre, defecto)


@dataclass(frozen=True)
class Settings:
    mongo_url: str = field(
        default_factory=lambda: _env("MONGO_URL", "mongodb://localhost:27017/inscripcion")
    )
    redis_url: str = field(default_factory=lambda: _env("REDIS_URL", "redis://localhost:6379/0"))
    kafka_brokers: str = field(default_factory=lambda: _env("KAFKA_BROKERS", "localhost:19092"))
    periodo: str = field(default_factory=lambda: _env("PERIODO", "2027-1"))
    fallo_sistema_academico: float = field(
        default_factory=lambda: float(_env("FALLO_SISTEMA_ACADEMICO", "0.0"))
    )
    latencia_min_ms: int = field(default_factory=lambda: int(_env("LATENCIA_MIN_MS", "50")))
    latencia_max_ms: int = field(default_factory=lambda: int(_env("LATENCIA_MAX_MS", "200")))
    conciliacion_s: float = field(default_factory=lambda: float(_env("CONCILIACION_S", "30")))
    heartbeat_file: str = field(default_factory=lambda: _env("HEARTBEAT_FILE", "/tmp/heartbeat"))

    topic_intentos: str = "inscripcion.intentos"
    topic_resultados: str = "inscripcion.resultados"
    topic_dlq: str = "inscripcion.dlq"
    max_intentos: int = 3
    grupo: str = "enroll-worker"
