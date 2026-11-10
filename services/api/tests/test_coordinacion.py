"""Rol coordinador y endpoints de analitica (HU5). Usa el stack de Docker (login, Mongo)."""

from __future__ import annotations

import os
from collections.abc import Iterator
from typing import Any

import jwt
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.analitica import LectorOro
from app.config import Settings
from app.main import crear_app

from .conftest import MONGO_URL, REDIS_URL, requiere_servicios

pytestmark = [pytest.mark.integration, requiere_servicios]

PASSWORD = os.environ.get("DEMO_PASSWORD", "uniminuto2027")
BASE = "/api/v1/coordinacion"
ENDPOINTS = [
    "/me",
    "/analitica/resumen",
    "/analitica/demanda-nrc",
    "/analitica/ocupacion-franja",
    "/analitica/combinaciones",
    "/analitica/auditoria",
    "/analitica/demanda-insatisfecha",
]


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    os.environ.setdefault("MONGO_URL", MONGO_URL)
    os.environ.setdefault("REDIS_URL", REDIS_URL)
    with TestClient(crear_app()) as c:
        yield c


def _app(client: TestClient) -> FastAPI:
    app: FastAPI = client.app  # type: ignore[assignment]
    return app


def login(client: TestClient, usuario: str) -> tuple[dict[str, str], dict[str, Any]]:
    r = client.post("/api/v1/auth/login", json={"usuario": usuario, "password": PASSWORD})
    assert r.status_code == 200, r.text
    token = r.json()["accessToken"]
    claims = jwt.decode(token, options={"verify_signature": False})
    return {"Authorization": f"Bearer {token}"}, {**claims, "_resp": r.json()}


class LectorFalso:
    """Gold en memoria: fija el contrato sin depender de lo que haya en MinIO."""

    def __init__(self, tablas: dict[str, list[dict[str, Any]]], meta: dict[str, Any] | None):
        self._t, self._m = tablas, meta

    async def tabla(self, nombre: str) -> list[dict[str, Any]]:
        return [dict(f) for f in self._t.get(nombre, [])]

    async def meta(self) -> dict[str, Any] | None:
        return self._m


def _nrc(
    nrc: str, intentos: int, sin_cupo: int, ocupacion: float | None, **kw: Any
) -> dict[str, Any]:
    base: dict[str, Any] = {
        "nrc": nrc,
        "materiaId": "M1",
        "materia": "Materia",
        "semestreMateria": 1,
        "area": "A",
        "sede": "Calle 80",
        "modalidad": "presencial",
        "franja": "noche",
        "cupoTotal": 10,
        "intentos": intentos,
        "exitos": intentos - sin_cupo,
        "sinCupo": sin_cupo,
        "otros": 0,
        "estudiantes": intentos,
        "tasaExito": 0.5,
        "ocupados": 5,
        "ocupacion": ocupacion,
        "cuposVacios": 5,
        "primerIntento": None,
        "llenoEn": None,
        "tiempoHastaLlenarseS": None,
    }
    base.update(kw)
    return base


META = {
    "generadoEn": "2027-01-01T00:00:00Z",
    "resumen": {
        "periodo": "2027-1",
        "eventos": 10,
        "intentos": 6,
        "exitos": 4,
        "sinCupo": 2,
        "tasaExito": 0.6667,
        "estudiantesUnicos": 3,
        "nrcTotales": 3,
        "nrcLlenos": 1,
        "ocupacionGlobal": 0.5,
        "latenciaIntentoP50Ms": 3.0,
        "latenciaIntentoP95Ms": 9.0,
    },
    "validacion": {
        "cuadra": True,
        "bronce": {"lineas": 12},
        "plata": {"eventos": 10, "duplicados": 1, "invalidos": 1},
        "checks": [{"nombre": "x", "ok": True, "esperado": 1, "obtenido": 1}],
    },
}


# ------------------------------------------------------------------------- login


def test_login_coordinador_lleva_el_rol(client: TestClient) -> None:
    _, claims = login(client, "coord-0001")
    assert claims["rol"] == "coordinador" and claims["sub"] == "coord-0001"
    assert claims["_resp"]["rol"] == "coordinador"


def test_login_estudiante_lleva_rol_estudiante(client: TestClient) -> None:
    _, claims = login(client, "est-000001")
    assert claims["rol"] == "estudiante"
    assert claims["_resp"]["rol"] == "estudiante"


