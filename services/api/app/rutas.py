"""Rutas de la API bajo /api/v1."""

from __future__ import annotations

import asyncio
import hmac
import logging
import time
import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.background import BackgroundTask

from . import claves
from .config import COORDINADORES, ROL_COORDINADOR
from .contexto import Contexto
from .dominio import MateriaPensum, calcular_avance, en_jornada, evaluar_habilitacion
from .errores import ApiError
from .eventos import ahora_iso, construir_evento
from .schemas import (
    AvanceOut,
    ErrorOut,
    EstadoInscripcionOut,
    HorarioOut,
    InscripcionIn,
    LoginIn,
    LoginOut,
    MateriaAvanceOut,
    MateriaHabilitadaOut,
    NrcOut,
    PerfilOut,
    RecomendacionOut,
    ReservaOut,
    TicketOut,
)
from .seguridad import (
    Sesion,
    crear_ticket,
    crear_token,
    estudiante_actual,
    sesion_actual,
    sesion_de_ticket,
)
from .servicio import (
    alternativa_para,
    devolver,
    disponibles,
    iso_de_ms,
    leer_ocupado_y_libres,
    nrc_a_dict,
)

log = logging.getLogger("api")
router = APIRouter()


def get_ctx(request: Request) -> Contexto:
    ctx: Contexto = request.app.state.ctx
    return ctx


Ctx = Annotated[Contexto, Depends(get_ctx)]
Est = Annotated[str, Depends(estudiante_actual)]

_AUTH: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorOut, "description": "Sin token o token inválido"}
}


def _ms(t0: float) -> int:
    return int((time.perf_counter() - t0) * 1000)


# ------------------------------------------------------------------------- health


@router.get("/health", tags=["sistema"], summary="Estado de mongo, redis y kafka")
async def health(ctx: Ctx) -> JSONResponse:
    async def mongo() -> bool:
        try:
            await ctx.db.command("ping")
            return True
        except Exception:
            return False

    async def redis_ok() -> bool:
        try:
            return bool(await ctx.redis.ping())
        except Exception:
            return False

    m, r, k = await asyncio.gather(mongo(), redis_ok(), ctx.productor.salud())
    ok = m and r and k
    return JSONResponse(
        {"estado": "ok" if ok else "degradado", "mongo": m, "redis": r, "kafka": k},
        status_code=200 if ok else 503,
    )


# --------------------------------------------------------------------------- auth


@router.post(
    "/auth/login",
    response_model=LoginOut,
    tags=["auth"],
    summary="Login simulado (Entra ID)",
    responses={401: {"model": ErrorOut}, 429: {"model": ErrorOut}},
)
async def login(body: LoginIn, ctx: Ctx) -> LoginOut:
    clave_limite = body.usuario.strip().lower()
    espera = ctx.limite_login.espera_s(clave_limite)
    if espera > 0:
        raise ApiError(
            429,
            "demasiados_intentos",
            "Demasiados intentos fallidos; espera un momento",
            headers={"Retry-After": str(int(espera) + 1)},
        )
    clave_ok = hmac.compare_digest(body.password.encode(), ctx.settings.demo_password.encode())
    coord = body.usuario.strip().lower()
    if coord in COORDINADORES and clave_ok:
        token, ttl = crear_token(ctx.settings, coord, ROL_COORDINADOR)
        log.info("login coordinador ok")
        return LoginOut(accessToken=token, expiraEnS=ttl, estudianteId=coord, rol="coordinador")
    est = await ctx.catalogo.buscar_para_login(ctx.db, body.usuario)
    if est is None or not clave_ok:
        ctx.limite_login.registrar_fallo(clave_limite)
        raise ApiError(401, "credenciales_invalidas", "Usuario o contraseña incorrectos")
    token, ttl = crear_token(ctx.settings, est.estudiante_id)
    log.info("login estudiante ok")
    return LoginOut(accessToken=token, expiraEnS=ttl, estudianteId=est.estudiante_id)


async def _estudiante(ctx: Contexto, estudiante_id: str) -> Any:
    est = await ctx.catalogo.estudiante(ctx.db, estudiante_id)
    if est is None:
        raise ApiError(401, "no_autorizado", "El estudiante del token no existe")
    return est


