"""JWT HS256 del login simulado (Entra ID), tickets de stream y dependencias de autenticación."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Annotated, Any

import jwt
from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import COORDINADORES, ROL_COORDINADOR, ROL_ESTUDIANTE, Settings
from .errores import ApiError

ISSUER = "inscripcion-api"
AUD_SESION = "inscripcion-api"
AUD_STREAM = "stream"
_REQUERIDOS = ["exp", "sub", "iat", "iss", "aud"]

_bearer = HTTPBearer(auto_error=False, description="JWT obtenido en /auth/login")


@dataclass(frozen=True)
class Sesion:
    estudiante_id: str
    exp: int  # expiración del JWT de sesión (epoch s)


def crear_token(
    settings: Settings, estudiante_id: str, rol: str = ROL_ESTUDIANTE
) -> tuple[str, int]:
    ahora = int(time.time())
    ttl = settings.jwt_ttl_min * 60
    token = jwt.encode(
        {
            "sub": estudiante_id,
            "iat": ahora,
            "exp": ahora + ttl,
            "iss": ISSUER,
            "aud": AUD_SESION,
            "rol": rol,
        },
        settings.jwt_secret,
        "HS256",
    )
    return token, ttl


def crear_ticket(settings: Settings, sesion: Sesion) -> tuple[str, int]:
    """Ticket de un solo propósito (aud=stream), corto, que recuerda cuándo vence la sesión."""
    ahora = int(time.time())
    ttl = settings.ticket_ttl_s
    ticket = jwt.encode(
        {
            "sub": sesion.estudiante_id,
            "iat": ahora,
            "exp": ahora + ttl,
            "sexp": sesion.exp,
            "iss": ISSUER,
            "aud": AUD_STREAM,
        },
        settings.jwt_secret,
        "HS256",
    )
    return ticket, ttl


def decodificar(settings: Settings, token: str, audiencia: str) -> dict[str, Any]:
    try:
        datos: dict[str, Any] = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            audience=audiencia,
            issuer=ISSUER,
            options={"require": _REQUERIDOS},
        )
    except jwt.ExpiredSignatureError as exc:
        raise ApiError(401, "token_expirado", "La sesión expiró; inicia sesión de nuevo") from exc
    except jwt.InvalidTokenError as exc:
        raise ApiError(401, "token_invalido", "Token inválido") from exc
    if not isinstance(datos.get("sub"), str):
        raise ApiError(401, "token_invalido", "Token inválido")
    return datos


async def _verificar_existe(request: Request, estudiante_id: str) -> None:
    ctx = request.app.state.ctx
    if await ctx.catalogo.estudiante(ctx.db, estudiante_id) is None:
        raise ApiError(401, "no_autorizado", "El estudiante del token no existe")


async def sesion_actual(
    request: Request,
    cred: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> Sesion:
    if cred is None:
        raise ApiError(401, "no_autorizado", "Falta el encabezado Authorization: Bearer <token>")
    datos = decodificar(request.app.state.ctx.settings, cred.credentials, AUD_SESION)
    if datos.get("rol", ROL_ESTUDIANTE) != ROL_ESTUDIANTE:
        raise ApiError(403, "rol_no_permitido", "Este recurso es solo para estudiantes")
    await _verificar_existe(request, datos["sub"])
    return Sesion(datos["sub"], int(datos["exp"]))


async def coordinador_actual(
    request: Request,
    cred: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> str:
    """Solo rol coordinador (claim `rol` firmado por la API); el estudiante recibe 403."""
    if cred is None:
        raise ApiError(401, "no_autorizado", "Falta el encabezado Authorization: Bearer <token>")
    datos = decodificar(request.app.state.ctx.settings, cred.credentials, AUD_SESION)
    if datos.get("rol") != ROL_COORDINADOR or datos["sub"] not in COORDINADORES:
        raise ApiError(403, "rol_no_permitido", "Este recurso es solo para coordinación")
    return str(datos["sub"])


async def estudiante_actual(sesion: Annotated[Sesion, Depends(sesion_actual)]) -> str:
    return sesion.estudiante_id


async def sesion_de_ticket(request: Request, ticket: str | None = None) -> Sesion:
    """Solo para /stream/cupos: acepta únicamente un ticket (?ticket=), nunca el JWT normal."""
    if ticket is None:
        raise ApiError(401, "no_autorizado", "Falta el ticket (?ticket=); pídelo en /stream/ticket")
    datos = decodificar(request.app.state.ctx.settings, ticket, AUD_STREAM)
    await _verificar_existe(request, datos["sub"])
    return Sesion(datos["sub"], int(datos.get("sexp", datos["exp"])))
