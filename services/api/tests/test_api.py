"""API con servicios reales (TestClient levanta el lifespan: Mongo, Redis y Redpanda de Docker).

Las pruebas que modifican datos restauran cupos, ocupado e inscripciones al terminar.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
import uuid
from collections.abc import Iterator
from typing import Any

import jwt
import pytest
import redis as redis_sync
from aiokafka import AIOKafkaConsumer
from fastapi.testclient import TestClient
from pymongo.database import Database

from app.dominio import hay_cruce
from app.main import crear_app

from .conftest import MONGO_URL, REDIS_URL, requiere_servicios

pytestmark = [pytest.mark.integration, requiere_servicios]

PASSWORD = os.environ.get("DEMO_PASSWORD", "uniminuto2027")
PERIODO = os.environ.get("PERIODO", "2027-1")
KAFKA = os.environ.get("KAFKA_BROKERS", "localhost:19092")
B_2030 = [
    {"dia": "MAR", "inicio": "20:30", "fin": "21:59"},
    {"dia": "JUE", "inicio": "20:30", "fin": "21:59"},
]


@pytest.fixture(scope="module")
def client() -> Iterator[TestClient]:
    os.environ.setdefault("MONGO_URL", MONGO_URL)
    os.environ.setdefault("REDIS_URL", REDIS_URL)
    with TestClient(crear_app()) as c:
        yield c


def limpiar_inscripcion(mongo: Database[Any], _id: str) -> None:
    """Borra el documento de la inscripción de prueba. Si hay un worker corriendo, puede tardar
    unos segundos en procesar el evento (y recrear un documento), así que se repite el borrado."""
    for _ in range(12):
        time.sleep(0.25)
        mongo["inscripciones"].delete_one({"_id": _id})


def login(client: TestClient, usuario: str) -> dict[str, str]:
    r = client.post("/api/v1/auth/login", json={"usuario": usuario, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['accessToken']}"}


# ------------------------------------------------------------------------ sistema


def test_health_y_docs(client: TestClient) -> None:
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json() == {"estado": "ok", "mongo": True, "redis": True, "kafka": True}
    assert client.get("/docs").status_code == 200
    assert client.get("/openapi.json").status_code == 200


# --------------------------------------------------------------------------- auth


def test_login_con_id_y_con_correo(client: TestClient) -> None:
    h = login(client, "est-000001")
    me = client.get("/api/v1/me", headers=h).json()
    assert me["estudianteId"] == "est-000001"
    assert "correo" not in me and "materiasAprobadas" not in me


def test_login_por_correo(client: TestClient, mongo: Database[Any]) -> None:
    doc: Any = mongo["estudiantes"].find_one({"estudianteId": "est-000001"})
    correo = doc["correo"]
    h = login(client, correo)
    assert client.get("/api/v1/me", headers=h).json()["estudianteId"] == "est-000001"


def test_login_invalido_y_rutas_protegidas(client: TestClient) -> None:
    r = client.post("/api/v1/auth/login", json={"usuario": "est-000001", "password": "mala"})
    assert r.status_code == 401 and r.json()["codigo"] == "credenciales_invalidas"
    r = client.post("/api/v1/auth/login", json={"usuario": "nadie", "password": PASSWORD})
    assert r.status_code == 401
    for ruta in ("/me", "/materias/habilitadas", "/horario", "/recomendaciones", "/stream/cupos"):
        r = client.get(f"/api/v1{ruta}")
        assert r.status_code == 401, ruta
        assert set(r.json()) >= {"codigo", "mensaje"}
    r = client.get("/api/v1/me", headers={"Authorization": "Bearer basura"})
    assert r.status_code == 401 and r.json()["codigo"] == "token_invalido"
    assert client.get("/api/v1/stream/cupos").status_code == 401


def _firmar(claims: dict[str, Any], clave: str | None = None, alg: str = "HS256") -> str:
    if alg == "none":
        return jwt.encode(claims, None, alg)
    return jwt.encode(claims, clave or os.environ["JWT_SECRET"], alg)


def _claims(**cambios: Any) -> dict[str, Any]:
    ahora = int(time.time())
    base: dict[str, Any] = {
        "sub": "est-000001",
        "iat": ahora,
        "exp": ahora + 60,
        "iss": "inscripcion-api",
        "aud": "inscripcion-api",
    }
    base.update(cambios)
    return {k: v for k, v in base.items() if v is not None}


@pytest.mark.parametrize(
    "token",
    [
        _firmar(_claims(exp=int(time.time()) - 5)),
        _firmar(_claims(), clave="otro-secreto-distinto-de-32-bytes-o-mas!!"),
        _firmar(_claims(), alg="none", clave="x"),
        _firmar(_claims(exp=None)),
        _firmar(_claims(aud="otra")),
        _firmar(_claims(sub="est-999999")),  # firma válida pero el estudiante no existe
    ],
)
def test_jwt_invalidos_son_401(client: TestClient, token: str) -> None:
    r = client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401, r.text
    assert set(r.json()) >= {"codigo", "mensaje"}


def test_ticket_de_stream(client: TestClient) -> None:
    h = login(client, "est-000001")
    jwt_normal = h["Authorization"].split()[1]
    # el JWT normal por query ya no sirve
    assert client.get(f"/api/v1/stream/cupos?ticket={jwt_normal}").status_code == 401
    assert client.get(f"/api/v1/stream/cupos?token={jwt_normal}").status_code == 401
    # ticket vencido
    vencido = _firmar(_claims(aud="stream", exp=int(time.time()) - 5, sexp=int(time.time()) + 99))
    assert client.get(f"/api/v1/stream/cupos?ticket={vencido}").status_code == 401
    # emitir un ticket exige sesión
    assert client.post("/api/v1/stream/ticket").status_code == 401
    r = client.post("/api/v1/stream/ticket", headers=h)
    assert r.status_code == 200 and r.json()["expiraEnS"] == 60
    ticket = r.json()["ticket"]
    claims = jwt.decode(ticket, options={"verify_signature": False})
    sesion = jwt.decode(jwt_normal, options={"verify_signature": False})
    assert claims["aud"] == "stream" and claims["sexp"] == sesion["exp"]
    assert claims["exp"] - claims["iat"] == 60
    # un ticket no abre el resto de la API
    assert (
        client.get("/api/v1/me", headers={"Authorization": f"Bearer {ticket}"}).status_code == 401
    )


def test_stream_maximo_3_conexiones_por_estudiante(client: TestClient) -> None:
    ctx = client.app.state.ctx  # type: ignore[attr-defined]
    ticket = client.post("/api/v1/stream/ticket", headers=login(client, "est-000003")).json()[
        "ticket"
    ]
    abiertas = [ctx.difusor.abrir("est-000003") for _ in range(3)]
    try:
        r = client.get(f"/api/v1/stream/cupos?ticket={ticket}")
        assert r.status_code == 429 and r.json()["codigo"] == "demasiadas_conexiones"
    finally:
        for c in abiertas:
            c.cerrar()


def test_login_limita_intentos_fallidos(client: TestClient) -> None:
    usuario = f"intruso-{uuid.uuid4().hex[:8]}"
    for _ in range(10):
        r = client.post("/api/v1/auth/login", json={"usuario": usuario, "password": "mala"})
        assert r.status_code == 401
    r = client.post("/api/v1/auth/login", json={"usuario": usuario, "password": "mala"})
    assert r.status_code == 429 and r.json()["codigo"] == "demasiados_intentos"
    assert "retry-after" in r.headers
    largo = client.post("/api/v1/auth/login", json={"usuario": "x" * 121, "password": "a"})
    assert largo.status_code == 422
    largo = client.post("/api/v1/auth/login", json={"usuario": "x", "password": "a" * 129})
    assert largo.status_code == 422


# ------------------------------------------------------------------- HU1: habilitadas


def test_habilitadas_est1_solo_sin_prerrequisitos(client: TestClient) -> None:
    h = login(client, "est-000001")
    r = client.get("/api/v1/materias/habilitadas", headers=h)
    assert r.status_code == 200
    materias = r.json()
    ids = {m["materiaId"] for m in materias}
    cat = client.app.state.ctx.catalogo  # type: ignore[attr-defined]
    # sin materias aprobadas: todas las habilitadas tienen la lista de prerrequisitos vacía
    assert all(cat.prerrequisitos[i] == [] for i in ids)
    # todo el primer semestre está habilitado; el segundo con prerrequisitos, no
    primer_semestre = {m for m, info in cat.materias.items() if info.semestre == 1}
    assert primer_semestre <= ids
    assert "ISUMBG023" not in ids and "FHUM1020" not in ids and "ISUMBG064" not in ids
    assert {m["estado"] for m in materias} <= {"pendiente", "inscrita"}
    assert all(m["nrcDisponibles"] >= 0 for m in materias)


def test_habilitadas_incluye_creditos_minimos(client: TestClient) -> None:
    ids4 = {
        m["materiaId"]
        for m in client.get(
            "/api/v1/materias/habilitadas", headers=login(client, "est-000004")
        ).json()
    }
    ids1 = {
        m["materiaId"]
        for m in client.get(
            "/api/v1/materias/habilitadas", headers=login(client, "est-000001")
        ).json()
    }
    assert "ISUMBG064" in ids4 and "ISUMBG074" in ids4  # 120 créditos >= 114
    assert "ISUMBG064" not in ids1


def test_nrc_de_materia_no_habilitada_es_403(client: TestClient) -> None:
    r = client.get("/api/v1/materias/ISUMBG064/nrc", headers=login(client, "est-000001"))
    assert r.status_code == 403 and r.json()["codigo"] == "prerrequisito"
    r = client.get("/api/v1/materias/NOEXISTE/nrc", headers=login(client, "est-000001"))
    assert r.status_code == 404


# ----------------------------------------------------------------------- HU2 / HU3


def test_nrc_tienen_cupos_horario_y_cupo_positivo(client: TestClient) -> None:
    h = login(client, "est-000004")
    r = client.get("/api/v1/materias/ISUMBG064/nrc", headers=h)
    assert r.status_code == 200
    nrcs = r.json()
    assert nrcs
    for n in nrcs:
        assert n["cuposLibres"] > 0 and n["cupoTotal"] >= n["cuposLibres"]
        assert {"docente", "sede", "modalidad", "franja", "bloques"} <= set(n)


def test_hu3_est2_no_ve_nrc_que_crucen_martes_jueves_2030(client: TestClient) -> None:
    h = login(client, "est-000002")
    habilitadas = client.get("/api/v1/materias/habilitadas", headers=h).json()
    cat = client.app.state.ctx.catalogo  # type: ignore[attr-defined]
    vistos = 0
    cruzarian = 0
    for m in habilitadas:
        if m["estado"] != "pendiente":
            continue
        # NRC del catálogo de esa materia que sí cruzan con la clase MAR/JUE 20:30
        cruzarian += sum(
            1
            for nrc in cat.nrc_por_materia.get(m["materiaId"], [])
            if hay_cruce(cat.nrc_info[nrc].bloques, B_2030)
        )
        for n in client.get(f"/api/v1/materias/{m['materiaId']}/nrc", headers=h).json():
            vistos += 1
            assert not hay_cruce(n["bloques"], B_2030), n
    assert vistos > 0
    assert cruzarian > 0, "la prueba sería vacua: ningún NRC candidato cruza con MAR/JUE 20:30"


# ------------------------------------------------------------------------ HU4 flujo


def _libres(client: TestClient, h: dict[str, str], materia: str, nrc: str) -> int | None:
    for n in client.get(f"/api/v1/materias/{materia}/nrc", headers=h).json():
        if n["nrc"] == nrc:
            return int(n["cuposLibres"])
    return None


def test_flujo_inscribir_estado_horario_cancelar(client: TestClient, mongo: Database[Any]) -> None:
    h = login(client, "est-000004")
    nrcs = client.get("/api/v1/materias/ISUMBG064/nrc", headers=h).json()
    elegido = nrcs[0]
    nrc, antes = elegido["nrc"], elegido["cuposLibres"]
    _id = f"{PERIODO}|est-000004|{nrc}"
    try:
        r = client.post("/api/v1/inscripciones", json={"nrc": nrc}, headers=h)
        assert r.status_code == 202, r.text
        assert r.json()["estado"] == "reservada" and r.json()["cuposLibres"] == antes - 1
        assert r.json()["vencimiento"].endswith("Z")

        # segunda vez: la materia ya está ocupada
        r2 = client.post("/api/v1/inscripciones", json={"nrc": nrc}, headers=h)
        assert r2.status_code == 409 and r2.json()["codigo"] == "ya_inscrita"

        estado = client.get(f"/api/v1/inscripciones/{nrc}", headers=h).json()["estado"]
        assert estado in ("reservada", "confirmada")  # el worker puede estar corriendo

        horario = client.get("/api/v1/horario", headers=h).json()
        item = next(i for i in horario["inscripciones"] if i["nrc"] == nrc)
        assert item["estado"] in ("reservada", "confirmada")
        assert horario["creditosTotales"] == sum(i["creditos"] for i in horario["inscripciones"])

        d = client.delete(f"/api/v1/inscripciones/{nrc}", headers=h)
        assert d.status_code == 200 and d.json()["estado"] == "cancelada"
        assert _libres(client, h, "ISUMBG064", nrc) == antes
        assert client.get(f"/api/v1/inscripciones/{nrc}", headers=h).json()["estado"] == "cancelada"
        assert client.delete(f"/api/v1/inscripciones/{nrc}", headers=h).status_code == 404
    finally:
        limpiar_inscripcion(mongo, _id)


def test_sin_cupo_devuelve_alternativa_y_no_escribe(
    client: TestClient, mongo: Database[Any]
) -> None:
    h = login(client, "est-000004")
    nrcs = [n["nrc"] for n in client.get("/api/v1/materias/ISUMBG064/nrc", headers=h).json()]
    assert len(nrcs) >= 2
    objetivo = nrcs[0]
    clave = f"cupos:{PERIODO}:{objetivo}"

    r: Any = redis_sync.Redis.from_url(REDIS_URL, decode_responses=True)
    original = r.get(clave)
    r.set(clave, 0)
    try:
        resp = client.post("/api/v1/inscripciones", json={"nrc": objetivo}, headers=h)
        assert resp.status_code == 409, resp.text
        cuerpo = resp.json()
        assert cuerpo["codigo"] == "sin_cupo"
        alt = cuerpo["alternativa"]
        assert alt["nrc"] != objetivo and alt["materiaId"] == "ISUMBG064" and alt["cuposLibres"] > 0
        assert r.hexists("ocupado:est-000004", objetivo) == 0
        assert r.get(clave) == "0"
    finally:
        if original is not None:
            r.set(clave, original)
        r.close()


def test_cruce_devuelve_409_con_el_nrc_en_conflicto(client: TestClient) -> None:
    h = login(client, "est-000002")
    cat = client.app.state.ctx.catalogo  # type: ignore[attr-defined]
    habilitadas = client.get("/api/v1/materias/habilitadas", headers=h).json()
    candidatos = [
        nrc
        for m in habilitadas
        if m["estado"] == "pendiente"
        for nrc in cat.nrc_por_materia.get(m["materiaId"], [])
        if hay_cruce(cat.nrc_info[nrc].bloques, B_2030)
    ]
    assert candidatos
    r: Any = redis_sync.Redis.from_url(REDIS_URL, decode_responses=True)
    elegido = next(n for n in candidatos if int(r.get(f"cupos:{PERIODO}:{n}") or 0) > 0)
    antes = r.get(f"cupos:{PERIODO}:{elegido}")
    try:
        resp = client.post("/api/v1/inscripciones", json={"nrc": elegido}, headers=h)
        assert resp.status_code == 409 and resp.json()["codigo"] == "cruce"
        assert resp.json()["conflicto"]["nrc"]
        assert r.get(f"cupos:{PERIODO}:{elegido}") == antes
    finally:
        r.close()


def test_prerrequisito_en_inscripcion_es_403(client: TestClient) -> None:
    h = login(client, "est-000001")
    cat = client.app.state.ctx.catalogo  # type: ignore[attr-defined]
    nrc = cat.nrc_por_materia["ISUMBG064"][0]
    r = client.post("/api/v1/inscripciones", json={"nrc": nrc}, headers=h)
    assert r.status_code == 403 and r.json()["codigo"] == "prerrequisito"
    assert client.post("/api/v1/inscripciones", json={"nrc": "000"}, headers=h).status_code == 404
    assert client.post("/api/v1/inscripciones", json={}, headers=h).status_code == 422


def test_recomendaciones_sin_cruces_y_hasta_18_creditos(client: TestClient) -> None:
    h = login(client, "est-000001")
    r = client.get("/api/v1/recomendaciones", headers=h)
    assert r.status_code == 200
    rec = r.json()
    assert 0 < rec["creditosTotales"] <= 18
    assert rec["creditosTotales"] == sum(n["creditos"] for n in rec["nrc"])
    bloques = [b for n in rec["nrc"] for b in n["bloques"]]
    for i, a in enumerate(bloques):
        assert not hay_cruce([a], bloques[i + 1 :])


# ------------------------------------------------------------------- eventos Kafka


async def test_intentos_y_busquedas_se_publican_en_kafka(
    client: TestClient, mongo: Database[Any]
) -> None:
    if not client.get("/api/v1/health").json()["kafka"]:
        pytest.skip("Redpanda no disponible")
    h = await asyncio.to_thread(login, client, "est-000004")
    consumidor = AIOKafkaConsumer(
        "inscripcion.intentos",
        "oferta.busquedas",
        bootstrap_servers=KAFKA,
        group_id=None,
        auto_offset_reset="latest",
        enable_auto_commit=False,
    )
    await consumidor.start()
    nrc = ""
    try:
        await consumidor.getmany(timeout_ms=1500)  # asegura asignación y posiciones al final
        busq = await asyncio.to_thread(client.get, "/api/v1/materias/ISUMBG064/nrc", headers=h)
        nrc = busq.json()[0]["nrc"]
        resp = await asyncio.to_thread(
            client.post, "/api/v1/inscripciones", json={"nrc": nrc}, headers=h
        )
        assert resp.status_code == 202
        await asyncio.to_thread(client.delete, f"/api/v1/inscripciones/{nrc}", headers=h)

        eventos: list[dict[str, Any]] = []
        limite = time.monotonic() + 15
        while time.monotonic() < limite and len(eventos) < 3:
            lote = await consumidor.getmany(timeout_ms=1000)
            for msgs in lote.values():
                for m in msgs:
                    e = json.loads(m.value)
                    if e["estudianteId"] == "est-000004":
                        assert m.key.decode() == "est-000004"
                        eventos.append(e)
        tipos = {(e["tipo"], e["resultado"]) for e in eventos}
        assert ("busqueda", "exito") in tipos
        assert ("intento", "exito") in tipos
        assert ("cancelacion", "exito") in tipos
        intento = next(e for e in eventos if e["tipo"] == "intento")
        assert uuid.UUID(intento["eventId"])
        assert intento["nrc"] == nrc and intento["periodo"] == PERIODO
        assert isinstance(intento["latenciaMs"], int)
    finally:
        await consumidor.stop()
        await asyncio.to_thread(limpiar_inscripcion, mongo, f"{PERIODO}|est-000004|{nrc}")


def test_si_kafka_no_entrega_la_reserva_se_deshace_y_responde_503(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    h = login(client, "est-000004")
    ctx = client.app.state.ctx  # type: ignore[attr-defined]
    nrcs = client.get("/api/v1/materias/ISUMBG064/nrc", headers=h).json()
    nrc, antes = nrcs[0]["nrc"], nrcs[0]["cuposLibres"]

    async def sin_entrega(*_: Any, **__: Any) -> bool:
        return False

    monkeypatch.setattr(ctx.productor, "publicar_confirmado", sin_entrega)
    r = client.post("/api/v1/inscripciones", json={"nrc": nrc}, headers=h)
    assert r.status_code == 503 and r.json()["codigo"] == "servicio_no_disponible"
    monkeypatch.undo()

    assert _libres(client, h, "ISUMBG064", nrc) == antes
    rr: Any = redis_sync.Redis.from_url(REDIS_URL, decode_responses=True)
    try:
        assert not rr.hexists("ocupado:est-000004", nrc)
        assert rr.zscore("reservas:pendientes", f"est-000004|{nrc}") is None
    finally:
        rr.close()


# ------------------------------------------------------------------------ jornada


def test_perfil_incluye_jornada(client: TestClient) -> None:
    assert (
        client.get("/api/v1/me", headers=login(client, "est-000001")).json()["jornada"] == "noche"
    )
    assert (
        client.get("/api/v1/me", headers=login(client, "est-000006")).json()["jornada"] == "tarde"
    )


def test_nrc_visibles_respetan_la_jornada(client: TestClient) -> None:
    from app.dominio import en_jornada

    for est, jornada in (("est-000001", "noche"), ("est-000006", "tarde")):
        h = login(client, est)
        visibles = 0
        for m in client.get("/api/v1/materias/habilitadas", headers=h).json():
            for n in client.get(f"/api/v1/materias/{m['materiaId']}/nrc", headers=h).json():
                assert en_jornada(n["bloques"], jornada), (est, n["nrc"])
                visibles += 1
        assert visibles > 0


def test_est6_tiene_varias_opciones_de_tarde_por_materia_habilitada(client: TestClient) -> None:
    h = login(client, "est-000006")
    pendientes = [
        m
        for m in client.get("/api/v1/materias/habilitadas", headers=h).json()
        if m["estado"] == "pendiente" and m["semestre"] <= 3
    ]
    assert pendientes and all(m["nrcDisponibles"] >= 1 for m in pendientes)


def test_inscribir_fuera_de_jornada_es_409_y_no_toca_cupos(client: TestClient) -> None:
    cat = client.app.state.ctx.catalogo  # type: ignore[attr-defined]
    h = login(client, "est-000006")
    habilitadas = client.get("/api/v1/materias/habilitadas", headers=h).json()
    from app.dominio import en_jornada

    nrc = next(
        n
        for m in habilitadas
        for n in cat.nrc_por_materia[m["materiaId"]]
        if not en_jornada(cat.nrc_info[n].bloques, "tarde")
    )
    r = client.post("/api/v1/inscripciones", json={"nrc": nrc}, headers=h)
    assert r.status_code == 409 and r.json()["codigo"] == "fuera_de_jornada"
    red = redis_sync.Redis.from_url(REDIS_URL, decode_responses=True)
    assert red.hexists("ocupado:est-000006", nrc) is False


def test_avance_solo_del_semestre_actual(client: TestClient) -> None:
    h = login(client, "est-000005")  # semestre 7 con rezago
    a = client.get("/api/v1/avance", headers=h).json()
    assert a["semestreActual"] == 7
    assert all(m["semestre"] == 7 for m in a["materias"])
    assert a["totalPendientes"] == len(a["materias"])
    assert a["faltan"] == a["totalPendientes"] - a["inscritas"]
    assert all(m["semestre"] < 7 for m in a["atrasadas"]) and a["atrasadas"]
    assert a["mensaje"]
    assert a["habilitadasSinInscribir"] == sum(m["estado"] == "habilitada" for m in a["materias"])