@router.get("/me", response_model=PerfilOut, tags=["auth"], responses=_AUTH)
async def me(ctx: Ctx, est_id: Est) -> PerfilOut:
    est = await _estudiante(ctx, est_id)
    return PerfilOut(
        estudianteId=est.estudiante_id,
        nombre=est.nombre,
        programa=est.programa,
        sede=est.sede,
        semestre=est.semestre,
        jornada=est.jornada,
        creditosAprobados=est.creditos_aprobados,
    )


@router.get(
    "/avance",
    response_model=AvanceOut,
    tags=["oferta"],
    summary="Materias que te faltan por inscribir según tu semestre actual",
    responses=_AUTH,
)
async def avance(ctx: Ctx, est_id: Est) -> AvanceOut:
    """Endpoint propio y no parte de ``/me``: ``/me`` es barato y se pide en cada pantalla,
    mientras que el avance lee Redis (cupos y ocupado) y cambia con cada inscripción."""
    cat = ctx.catalogo
    est = await _estudiante(ctx, est_id)
    todos = [n for nrcs in cat.nrc_por_materia.values() for n in nrcs]
    ocupado, libres = await leer_ocupado_y_libres(ctx, est_id, todos)
    inscritas = {e["materiaId"] for e in ocupado.values()}
    pensum = [
        MateriaPensum(m.materia_id, m.nombre, m.semestre, m.electiva)
        for m in (cat.materias[mid] for mid in cat.materias_pensum)
    ]
    res = calcular_avance(
        est.semestre,
        pensum,
        est.aprobadas,
        inscritas,
        lambda mid: (
            evaluar_habilitacion(
                mid, cat.prerrequisitos, cat.creditos_minimos, est.aprobadas, est.creditos_aprobados
            ).habilitada
        ),
        lambda mid: bool(
            disponibles(
                (cat.nrc_info[n] for n in cat.nrc_por_materia.get(mid, [])),
                libres,
                ocupado,
                est.jornada,
            )
        ),
    )

    def fila(i: Any) -> MateriaAvanceOut:
        return MateriaAvanceOut(
            materiaId=i.materia_id, nombre=i.nombre, semestre=i.semestre, estado=i.estado
        )

    return AvanceOut(
        semestreActual=res.semestre_actual,
        totalPendientes=res.total_pendientes,
        inscritas=res.inscritas,
        faltan=res.faltan,
        habilitadasSinInscribir=res.habilitadas_sin_inscribir,
        materias=[fila(i) for i in res.materias],
        atrasadas=[fila(i) for i in res.atrasadas],
        mensaje=res.mensaje,
    )


# ------------------------------------------------------------------------ oferta


@router.get(
    "/materias/habilitadas",
    response_model=list[MateriaHabilitadaOut],
    tags=["oferta"],
    summary="Materias con prerrequisitos aprobados y no aprobadas (HU1)",
    responses=_AUTH,
)
async def materias_habilitadas(ctx: Ctx, est_id: Est) -> list[MateriaHabilitadaOut]:
    cat = ctx.catalogo
    est = await _estudiante(ctx, est_id)
    todos = [n for nrcs in cat.nrc_por_materia.values() for n in nrcs]
    ocupado, libres = await leer_ocupado_y_libres(ctx, est_id, todos)
    inscritas = {e["materiaId"] for e in ocupado.values()}

    salida: list[MateriaHabilitadaOut] = []
    for mid in cat.materias_pensum:
        if not evaluar_habilitacion(
            mid, cat.prerrequisitos, cat.creditos_minimos, est.aprobadas, est.creditos_aprobados
        ).habilitada:
            continue
        m = cat.materias[mid]
        inscrita = mid in inscritas
        n_disp = (
            0
            if inscrita
            else len(
                disponibles(
                    (cat.nrc_info[n] for n in cat.nrc_por_materia.get(mid, [])),
                    libres,
                    ocupado,
                    est.jornada,
                )
            )
        )
        salida.append(
            MateriaHabilitadaOut(
                materiaId=mid,
                nombre=m.nombre,
                creditos=m.creditos,
                semestre=m.semestre,
                area=m.area,
                estado="inscrita" if inscrita else "pendiente",
                nrcDisponibles=n_disp,
            )
        )
    salida.sort(key=lambda x: (x.semestre, x.materiaId))
    return salida


