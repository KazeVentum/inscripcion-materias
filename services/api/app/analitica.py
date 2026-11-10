"""Lectura de las tablas oro (Parquet en MinIO) con DuckDB + httpfs, con cache corta.

La API no se cae si gold aun no existe o MinIO no responde: cada lectura devuelve vacio.
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
from datetime import date, datetime
from decimal import Decimal
from typing import Any

import duckdb

from .config import Settings

log = logging.getLogger("api.analitica")
META = "_meta/validacion.json"
_ERROR_TTL_S = 3.0  # un fallo se recuerda poco, para no martillar a MinIO ni quedar pegado


def _json(v: Any) -> Any:
    if isinstance(v, datetime):
        return v.isoformat(timespec="seconds") + "Z"
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, float):
        return round(v, 4)
    return v


class LectorOro:
    def __init__(self, settings: Settings) -> None:
        self.s = settings
        self._con: Any = None
        self._lock = threading.Lock()
        self._cache: dict[str, tuple[float, Any]] = {}

    def _conectar(self) -> Any:
        con = duckdb.connect(":memory:")
        if self.s.duckdb_extensiones:
            con.execute(f"SET extension_directory='{self.s.duckdb_extensiones}'")
            con.execute("SET home_directory='/tmp'")
        con.execute("SET temp_directory='/tmp/duckdb'")
        con.execute("SET memory_limit='64MB'")
        con.execute("SET threads=1")
        con.execute("SET TimeZone='UTC'")
        con.execute("INSTALL httpfs")
        con.execute("LOAD httpfs")
        con.execute(f"SET s3_endpoint='{self.s.minio_endpoint}'")
        con.execute("SET s3_url_style='path'")
        con.execute(f"SET s3_use_ssl={'true' if self.s.minio_secure else 'false'}")
        con.execute("SET s3_region='us-east-1'")
        con.execute(f"SET s3_access_key_id='{self.s.minio_access_key}'")
        con.execute(f"SET s3_secret_access_key='{self.s.minio_secret_key}'")
        return con

    def _leer_tabla(self, nombre: str) -> list[dict[str, Any]]:
        with self._lock:
            if self._con is None:
                self._con = self._conectar()
            cur = self._con.execute(
                f"SELECT * FROM read_parquet('s3://{self.s.bucket_oro}/{nombre}.parquet')"
            )
            cols = [d[0] for d in cur.description]
            return [dict(zip(cols, map(_json, fila), strict=True)) for fila in cur.fetchall()]

    def _leer_meta(self) -> dict[str, Any] | None:
        with self._lock:
            if self._con is None:
                self._con = self._conectar()
            fila = self._con.execute(
                f"SELECT content FROM read_text('s3://{self.s.bucket_oro}/{META}')"
            ).fetchone()
        datos = json.loads(fila[0])
        return datos if isinstance(datos, dict) else None

    async def _con_cache(self, clave: str, vacio: Any, leer: Any) -> Any:
        ahora = time.monotonic()
        hit = self._cache.get(clave)
        if hit is not None and hit[0] > ahora:
            return hit[1]
        try:
            valor = await asyncio.to_thread(leer)
            self._cache[clave] = (ahora + self.s.analitica_cache_s, valor)
            return valor
        except Exception as exc:  # gold inexistente, MinIO caido, parquet a medio escribir
            log.warning("oro no disponible (%s): %s", clave, type(exc).__name__)
            if self._con is not None and not isinstance(exc, duckdb.IOException):
                self._con = None  # reconstruye la conexion en el siguiente intento
            self._cache[clave] = (ahora + _ERROR_TTL_S, vacio)
            return vacio

    async def tabla(self, nombre: str) -> list[dict[str, Any]]:
        res: list[dict[str, Any]] = await self._con_cache(
            f"t:{nombre}", [], lambda: self._leer_tabla(nombre)
        )
        return res

    async def meta(self) -> dict[str, Any] | None:
        res: dict[str, Any] | None = await self._con_cache("meta", None, self._leer_meta)
        return res
