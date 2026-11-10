"""Rutas de coordinacion (HU5): analitica de demanda leida del oro del data lake."""

from __future__ import annotations

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query, Request

from .config import COORDINADORES
from .errores import ApiError
from .schemas import (
    AuditoriaFila,
    AuditoriaOut,
    CombinacionesOut,
    CombinacionItem,
    CoordinadorOut,
    DemandaInsatisfechaItem,
    DemandaInsatisfechaOut,
    DemandaNrcItem,
    DemandaNrcOut,
    ErrorOut,
    OcupacionFranjaItem,
    OcupacionFranjaOut,
    ResumenOut,
    ValidacionOut,
)
from .seguridad import coordinador_actual

router = APIRouter(prefix="/coordinacion", tags=["coordinacion"])

Coord = Annotated[str, Depends(coordinador_actual)]
_RESP: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorOut, "description": "Sin token o token invalido"},
    403: {"model": ErrorOut, "description": "El usuario no es coordinador"},
}


def _lector(request: Request) -> Any:
    lector = getattr(request.app.state, "lector_oro", None)
    if lector is None:
        raise ApiError(503, "analitica_no_disponible", "La analitica no esta configurada")
    return lector


async def _generado_en(lector: Any) -> str | None:
    meta = await lector.meta()
    return None if meta is None else str(meta.get("generadoEn"))


@router.get("/me", response_model=CoordinadorOut, responses=_RESP, summary="Perfil del coordinador")
async def me(usuario: Coord) -> CoordinadorOut:
    return CoordinadorOut(usuarioId=usuario, nombre=COORDINADORES[usuario])


@router.get(
    "/analitica/resumen",
    response_model=ResumenOut,
    responses=_RESP,
    summary="KPIs del periodo y estado de la validacion bronce-plata-oro",
)
async def resumen(request: Request, _: Coord) -> ResumenOut:
    lector = _lector(request)
    meta = await lector.meta()
    if meta is None:
        return ResumenOut(generadoEn=None)
    val = meta["validacion"]
    plata = val["plata"]
    return ResumenOut(
        generadoEn=str(meta["generadoEn"]),
        **meta["resumen"],
        validacion=ValidacionOut(
            cuadra=val["cuadra"],
            lineasBronce=val["bronce"]["lineas"],
            eventosPlata=plata["eventos"],
            duplicados=plata["duplicados"],
            invalidos=plata["invalidos"],
            checks=val["checks"],
        ),
    )


_ORDENES: dict[str, tuple[str, bool]] = {
    "demanda": ("intentos", True),
    "sin_cupo": ("sinCupo", True),
    "ocupacion": ("ocupacion", True),
    "vacios": ("cuposVacios", True),
    "tiempo_llenado": ("tiempoHastaLlenarseS", False),
}


@router.get(
    "/analitica/demanda-nrc",
    response_model=DemandaNrcOut,
    responses=_RESP,
    summary="Demanda y ocupacion por NRC",
)
async def demanda_nrc(
    request: Request,
    _: Coord,
    orden: Annotated[
        Literal["demanda", "sin_cupo", "ocupacion", "vacios", "tiempo_llenado"], Query()
    ] = "demanda",
    limite: Annotated[int, Query(ge=1, le=1000)] = 100,
    materiaId: Annotated[str | None, Query(max_length=40)] = None,
    soloConIntentos: bool = False,
) -> DemandaNrcOut:
    lector = _lector(request)
    filas: list[dict[str, Any]] = await lector.tabla("demanda_nrc")
    if materiaId:
        filas = [f for f in filas if f.get("materiaId") == materiaId]
    if soloConIntentos:
        filas = [f for f in filas if f["intentos"] > 0]
    campo, desc = _ORDENES[orden]
    # los valores nulos (p. ej. NRC que nunca se lleno) van al final en cualquier orden
    con_valor = [f for f in filas if f.get(campo) is not None]
    sin_valor = [f for f in filas if f.get(campo) is None]
    con_valor.sort(key=lambda f: (f[campo], f["nrc"]) if not desc else (-f[campo], f["nrc"]))
    ordenadas = con_valor + sin_valor
    return DemandaNrcOut(
        generadoEn=await _generado_en(lector),
        total=len(ordenadas),
        items=[DemandaNrcItem.model_validate(f) for f in ordenadas[:limite]],
    )


@router.get(
    "/analitica/ocupacion-franja",
    response_model=OcupacionFranjaOut,
    responses=_RESP,
    summary="Ocupacion por franja (manana, tarde, noche) y sede",
)
async def ocupacion_franja(request: Request, _: Coord) -> OcupacionFranjaOut:
    lector = _lector(request)
    filas: list[dict[str, Any]] = await lector.tabla("ocupacion_franja")
    filas.sort(key=lambda f: (f["franja"], f["sede"]))
    return OcupacionFranjaOut(
        generadoEn=await _generado_en(lector),
        items=[OcupacionFranjaItem.model_validate(f) for f in filas],
    )


@router.get(
    "/analitica/combinaciones",
    response_model=CombinacionesOut,
    responses=_RESP,
    summary="Pares de NRC que los estudiantes inscriben juntos, por programa y semestre",
)
async def combinaciones(
    request: Request,
    _: Coord,
    semestre: Annotated[int | None, Query(ge=1, le=12)] = None,
    limite: Annotated[int, Query(ge=1, le=500)] = 50,
) -> CombinacionesOut:
    lector = _lector(request)
    filas: list[dict[str, Any]] = await lector.tabla("combinaciones_nrc")
    if semestre is not None:
        filas = [f for f in filas if f["semestre"] == semestre]
    filas.sort(key=lambda f: (-f["estudiantes"], f["programa"], f["nrcA"], f["nrcB"]))
    return CombinacionesOut(
        generadoEn=await _generado_en(lector),
        total=len(filas),
        items=[CombinacionItem.model_validate(f) for f in filas[:limite]],
    )


@router.get(
    "/analitica/auditoria",
    response_model=AuditoriaOut,
    responses=_RESP,
    summary="Resultado y latencia (p50/p95) de cada tipo de evento",
)
async def auditoria(request: Request, _: Coord) -> AuditoriaOut:
    lector = _lector(request)
    filas: list[dict[str, Any]] = await lector.tabla("auditoria_intentos")
    clave = lambda f: (f["fecha"] or "", f["tipo"], -f["n"], f["resultado"])  # noqa: E731
    total = sorted(
        (AuditoriaFila.model_validate(f) for f in filas if f["fecha"] is None),
        key=lambda f: (f.tipo, -f.n, f.resultado),
    )
    por_dia = sorted((f for f in filas if f["fecha"] is not None), key=clave)
    return AuditoriaOut(
        generadoEn=await _generado_en(lector),
        total=total,
        porDia=[AuditoriaFila.model_validate(f) for f in por_dia],
    )


@router.get(
    "/analitica/demanda-insatisfecha",
    response_model=DemandaInsatisfechaOut,
    responses=_RESP,
    summary="Materias con mas intentos sin cupo, para planear la oferta",
)
async def demanda_insatisfecha(
    request: Request, _: Coord, limite: Annotated[int, Query(ge=1, le=200)] = 20
) -> DemandaInsatisfechaOut:
    lector = _lector(request)
    filas: list[dict[str, Any]] = await lector.tabla("demanda_insatisfecha")
    filas.sort(key=lambda f: (-f["sinCupo"], f["materiaId"]))
    return DemandaInsatisfechaOut(
        generadoEn=await _generado_en(lector),
        items=[DemandaInsatisfechaItem.model_validate(f) for f in filas[:limite]],
    )