@router.get(
    "/materias/{materiaId}/nrc",
    response_model=list[NrcOut],
    tags=["oferta"],
    summary="NRC inscribibles de una materia: con cupo y sin cruce (regla central)",
    responses={**_AUTH, 403: {"model": ErrorOut}, 404: {"model": ErrorOut}},
)
async def nrc_de_materia(materiaId: str, ctx: Ctx, est_id: Est) -> list[NrcOut]:
    t0 = time.perf_counter()
    cat = ctx.catalogo
    if materiaId not in cat.materias:
        raise ApiError(404, "materia_inexistente", f"La materia {materiaId} no existe")
    est = await _estudiante(ctx, est_id)
    hab = evaluar_habilitacion(
        materiaId, cat.prerrequisitos, cat.creditos_minimos, est.aprobadas, est.creditos_aprobados
    )
    if not hab.habilitada:
        raise ApiError(403, "prerrequisito", hab.motivo)

    ids = cat.nrc_por_materia.get(materiaId, [])
    ocupado, libres = await leer_ocupado_y_libres(ctx, est_id, ids)
    ok = disponibles((cat.nrc_info[n] for n in ids), libres, ocupado, est.jornada)
    salida = [NrcOut(**nrc_a_dict(ctx, n.nrc, libres[n.nrc])) for n in ok]
    await ctx.productor.publicar(
        ctx.settings.topic_busquedas,
        est_id,
        construir_evento(
            "busqueda",
            ctx.settings.periodo,
            est_id,
            "exito",
            materia_id=materiaId,
            latencia_ms=_ms(t0),
            resultados=len(salida),
        ),
    )
    return salida


# --------------------------------------------------------------------- inscripción


async def _publicar_intento(
    ctx: Contexto,
    est_id: str,
    nrc: str,
    materia_id: str | None,
    resultado: str,
    t0: float,
    alternativa: str | None = None,
    *,
    confirmado: bool = False,
    **extra: Any,
) -> bool:
    """Publica el intento. Con ``confirmado`` espera el ack del broker y devuelve si llegó."""
    evento = construir_evento(
        "intento",
        ctx.settings.periodo,
        est_id,
        resultado,
        nrc=nrc,
        materia_id=materia_id,
        latencia_ms=_ms(t0),
        alternativa_nrc=alternativa,
        **extra,
    )
    if confirmado:
        return await ctx.productor.publicar_confirmado(ctx.settings.topic_intentos, est_id, evento)
    await ctx.productor.publicar(ctx.settings.topic_intentos, est_id, evento)
    return True


