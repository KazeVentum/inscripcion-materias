"""Configuracion desde variables de entorno (por defecto, los servicios vistos desde el host)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field


def _env(nombre: str, defecto: str) -> str:
    return os.environ.get(nombre, defecto)


def _requerida(nombre: str) -> str:
    valor = os.environ.get(nombre)
    if not valor:
        raise RuntimeError(f"Falta la variable de entorno obligatoria {nombre}")
    return valor


@dataclass(frozen=True)
class Settings:
    kafka_brokers: str = field(default_factory=lambda: _env("KAFKA_BROKERS", "localhost:19092"))
    grupo: str = field(default_factory=lambda: _env("LAKE_GRUPO", "lake-bronce"))
    topics: tuple[str, ...] = (
        "inscripcion.intentos",
        "inscripcion.resultados",
        "oferta.busquedas",
    )
    minio_endpoint: str = field(default_factory=lambda: _env("MINIO_ENDPOINT", "localhost:9000"))
    minio_access_key: str = field(default_factory=lambda: _env("MINIO_ACCESS_KEY", "minio-dev"))
    minio_secret_key: str = field(
        default_factory=lambda: _env("MINIO_SECRET_KEY", "minio-dev-secret")
    )
    minio_secure: bool = field(
        default_factory=lambda: _env("MINIO_SECURE", "false").lower() in ("1", "true", "yes")
    )
    mongo_url: str = field(
        default_factory=lambda: _env("MONGO_URL", "mongodb://localhost:27017/inscripcion")
    )
    redis_url: str = field(default_factory=lambda: _env("REDIS_URL", "redis://localhost:6379/0"))
    periodo: str = field(default_factory=lambda: _env("PERIODO", "2027-1"))
    # La sal no tiene valor por defecto: sin ella no se anonimiza y el lake no debe arrancar.
    hash_salt: str = field(default_factory=lambda: _requerida("HASH_SALT"))
    # Bronce: se escribe un lote al llegar a lote_max mensajes o tras lote_max_s segundos.
    lote_max: int = field(default_factory=lambda: int(_env("LAKE_LOTE_MAX", "500")))
    lote_max_s: float = field(default_factory=lambda: float(_env("LAKE_LOTE_MAX_S", "3")))
    # Plata/oro se recalculan cada N minutos en el lake-worker.
    recalculo_min: float = field(default_factory=lambda: float(_env("LAKE_RECALCULO_MIN", "5")))
    combos_min_estudiantes: int = field(
        default_factory=lambda: int(_env("LAKE_COMBOS_MIN_ESTUDIANTES", "2"))
    )
    duckdb_memoria: str = field(default_factory=lambda: _env("LAKE_DUCKDB_MEMORIA", "192MB"))
    duckdb_extensiones: str = field(default_factory=lambda: _env("DUCKDB_EXTENSION_DIR", ""))
    duckdb_tmp: str = field(default_factory=lambda: _env("DUCKDB_TMP_DIR", "/tmp/duckdb"))
    heartbeat_file: str = field(default_factory=lambda: _env("HEARTBEAT_FILE", "/tmp/heartbeat"))

    # Prefijo de las rutas de DuckDB: "s3://" en produccion; una carpeta local en pruebas
    esquema: str = "s3://"
    bucket_bronce: str = "bronze"
    bucket_plata: str = "silver"
    bucket_oro: str = "gold"
