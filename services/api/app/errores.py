"""Errores de la API con el formato ``{codigo, mensaje, alternativa?}`` (CLAUDE.md)."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class ApiError(Exception):
    def __init__(
        self,
        status: int,
        codigo: str,
        mensaje: str,
        alternativa: dict[str, Any] | None = None,
        extra: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(mensaje)
        self.status = status
        self.codigo = codigo
        self.mensaje = mensaje
        self.alternativa = alternativa
        self.extra = extra or {}
        self.headers = headers

    def cuerpo(self) -> dict[str, Any]:
        cuerpo: dict[str, Any] = {"codigo": self.codigo, "mensaje": self.mensaje}
        if self.alternativa is not None:
            cuerpo["alternativa"] = self.alternativa
        cuerpo.update(self.extra)
        return cuerpo


_CODIGOS_HTTP = {
    401: "no_autorizado",
    403: "prohibido",
    404: "no_encontrado",
    405: "metodo_no_permitido",
}


def registrar_manejadores(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(exc.cuerpo(), status_code=exc.status, headers=exc.headers)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        codigo = _CODIGOS_HTTP.get(exc.status_code, "error")
        return JSONResponse(
            {"codigo": codigo, "mensaje": str(exc.detail)},
            status_code=exc.status_code,
            headers=exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def _validacion(_: Request, exc: RequestValidationError) -> JSONResponse:
        campos = ", ".join(".".join(str(p) for p in e["loc"][1:]) or "cuerpo" for e in exc.errors())
        return JSONResponse(
            {"codigo": "solicitud_invalida", "mensaje": f"Datos inválidos: {campos}"},
            status_code=422,
        )