@router.post(
    "/inscripciones",
    status_code=202,
    response_model=ReservaOut,
    tags=["inscripciones"],
    summary="Reserva atómica de cupo (HU4); el worker la confirma después",
    responses={
        **_AUTH,
        403: {"model": ErrorOut, "description": "prerrequisito"},
        404: {"model": ErrorOut, "description": "NRC inexistente"},
        409: {
            "model": ErrorOut,
            "description": "sin_cupo | cruce | ya_inscrita | materia_aprobada | fuera_de_jornada",
        },
    },
)
async def inscribir(body: InscripcionIn, ctx: Ctx, est_id: Est) -> ReservaOut:
    t0 = time.perf_counter()
    cat = ctx.catalogo
    periodo = ctx.settings.periodo
    info = cat.nrc_info.get(body.nrc)
    if info is None:
        raise ApiError(404, "nrc_inexistente", f"El NRC {body.nrc} no existe")
    est = await _estudiante(ctx, est_id)

    if info.materia_id in est.aprobadas:
        await _publicar_intento(
            ctx, est_id, info.nrc, info.materia_id, "error", t0, motivo="materia_aprobada"
        )
        raise ApiError(409, "materia_aprobada", "Ya aprobaste esta materia")
    hab = evaluar_habilitacion(
        info.materia_id,
        cat.prerrequisitos,
        cat.creditos_minimos,
        est.aprobadas,
        est.creditos_aprobados,
    )
    if not hab.habilitada:
        await _publicar_intento(ctx, est_id, info.nrc, info.materia_id, "prerrequisito", t0)
        raise ApiError(403, "prerrequisito", hab.motivo)

    if not en_jornada(info.bloques, est.jornada):
        # dato estable: se valida en la API, antes de tocar Redis
        await _publicar_intento(ctx, est_id, info.nrc, info.materia_id, "fuera_de_jornada", t0)
        raise ApiError(
            409,
            "fuera_de_jornada",
            f"El NRC {info.nrc} está fuera de tu jornada ({est.jornada})",
        )

    vence_ms = int(time.time() * 1000) + ctx.settings.reserva_ttl_s * 1000
    reserva_id = str(uuid.uuid4())
    res = await ctx.lua_reservar(
        keys=[
            claves.cupos(periodo, info.nrc),
            claves.ocupado(est_id),
            claves.reserva(est_id, info.nrc),
            claves.RESERVAS_PENDIENTES,
        ],
        args=[
            info.nrc,
            cat.ocupado_json[info.nrc],
            vence_ms,
            ctx.settings.reserva_ttl_s,
            claves.miembro(est_id, info.nrc),
            claves.canal_cupos(periodo),
            reserva_id,
        ],
    )
    estado, extra = str(res[0]), res[1]
    log.info("inscripcion estudiante=%s nrc=%s resultado=%s", est_id, info.nrc, estado)

    if estado == "ok":
        entregado = await _publicar_intento(
            ctx,
            est_id,
            info.nrc,
            info.materia_id,
            "exito",
            t0,
            confirmado=True,
            reservaId=reserva_id,
        )
        if not entregado:
            # el worker nunca vería esta reserva: se deshace y no se promete nada
            await devolver(ctx, est_id, info.nrc)
            log.error("reserva deshecha: no se pudo publicar el intento (estudiante=%s)", est_id)
            raise ApiError(
                503,
                "servicio_no_disponible",
                "No pudimos registrar tu intento; reintenta en un momento",
            )
        return ReservaOut(
            nrc=info.nrc,
            materiaId=info.materia_id,
            cuposLibres=int(extra),
            vencimiento=iso_de_ms(vence_ms),
        )
    if estado == "sin_cupo":
        alt = await alternativa_para(ctx, est_id, info, est.jornada)
        await _publicar_intento(
            ctx, est_id, info.nrc, info.materia_id, "sin_cupo", t0, alt["nrc"] if alt else None
        )
        raise ApiError(
            409,
            "sin_cupo",
            "El NRC se llenó"
            + (
                f"; el NRC {alt['nrc']} es la alternativa más cercana"
                if alt
                else " y no hay alternativas"
            ),
            alternativa=alt,
        )
    if estado == "cruce":
        await _publicar_intento(
            ctx, est_id, info.nrc, info.materia_id, "cruce", t0, conflicto=str(extra)
        )
        titulo = cat.nrc_doc.get(str(extra), {}).get("titulo", "otra materia")
        raise ApiError(
            409,
            "cruce",
            f"Se cruza con el NRC {extra} ({titulo})",
            extra={"conflicto": {"nrc": str(extra)}},
        )
    if estado == "ya_inscrita":
        await _publicar_intento(
            ctx, est_id, info.nrc, info.materia_id, "error", t0, motivo="ya_inscrita"
        )
        raise ApiError(409, "ya_inscrita", f"Ya tienes la materia inscrita (NRC {extra})")
    await _publicar_intento(ctx, est_id, info.nrc, info.materia_id, "error", t0, motivo=str(extra))
    raise ApiError(500, "error_interno", "No se pudo reservar el cupo")