def test_coordinador_con_clave_incorrecta_es_401(client: TestClient) -> None:
    r = client.post("/api/v1/auth/login", json={"usuario": "coord-0001", "password": "mala"})
    assert r.status_code == 401 and r.json()["codigo"] == "credenciales_invalidas"


# --------------------------------------------------------------------------- roles


@pytest.mark.parametrize("ruta", ENDPOINTS)
def test_estudiante_recibe_403_en_coordinacion(client: TestClient, ruta: str) -> None:
    h, _ = login(client, "est-000001")
    r = client.get(BASE + ruta, headers=h)
    assert r.status_code == 403, r.text
    assert r.json()["codigo"] == "rol_no_permitido"


@pytest.mark.parametrize("ruta", ENDPOINTS)
def test_coordinacion_sin_token_es_401(client: TestClient, ruta: str) -> None:
    assert client.get(BASE + ruta).status_code == 401


@pytest.mark.parametrize(
    ("metodo", "ruta"),
    [
        ("GET", "/api/v1/me"),
        ("GET", "/api/v1/avance"),
        ("GET", "/api/v1/materias/habilitadas"),
        ("GET", "/api/v1/horario"),
        ("GET", "/api/v1/recomendaciones"),
        ("POST", "/api/v1/stream/ticket"),
        ("GET", "/api/v1/inscripciones/80852"),
    ],
)
def test_coordinador_es_rechazado_limpiamente_en_rutas_de_estudiante(
    client: TestClient, metodo: str, ruta: str
) -> None:
    h, _ = login(client, "coord-0001")
    r = client.request(metodo, ruta, headers=h)
    assert r.status_code == 403, r.text
    assert r.json()["codigo"] == "rol_no_permitido"


def test_coordinador_no_puede_inscribir(client: TestClient) -> None:
    h, _ = login(client, "coord-0001")
    r = client.post("/api/v1/inscripciones", json={"nrc": "80852"}, headers=h)
    assert r.status_code == 403 and r.json()["codigo"] == "rol_no_permitido"


def test_perfil_del_coordinador(client: TestClient) -> None:
    h, _ = login(client, "coord-0001")
    r = client.get(BASE + "/me", headers=h)
    assert r.status_code == 200
    assert r.json()["usuarioId"] == "coord-0001" and r.json()["rol"] == "coordinador"


# ---------------------------------------------------------------------- contrato


