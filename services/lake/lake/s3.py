"""Acceso a MinIO (S3) con el SDK `minio`; DuckDB usa httpfs para leer y escribir Parquet."""

from __future__ import annotations

import io

from minio import Minio

from .config import Settings


def cliente(s: Settings) -> Minio:
    return Minio(
        s.minio_endpoint,
        access_key=s.minio_access_key,
        secret_key=s.minio_secret_key,
        secure=s.minio_secure,
    )


def asegurar_buckets(c: Minio, s: Settings) -> None:
    for b in (s.bucket_bronce, s.bucket_plata, s.bucket_oro):
        if not c.bucket_exists(b):
            c.make_bucket(b)


def subir(c: Minio, bucket: str, objeto: str, datos: bytes, content_type: str) -> None:
    c.put_object(bucket, objeto, io.BytesIO(datos), len(datos), content_type=content_type)


def listar(c: Minio, bucket: str, prefijo: str = "") -> list[str]:
    return sorted(
        o.object_name
        for o in c.list_objects(bucket, prefix=prefijo, recursive=True)
        if o.object_name is not None
    )


def leer(c: Minio, bucket: str, objeto: str) -> bytes:
    resp = c.get_object(bucket, objeto)
    try:
        return bytes(resp.read())
    finally:
        resp.close()
        resp.release_conn()
