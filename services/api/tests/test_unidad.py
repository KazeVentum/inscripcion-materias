"""Pruebas unitarias sin servicios: JWT, límite de login y productor Kafka."""

from __future__ import annotations

import time
from typing import Any

import jwt
import pytest

from app.config import Settings
from app.errores import ApiError
from app.eventos import Productor
from app.limites import LimiteIntentos
from app.seguridad import (
    AUD_SESION,
    AUD_STREAM,
    ISSUER,
    Sesion,
    crear_ticket,
    crear_token,
    decodificar,
)

SECRETO = "secreto-de-pruebas-con-al-menos-32-bytes-ok"


@pytest.fixture
def settings(monkeypatch: pytest.MonkeyPatch) -> Settings:
    monkeypatch.setenv("JWT_SECRET", SECRETO)
    monkeypatch.setenv("DEMO_PASSWORD", "clave")
    return Settings()


def firmar(claims: dict[str, Any], clave: str | None = SECRETO, alg: str = "HS256") -> str:
    return jwt.encode(claims, clave, alg)


def validos(**cambios: Any) -> dict[str, Any]:
    ahora = int(time.time())
    base = {"sub": "est-000001", "iat": ahora, "exp": ahora + 60, "iss": ISSUER, "aud": AUD_SESION}
    base.update(cambios)
    return {k: v for k, v in base.items() if v is not None}


def test_token_valido_se_decodifica(settings: Settings) -> None:
    token, _ = crear_token(settings, "est-000001")
    assert decodificar(settings, token, AUD_SESION)["sub"] == "est-000001"


@pytest.mark.parametrize(
    ("token", "codigo"),
    [
        (firmar(validos(exp=int(time.time()) - 10)), "token_expirado"),
        (firmar(validos(), clave="otro-secreto-distinto-de-32-bytes-o-mas!!"), "token_invalido"),
        (firmar(validos(), clave=None, alg="none"), "token_invalido"),
        (firmar(validos(exp=None)), "token_invalido"),
        (firmar(validos(sub=None)), "token_invalido"),
        (firmar(validos(iat=None)), "token_invalido"),
        (firmar(validos(aud="otro")), "token_invalido"),
        (firmar(validos(aud=AUD_STREAM)), "token_invalido"),
        (firmar(validos(iss="alguien")), "token_invalido"),
        ("basura", "token_invalido"),
    ],
)
def test_tokens_malos_son_401(settings: Settings, token: str, codigo: str) -> None:
    with pytest.raises(ApiError) as e:
        decodificar(settings, token, AUD_SESION)
    assert e.value.status == 401 and e.value.codigo == codigo


def test_ticket_solo_sirve_para_el_stream(settings: Settings) -> None:
    sesion = Sesion("est-000001", int(time.time()) + 3000)
    ticket, ttl = crear_ticket(settings, sesion)
    assert ttl == 60
    datos = decodificar(settings, ticket, AUD_STREAM)
    assert datos["sexp"] == sesion.exp and datos["exp"] - datos["iat"] == 60
    with pytest.raises(ApiError):  # un ticket no es un JWT de sesión
        decodificar(settings, ticket, AUD_SESION)
    normal, _ = crear_token(settings, "est-000001")
    with pytest.raises(ApiError):  # y el JWT de sesión no abre el stream
        decodificar(settings, normal, AUD_STREAM)


def test_settings_exige_secretos(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.setenv("DEMO_PASSWORD", "x")
    with pytest.raises(RuntimeError, match="JWT_SECRET"):
        Settings()
    monkeypatch.setenv("JWT_SECRET", "corto")
    with pytest.raises(RuntimeError, match="32"):
        Settings()
    monkeypatch.setenv("JWT_SECRET", SECRETO)
    monkeypatch.delenv("DEMO_PASSWORD")
    with pytest.raises(RuntimeError, match="DEMO_PASSWORD"):
        Settings()


def test_limite_de_intentos_por_ventana() -> None:
    t = [0.0]
    limite = LimiteIntentos(maximo=10, ventana_s=60, reloj=lambda: t[0])
    for _ in range(9):
        limite.registrar_fallo("u")
    assert limite.espera_s("u") == 0
    limite.registrar_fallo("u")
    assert limite.espera_s("u") > 0
    assert limite.espera_s("otro") == 0
    t[0] = 61
    assert limite.espera_s("u") == 0


async def test_productor_reintenta_con_backoff_sin_bloquear() -> None:
    p = Productor("127.0.0.1:1")  # nada escucha ahí
    inicio = time.monotonic()
    assert await p.asegurar() is False
    assert time.monotonic() - inicio < 1.5
    antes = p._proximo_intento
    assert antes > time.monotonic()
    assert await p.asegurar() is False  # dentro del backoff: ni siquiera lo intenta
    assert p._proximo_intento == antes
    assert await p.publicar_confirmado("t", "k", {"x": 1}) is False