def test_endpoints_responden_aunque_gold_no_exista(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    inalcanzable = LectorOro(Settings(minio_endpoint="127.0.0.1:1"))
    monkeypatch.setattr(_app(client).state, "lector_oro", inalcanzable)
    h, _ = login(client, "coord-0001")
    for ruta in ENDPOINTS[1:]:
        r = client.get(BASE + ruta, headers=h)
        assert r.status_code == 200, (ruta, r.text)
        assert r.json()["generadoEn"] is None
    assert client.get(BASE + "/analitica/demanda-nrc", headers=h).json()["items"] == []
    assert client.get(BASE + "/analitica/resumen", headers=h).json()["validacion"] is None


def test_contrato_de_los_endpoints(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    tablas: dict[str, list[dict[str, Any]]] = {
        "demanda_nrc": [
            _nrc("1", 10, 1, 0.4),
            _nrc(
                "2",
                30,
                9,
                1.0,
                cuposVacios=0,
                llenoEn="2027-01-01T00:01:00Z",
                tiempoHastaLlenarseS=60.0,
            ),
            _nrc("3", 0, 0, None, cupoTotal=None, ocupados=0, cuposVacios=None),
        ],
        "ocupacion_franja": [
            {
                "franja": "noche",
                "sede": "Calle 80",
                "nrcs": 3,
                "cupoTotal": 30,
                "ocupados": 15,
                "cuposVacios": 15,
                "ocupacion": 0.5,
                "nrcLlenos": 1,
                "intentos": 40,
                "exitos": 30,
                "sinCupo": 10,
            }
        ],
        "combinaciones_nrc": [
            {
                "programa": "ISIS",
                "semestre": s,
                "nrcA": "1",
                "nrcB": "2",
                "materiaA": "M1",
                "materiaB": "M2",
                "tituloA": "A",
                "tituloB": "B",
                "estudiantes": n,
                "soporte": 0.1,
            }
            for s, n in ((1, 2), (2, 5))
        ],
        "auditoria_intentos": [
            {
                "fecha": None,
                "tipo": "intento",
                "resultado": "exito",
                "n": 4,
                "latenciaP50Ms": 3.0,
                "latenciaP95Ms": 9.0,
                "latenciaMaxMs": 11,
            },
            {
                "fecha": "2027-01-01",
                "tipo": "intento",
                "resultado": "exito",
                "n": 4,
                "latenciaP50Ms": 3.0,
                "latenciaP95Ms": 9.0,
                "latenciaMaxMs": 11,
            },
        ],
        "demanda_insatisfecha": [
            {
                "materiaId": "M1",
                "materia": "X",
                "semestreMateria": 1,
                "area": "A",
                "sinCupo": 3,
                "estudiantesAfectados": 2,
                "nrcAfectados": 1,
                "intentos": 9,
                "tasaSinCupo": 0.33,
            },
            {
                "materiaId": "M2",
                "materia": "Y",
                "semestreMateria": 2,
                "area": "A",
                "sinCupo": 7,
                "estudiantesAfectados": 5,
                "nrcAfectados": 2,
                "intentos": 9,
                "tasaSinCupo": 0.77,
            },
        ],
    }
    monkeypatch.setattr(_app(client).state, "lector_oro", LectorFalso(tablas, META))
    h, _ = login(client, "coord-0001")

    r = client.get(BASE + "/analitica/resumen", headers=h).json()
    assert r["generadoEn"] == "2027-01-01T00:00:00Z" and r["intentos"] == 6
    assert r["validacion"] == {
        "cuadra": True,
        "lineasBronce": 12,
        "eventosPlata": 10,
        "duplicados": 1,
        "invalidos": 1,
        "checks": [{"nombre": "x", "ok": True, "esperado": 1, "obtenido": 1}],
    }

    d = client.get(BASE + "/analitica/demanda-nrc", headers=h).json()
    assert d["total"] == 3 and [i["nrc"] for i in d["items"]] == ["2", "1", "3"]
    d = client.get(BASE + "/analitica/demanda-nrc?orden=ocupacion&limite=1", headers=h).json()
    assert d["total"] == 3 and [i["nrc"] for i in d["items"]] == ["2"]
    d = client.get(BASE + "/analitica/demanda-nrc?soloConIntentos=true", headers=h).json()
    assert [i["nrc"] for i in d["items"]] == ["2", "1"]
    d = client.get(BASE + "/analitica/demanda-nrc?orden=tiempo_llenado", headers=h).json()
    assert d["items"][0]["nrc"] == "2"  # el unico que se lleno va primero; los nulos al final
    assert client.get(BASE + "/analitica/demanda-nrc?orden=zzz", headers=h).status_code == 422
    assert client.get(BASE + "/analitica/demanda-nrc?limite=0", headers=h).status_code == 422

    f = client.get(BASE + "/analitica/ocupacion-franja", headers=h).json()
    assert f["items"][0]["franja"] == "noche" and f["items"][0]["ocupacion"] == 0.5

    c = client.get(BASE + "/analitica/combinaciones", headers=h).json()
    assert c["total"] == 2 and c["items"][0]["semestre"] == 2  # mas estudiantes primero
    c = client.get(BASE + "/analitica/combinaciones?semestre=1", headers=h).json()
    assert c["total"] == 1 and c["items"][0]["estudiantes"] == 2

    a = client.get(BASE + "/analitica/auditoria", headers=h).json()
    assert a["total"][0]["fecha"] is None and a["porDia"][0]["fecha"] == "2027-01-01"

    i = client.get(BASE + "/analitica/demanda-insatisfecha", headers=h).json()
    assert [x["materiaId"] for x in i["items"]] == ["M2", "M1"]
    assert set(i["items"][0]) == {
        "materiaId",
        "materia",
        "semestreMateria",
        "area",
        "sinCupo",
        "estudiantesAfectados",
        "nrcAfectados",
        "intentos",
        "tasaSinCupo",
    }


def test_oro_real_si_existe(client: TestClient) -> None:
    """Con gold calculado (make lake), el resumen declara que los conteos cuadran."""
    h, _ = login(client, "coord-0001")
    r = client.get(BASE + "/analitica/resumen", headers=h)
    assert r.status_code == 200
    if r.json()["generadoEn"] is None:
        pytest.skip("gold aun no existe (make simular && make lake)")
    assert r.json()["validacion"]["cuadra"] is True
