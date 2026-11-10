"""Configuración desde variables de entorno (por defecto, los servicios vistos desde el host)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field


def _env(nombre: str, defecto: str) -> str:
    return os.environ.get(nombre, defecto)


def _requerida(nombre: str) -> str:
    """Variable sin valor por defecto: la API no arranca si falta."""
    valor = os.environ.get(nombre)
    if not valor:
        raise RuntimeError(f"Falta la variable de entorno obligatoria {nombre}")
    return valor


def _secreto_jwt() -> str:
    valor = _requerida("JWT_SECRET")
    if len(valor.encode()) < 32:
        raise RuntimeError("JWT_SECRET debe tener al menos 32 bytes")
    return valor


@dataclass(frozen=True)
class Settings:
    mongo_url: str = field(
        default_factory=lambda: _env("MONGO_URL", "mongodb://localhost:27017/inscripcion")
    )
    redis_url: str = field(default_factory=lambda: _env("REDIS_URL", "redis://localhost:6379/0"))
    kafka_brokers: str = field(default_factory=lambda: _env("KAFKA_BROKERS", "localhost:19092"))
    periodo: str = field(default_factory=lambda: _env("PERIODO", "2027-1"))
    jwt_secret: str = field(default_factory=_secreto_jwt)
    jwt_ttl_min: int = field(default_factory=lambda: int(_env("JWT_TTL_MIN", "60")))
    demo_password: str = field(default_factory=lambda: _requerida("DEMO_PASSWORD"))
    reserva_ttl_s: int = field(default_factory=lambda: int(_env("RESERVA_TTL_S", "300")))
    cors_origins: tuple[str, ...] = field(
        default_factory=lambda: tuple(
            o.strip() for o in _env("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()
        )
    )
    max_creditos_recomendacion: int = 18
    max_sse_por_estudiante: int = 3
    ticket_ttl_s: int = 60

    topic_intentos: str = "inscripcion.intentos"
    topic_busquedas: str = "oferta.busquedas"
