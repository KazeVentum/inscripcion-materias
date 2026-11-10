"""Orquestacion bronce -> plata -> oro y escritura del reporte de validacion."""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

from . import oro, plata, s3, validacion
from .catalogo import leer_catalogo
from .config import Settings
from .duck import conectar

log = logging.getLogger("lake.pipeline")
META = "_meta/validacion.json"


def recalcular(s: Settings) -> dict[str, Any]:
    """Plata y oro desde bronce. Escribe `gold/_meta/validacion.json` y lo devuelve."""
    c = s3.cliente(s)
    s3.asegurar_buckets(c, s)
    nrcs, ests = leer_catalogo(s)
    con = conectar(s)
    try:
        pl = plata.ejecutar(con, s, nrcs, ests)
        filas_oro = oro.ejecutar(con, s)
        val = validacion.validar(con, s, pl)
        val["oro"] = {"filas": filas_oro}
        meta = {
            "generadoEn": datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "resumen": validacion.resumen(con, s),
            "validacion": val,
        }
    finally:
        con.close()
    s3.subir(
        c, s.bucket_oro, META, json.dumps(meta, ensure_ascii=False).encode(), "application/json"
    )
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