@router.get(
    "/inscripciones/{nrc}",
    response_model=EstadoInscripcionOut,
    tags=["inscripciones"],
    summary="Estado actual de la inscripción en un NRC",
    responses={**_AUTH, 404: {"model": ErrorOut}},
)
async def estado_inscripcion(nrc: str, ctx: Ctx, est_id: Est) -> EstadoInscripcionOut:
    periodo = ctx.settings.periodo
    pipe = ctx.redis.pipeline(transaction=False)
    pipe.exists(claves.reserva(est_id, nrc))
    pipe.zscore(claves.RESERVAS_PENDIENTES, claves.miembro(est_id, nrc))
    hay_reserva, vence = await pipe.execute()
    materia = ctx.catalogo.nrc_doc.get(nrc, {}).get("materiaId")
    doc = await ctx.db["inscripciones"].find_one({"_id": f"{periodo}|{est_id}|{nrc}"})
    # Mongo (sistema oficial) manda si ya confirmó; si no, una reserva viva en Redis
    # es el estado actual (también tras cancelar y volver a inscribir el mismo NRC).
    if hay_reserva and (doc is None or doc["estado"] != "confirmada"):
        return EstadoInscripcionOut(
            nrc=nrc,
            materiaId=materia,
            estado="reservada",
            vencimiento=iso_de_ms(int(vence)) if vence is not None else None,
        )
    if doc is None:
        raise ApiError(404, "sin_inscripcion", f"No hay inscripción en el NRC {nrc}")
    return EstadoInscripcionOut(
        nrc=nrc,
        materiaId=doc.get("materiaId", materia),
        estado=doc["estado"],
        motivo=doc.get("motivo"),
        actualizadaEn=doc.get("actualizadaEn", doc.get("creadaEn")),
    )


@router.delete(
    "/inscripciones/{nrc}",
    response_model=EstadoInscripcionOut,
    tags=["inscripciones"],
    summary="Cancela la inscripción (o reserva) y devuelve el cupo",
    responses={**_AUTH, 404: {"model": ErrorOut}},
)
async def cancelar(nrc: str, ctx: Ctx, est_id: Est) -> EstadoInscripcionOut:
    t0 = time.perf_counter()
    periodo = ctx.settings.periodo
    cat = ctx.catalogo
    info = cat.nrc_info.get(nrc)
    if info is None:
        raise ApiError(404, "nrc_inexistente", f"El NRC {nrc} no existe")
    _id = f"{periodo}|{est_id}|{nrc}"
    pipe = ctx.redis.pipeline(transaction=False)
    pipe.hexists(claves.ocupado(est_id), nrc)
    en_redis = (await pipe.execute())[0]
    previa = await ctx.db["inscripciones"].find_one({"_id": _id}, {"estado": 1})
    estaba_confirmada = previa is not None and previa["estado"] == "confirmada"
    if not en_redis and not estaba_confirmada:
        raise ApiError(404, "sin_inscripcion", f"No tienes inscripción en el NRC {nrc}")

    # Mongo primero: el worker ve la cancelación y no confirma una reserva ya cancelada
    ahora = ahora_iso()
    await ctx.db["inscripciones"].update_one(
        {"_id": _id},
        {
            "$set": {"estado": "cancelada", "actualizadaEn": ahora},
            "$unset": {"motivo": ""},
            "$setOnInsert": {
                "estudianteId": est_id,
                "nrc": nrc,
                "materiaId": info.materia_id,
                "periodo": periodo,
                "creadaEn": ahora,
            },
        },
        upsert=True,
    )
    devuelto = await devolver(ctx, est_id, nrc)
    if devuelto != 1 and estaba_confirmada:
        log.warning(
            "inconsistencia: cancelación de inscripción confirmada sin cupo que devolver "
            "(estudiante=%s nrc=%s resultado=%s)",
            est_id,
            nrc,
            devuelto,
        )
    log.info("cancelacion estudiante=%s nrc=%s", est_id, nrc)
    await ctx.productor.publicar(
        ctx.settings.topic_intentos,
        est_id,
        construir_evento(
            "cancelacion",
            periodo,
            est_id,
            "exito",
            nrc=nrc,
            materia_id=info.materia_id,
            latencia_ms=_ms(t0),
        ),
    )
    return EstadoInscripcionOut(
        nrc=nrc, materiaId=info.materia_id, estado="cancelada", actualizadaEn=ahora
    )


