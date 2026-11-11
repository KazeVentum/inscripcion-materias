"""Conexion DuckDB con httpfs apuntando a MinIO."""

from __future__ import annotations

import os
from typing import Any

import duckdb

from .config import Settings


def conectar(s: Settings) -> Any:
    con = duckdb.connect(":memory:")
    if s.duckdb_extensiones:
        con.execute(f"SET extension_directory='{s.duckdb_extensiones}'")
    os.makedirs(s.duckdb_tmp, exist_ok=True)
    con.execute(f"SET temp_directory='{s.duckdb_tmp}'")
    con.execute(f"SET max_temp_directory_size='{s.duckdb_tmp_max}'")
    con.execute(f"SET memory_limit='{s.duckdb_memoria}'")
    con.execute("SET threads=2")
    con.execute("SET TimeZone='UTC'")
    con.execute("INSTALL httpfs")  # no hace nada si la extension ya esta instalada
    con.execute("LOAD httpfs")
    con.execute(f"SET s3_endpoint='{s.minio_endpoint}'")
    con.execute("SET s3_url_style='path'")
    con.execute(f"SET s3_use_ssl={'true' if s.minio_secure else 'false'}")
    con.execute("SET s3_region='us-east-1'")
    con.execute(f"SET s3_access_key_id='{s.minio_access_key}'")
    con.execute(f"SET s3_secret_access_key='{s.minio_secret_key}'")
    return con
