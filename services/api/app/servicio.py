"""Operaciones sobre Redis/Mongo compartidas por las rutas."""

from __future__ import annotations

import json
from collections.abc import Iterable, Mapping
from datetime import UTC, datetime
from typing import Any

from . import claves
from .contexto import Contexto
from .dominio import NrcInfo, elegir_alternativa, nrc_en_conflicto


def iso_de_ms(ms: int) -> str:
    return (
        datetime.fromtimestamp(ms / 1000, UTC)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


async def leer_ocupado_y_libres(
    ctx: Contexto, estudiante_id: str, nrcs: list[str]
) -> tuple[dict[str, dict[str, Any]], dict[str, int]]:
    """Una sola ida a Redis: ``ocupado:{est}`` (HGETALL) y los cupos de ``nrcs`` (MGET)."""
    pipe = ctx.redis.pipeline(transaction=False)
    pipe.hgetall(claves.ocupado(estudiante_id))
    if nrcs:
        pipe.mget([claves.cupos(ctx.settings.periodo, n) for n in nrcs])
    res = await pipe.execute()
    ocupado = {nrc: json.loads(valor) for nrc, valor in res[0].items()}
    libres: dict[str, int] = {}
    if nrcs:
        libres = {n: int(v) if v is not None else 0 for n, v in zip(nrcs, res[1], strict=True)}
    return ocupado, libres


def nrc_a_dict(ctx: Contexto, nrc: str, libres: int) -> dict[str, Any]:
    doc = ctx.catalogo.nrc_doc[nrc]
    return {
        "nrc": nrc,
        "materiaId": doc["materiaId"],
        "titulo": doc["titulo"],
        "creditos": doc["creditos"],
        "sede": doc["sede"],
        "modalidad": doc["modalidad"],
        "docente": doc["docente"],
        "franja": doc["franja"],
        "cupoTotal": doc["cupoTotal"],
        "cuposLibres": libres,
        "bloques": doc["bloques"],
    }


def disponibles(
    nrcs: Iterable[NrcInfo],
    libres: Mapping[str, int],
    ocupado: Mapping[str, Mapping[str, Any]],
) -> list[NrcInfo]:
    """NRC con cupo > 0 y sin cruce con lo ocupado (regla central)."""
    return [
        n for n in nrcs if libres.get(n.nrc, 0) > 0 and nrc_en_conflicto(n.bloques, ocupado) is None
    ]


async def alternativa_para(
    ctx: Contexto, estudiante_id: str, objetivo: NrcInfo
) -> dict[str, Any] | None:
    ids = ctx.catalogo.nrc_por_materia.get(objetivo.materia_id, [])
    ocupado, libres = await leer_ocupado_y_libres(ctx, estudiante_id, ids)
    mejor = elegir_alternativa(objetivo, (ctx.catalogo.nrc_info[i] for i in ids), libres, ocupado)
    if mejor is None:
        return None
    return nrc_a_dict(ctx, mejor.nrc, libres[mejor.nrc])


async def devolver(ctx: Contexto, estudiante_id: str, nrc: str, conciliar: bool = False) -> int:
    """Lua devolver.lua. 1 = cupo devuelto, 0 = nada que devolver, -1 = falta cupototal."""
    p = ctx.settings.periodo
    res = await ctx.lua_devolver(
        keys=[
            claves.cupos(p, nrc),
            claves.cupototal(p, nrc),
            claves.ocupado(estudiante_id),
            claves.reserva(estudiante_id, nrc),
            claves.RESERVAS_PENDIENTES,
        ],
        args=[
            nrc,
            claves.miembro(estudiante_id, nrc),
            claves.canal_cupos(p),
            "conciliar" if conciliar else "",
        ],
    )
    return int(res[0])
