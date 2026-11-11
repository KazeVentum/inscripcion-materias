"""Orquestacion bronce -> plata -> oro y escritura del reporte de validacion."""

from __future__ import annotations

import dataclasses
import json
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from minio import Minio
from minio.commonconfig import CopySource
from minio.deleteobjects import DeleteObject

from . import oro, plata, s3, validacion
from .catalogo import leer_catalogo
from .config import Settings
from .duck import conectar

log = logging.getLogger("lake.pipeline")
META = "_meta/validacion.json"


def _publicar(c: Minio, s: Settings, stg: Settings) -> None:
    """Copia lo calculado en staging a las rutas publicadas; el meta va al final."""
    for bucket in (s.bucket_plata, s.bucket_oro):
        for obj in s3.listar(c, bucket, stg.prefijo):
            destino = obj[len(stg.prefijo) :]
            if destino.startswith("_meta/"):
                continue
            c.copy_object(bucket, destino, CopySource(bucket, obj))


def _limpiar_staging(c: Minio, s: Settings, stg: Settings) -> None:
    for bucket in (s.bucket_plata, s.bucket_oro):
        objetos = s3.listar(c, bucket, stg.prefijo)
        for _ in c.remove_objects(bucket, [DeleteObject(o) for o in objetos]):
            pass


def recalcular(s: Settings) -> dict[str, Any]:
    """Plata y oro desde bronce, con publicacion condicionada a que los conteos cuadren.

    Todo se calcula en `_stg/<id>/` de cada bucket; solo si `cuadra` se copia a las rutas
    publicadas y se escribe `gold/_meta/validacion.json`. Si no cuadra, el oro publicado
    (y su meta) queda como estaba y se devuelve el meta del intento fallido.
    """
    c = s3.cliente(s)
    s3.asegurar_buckets(c, s)
    nrcs, ests = leer_catalogo(s)
    stg = dataclasses.replace(s, prefijo=f"_stg/{uuid.uuid4().hex}/")
    con = conectar(stg)
    try:
        try:
            pl = plata.ejecutar(con, stg, nrcs, ests)
            filas_oro = oro.ejecutar(con, stg)
            val = validacion.validar(con, stg, pl)
            val["oro"] = {"filas": filas_oro}
            meta = {
                "generadoEn": datetime.now(UTC)
                .isoformat(timespec="seconds")
                .replace("+00:00", "Z"),
                "resumen": validacion.resumen(con, stg),
                "validacion": val,
            }
        finally:
            con.close()
        if val["cuadra"]:
            _publicar(c, s, stg)
            s3.subir(
                c,
                s.bucket_oro,
                META,
                json.dumps(meta, ensure_ascii=False).encode(),
                "application/json",
            )
        else:
            log.error("los conteos no cuadran; no se publica el oro (se conserva el anterior)")
    finally:
        _limpiar_staging(c, s, stg)
    return meta


def imprimir(meta: dict[str, Any]) -> None:
    v = meta["validacion"]
    p = v["plata"]
    print(f"Generado en: {meta['generadoEn']}")
    print("Conteos de validacion")
    print(f"  bronce  lineas ........ {v['bronce']['lineas']}")
    print(
        f"  plata   eventos ....... {p['eventos']}  ({', '.join(f'{k}={n}' for k, n in p['filas'].items() if k != 'dim_nrc')})"
    )
    print(f"          duplicados .... {p['duplicados']}")
    print(f"          invalidos ..... {p['invalidos']}  {p['invalidosPorMotivo'] or ''}")
    print(f"          sin catalogo .. {p['sinCatalogo']}")
    print(f"  oro     filas ......... {v['oro']['filas']}")
    for chk in v["checks"]:
        marca = "OK " if chk["ok"] else "FALLA"
        print(f"  [{marca}] {chk['nombre']}: esperado={chk['esperado']} obtenido={chk['obtenido']}")
    print("RESULTADO:", "los conteos cuadran" if v["cuadra"] else "LOS CONTEOS NO CUADRAN")