@router.get(
    "/horario",
    response_model=HorarioOut,
    tags=["inscripciones"],
    summary="Inscripciones confirmadas (Mongo) y reservadas (Redis)",
    responses=_AUTH,
)
async def horario(ctx: Ctx, est_id: Est) -> HorarioOut:
    periodo = ctx.settings.periodo
    cat = ctx.catalogo

    async def confirmadas() -> set[str]:
        cursor = ctx.db["inscripciones"].find(
            {"estudianteId": est_id, "periodo": periodo, "estado": "confirmada"}, {"nrc": 1}
        )
        return {d["nrc"] async for d in cursor}

    (ocupado, _), conf = await asyncio.gather(leer_ocupado_y_libres(ctx, est_id, []), confirmadas())
    nrcs = sorted((set(ocupado) | conf) & set(cat.nrc_doc))
    pipe = ctx.redis.pipeline(transaction=False)
    for n in nrcs:
        pipe.get(claves.cupos(periodo, n))
        pipe.zscore(claves.RESERVAS_PENDIENTES, claves.miembro(est_id, n))
    plano = await pipe.execute() if nrcs else []
    items: list[dict[str, Any]] = []
    for i, n in enumerate(nrcs):
        cupos, reserva = plano[2 * i], plano[2 * i + 1]
        base = nrc_a_dict(ctx, n, int(cupos) if cupos is not None else 0)
        if n in conf:
            base.update(estado="confirmada", vencimiento=None)
        else:
            base.update(
                estado="reservada",
                vencimiento=iso_de_ms(int(reserva)) if reserva is not None else None,
            )
        items.append(base)
    items.sort(key=lambda x: x["titulo"])
    return HorarioOut(
        periodo=periodo,
        creditosTotales=sum(int(x["creditos"]) for x in items),
        inscripciones=items,  # type: ignore[arg-type]
    )


# ----------------------------------------------------------------- recomendaciones


@router.get(
    "/recomendaciones",
    response_model=RecomendacionOut,
    tags=["oferta"],
    summary="Horario sugerido sin cruces (~18 créditos)",
    responses=_AUTH,
)
async def recomendaciones(ctx: Ctx, est_id: Est) -> RecomendacionOut:
    await _estudiante(ctx, est_id)
    resultado: RecomendacionOut = await ctx.recomendador.recomendar(ctx, est_id)
    return resultado


# ------------------------------------------------------------------------ stream


@router.post(
    "/stream/ticket",
    response_model=TicketOut,
    tags=["oferta"],
    summary="Ticket de 60 s para abrir /stream/cupos (EventSource no envía headers)",
    responses=_AUTH,
)
async def stream_ticket(ctx: Ctx, sesion: Annotated[Sesion, Depends(sesion_actual)]) -> TicketOut:
    ticket, ttl = crear_ticket(ctx.settings, sesion)
    return TicketOut(ticket=ticket, expiraEnS=ttl)


@router.get(
    "/stream/cupos",
    tags=["oferta"],
    summary="SSE con los cambios de cupo ({nrc, libres}); requiere ?ticket= (no el JWT)",
    response_class=StreamingResponse,
    responses={
        200: {"content": {"text/event-stream": {}}},
        401: {"model": ErrorOut},
        429: {"model": ErrorOut},
    },
)
async def stream_cupos(
    ctx: Ctx, sesion: Annotated[Sesion, Depends(sesion_de_ticket)]
) -> StreamingResponse:
    conexion = ctx.difusor.abrir(sesion.estudiante_id)
    if conexion is None:
        raise ApiError(
            429, "demasiadas_conexiones", "Máximo 3 conexiones de cupos en vivo por estudiante"
        )
    log.info("sse conectado estudiante=%s", sesion.estudiante_id)
    return StreamingResponse(
        ctx.difusor.eventos(hasta=sesion.exp, conexion=conexion),
        media_type="text/event-stream",
        background=BackgroundTask(conexion.cerrar),
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
