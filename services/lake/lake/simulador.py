"""Simulador de trafico real contra la API (make simular): genera eventos para el lake.

Inicia sesion con estudiantes sinteticos (nunca los demos est-000001..6), busca oferta,
inscribe (incluidos intentos al ultimo cupo, con concurrencia), cancela y provoca algunos
fuera_de_jornada y prerrequisito. Determinista en lo que decide (estudiantes, materias,
NRC, probabilidades) a partir de la semilla; el desenlace de las carreras por el ultimo
cupo depende del orden real de llegada, igual que en produccion.

Las lecturas de catalogo y cupos vienen de Mongo y Redis (solo lectura); toda accion que
escribe pasa por la API.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import random
import sys
import time
from collections import Counter
from dataclasses import dataclass
from typing import Any

import httpx
import redis as redis_sync
from pymongo import MongoClient

DEMOS = {f"est-{i:06d}" for i in range(1, 7)}
VENTANAS = {"noche": (18 * 60, 22 * 60), "tarde": (12 * 60, 18 * 60)}


def _min(hm: str) -> int:
    h, m = hm.split(":")
    return int(h) * 60 + int(m)


def en_jornada(bloques: list[dict[str, Any]], jornada: str) -> bool:
    desde, hasta = VENTANAS.get(jornada, VENTANAS["noche"])
    return all(_min(b["inicio"]) >= desde and _min(b["fin"]) <= hasta for b in bloques)


@dataclass
class Catalogo:
    estudiantes: list[dict[str, Any]]
    nrc: dict[str, dict[str, Any]]
    libres: dict[str, int]
    calientes: set[str]
    materias_calientes: set[str]


def cargar_catalogo(
    mongo_url: str, redis_url: str, periodo: str, rnd: random.Random, n_calientes: int
) -> Catalogo:
    mongo: MongoClient[dict[str, Any]] = MongoClient(mongo_url, serverSelectionTimeoutMS=5000)
    r = redis_sync.Redis.from_url(redis_url, decode_responses=True)
    try:
        db = mongo.get_default_database()
        ests = sorted(
            (
                e
                for e in db["estudiantes"].find(
                    {}, {"estudianteId": 1, "semestre": 1, "jornada": 1, "demo": 1}
                )
                if e["estudianteId"] not in DEMOS and not e.get("demo")
            ),
            key=lambda e: e["estudianteId"],
        )
        nrc = {str(d["nrc"]): d for d in db["nrc"].find({"periodo": periodo, "estado": "activo"})}
        ids = sorted(nrc)
        valores: list[Any] = r.mget(  # type: ignore[assignment]
            [f"cupos:{periodo}:{i}" for i in ids]
        )
        libres = {i: int(v) for i, v in zip(ids, valores, strict=True) if v is not None}
    finally:
        mongo.close()
        r.close()
    # NRC "calientes": presenciales/sincronicos con 1 a 4 cupos libres, para forzar la
    # disputa por el ultimo cupo. Se escogen de forma determinista con la semilla.
    candidatos = sorted(i for i, d in nrc.items() if d["bloques"] and 1 <= libres.get(i, 0) <= 4)
    calientes = set(rnd.sample(candidatos, min(n_calientes, len(candidatos))))
    return Catalogo(ests, nrc, libres, calientes, {nrc[i]["materiaId"] for i in calientes})


class Cliente:
    def __init__(self, http: httpx.AsyncClient, est: dict[str, Any], password: str) -> None:
        self.http = http
        self.est = est
        self.id: str = est["estudianteId"]
        self.password = password
        self.cabecera: dict[str, str] = {}
        self.vistos: set[str] = set()  # NRC que aparecieron en sus busquedas
        self.materias: set[str] = set()  # materias que logro inscribir

    async def login(self) -> bool:
        for _ in range(3):
            r = await self.http.post(
                "/api/v1/auth/login", json={"usuario": self.id, "password": self.password}
            )
            if r.status_code == 429:  # limite de login: se respeta el Retry-After
                await asyncio.sleep(float(r.headers.get("Retry-After", "5")))
                continue
            if r.status_code != 200:
                return False
            self.cabecera = {"Authorization": f"Bearer {r.json()['accessToken']}"}
            return True
        return False

    async def get(self, ruta: str) -> httpx.Response:
        return await self.http.get(f"/api/v1{ruta}", headers=self.cabecera)

    async def inscribir(self, nrc: str) -> httpx.Response:
        return await self.http.post(
            "/api/v1/inscripciones", json={"nrc": nrc}, headers=self.cabecera
        )

    async def cancelar(self, nrc: str) -> httpx.Response:
        return await self.http.delete(f"/api/v1/inscripciones/{nrc}", headers=self.cabecera)


def _resultado(r: httpx.Response) -> str:
    if r.status_code == 202:
        return "exito"
    try:
        return str(r.json().get("codigo", f"http_{r.status_code}"))
    except ValueError:
        return f"http_{r.status_code}"


async def estudiante(
    cat: Catalogo, c: Cliente, rnd: random.Random, cuenta: Counter[str], pausa_s: float
) -> None:
    if not await c.login():
        cuenta["login_fallido"] += 1
        return
    cuenta["sesiones"] += 1
    habilitadas = (await c.get("/materias/habilitadas")).json()
    pendientes = [m for m in habilitadas if m["estado"] == "pendiente" and m["nrcDisponibles"] > 0]
    ids_habilitadas = {m["materiaId"] for m in habilitadas}
    calientes = [m for m in pendientes if m["materiaId"] in cat.materias_calientes]
    otras = [m for m in pendientes if m["materiaId"] not in cat.materias_calientes]
    rnd.shuffle(calientes)
    rnd.shuffle(otras)
    elegidas = calientes[: rnd.randint(1, 2)] + otras[: rnd.randint(1, 3)]
    inscritos: list[str] = []
    # mira materias que no inscribe: su pantalla queda con NRC "disponibles" que luego se llenan
    restantes = [m for m in calientes + otras if m not in elegidas]
    for m in restantes[:3]:
        r = await c.get(f"/materias/{m['materiaId']}/nrc")
        cuenta["busquedas"] += 1
        if r.status_code == 200:
            c.vistos.update(o["nrc"] for o in r.json())
    for m in elegidas:
        r = await c.get(f"/materias/{m['materiaId']}/nrc")
        cuenta["busquedas"] += 1
        if r.status_code != 200 or not r.json():
            continue
        opciones = r.json()
        c.vistos.update(o["nrc"] for o in opciones)
        hot = [o for o in opciones if o["nrc"] in cat.calientes]
        # desconocer un NRC lleno es lo normal: un estudiante a veces insiste en el suyo
        # los estudiantes se concentran en unos pocos NRC "populares" (peso 1/rango)
        populares = sorted(opciones, key=lambda o: o["nrc"])
        pesos = [1 / (i + 1) for i in range(len(populares))]
        destino = (
            rnd.choice(hot) if hot and rnd.random() < 0.6 else rnd.choices(populares, pesos)[0]
        )
        r = await c.inscribir(destino["nrc"])
        res = _resultado(r)
        cuenta[res] += 1
        if res == "exito":
            inscritos.append(destino["nrc"])
            c.materias.add(m["materiaId"])
        elif res == "sin_cupo" and rnd.random() < 0.6:
            alt = r.json().get("alternativa")
            if alt:
                res2 = _resultado(await c.inscribir(alt["nrc"]))
                cuenta[f"alternativa_{res2}"] += 1
                if res2 == "exito":
                    inscritos.append(alt["nrc"])
        await asyncio.sleep(pausa_s * rnd.random())
    # cancelacion de una inscripcion de esta sesion
    if inscritos and rnd.random() < 0.2:
        r = await c.cancelar(rnd.choice(inscritos))
        cuenta["cancelacion_" + ("ok" if r.status_code == 200 else str(r.status_code))] += 1
    # fuera de jornada: NRC de una materia habilitada, pero fuera de su ventana horaria
    if rnd.random() < 0.15:
        jornada = c.est.get("jornada", "noche")
        fuera = sorted(
            n
            for n, d in cat.nrc.items()
            if d["materiaId"] in ids_habilitadas
            and d["bloques"]
            and not en_jornada(d["bloques"], jornada)
        )
        if fuera:
            cuenta["intento_" + _resultado(await c.inscribir(rnd.choice(fuera)))] += 1
    # prerrequisito: NRC de una materia que aun no puede cursar
    if rnd.random() < 0.1:
        bloqueadas = sorted(n for n, d in cat.nrc.items() if d["materiaId"] not in ids_habilitadas)
        if bloqueadas:
            cuenta["intento_" + _resultado(await c.inscribir(rnd.choice(bloqueadas)))] += 1


def libres_actuales(redis_url: str, periodo: str, nrcs: list[str]) -> dict[str, int]:
    r = redis_sync.Redis.from_url(redis_url, decode_responses=True)
    try:
        valores: list[Any] = r.mget(  # type: ignore[assignment]
            [f"cupos:{periodo}:{n}" for n in nrcs]
        )
    finally:
        r.close()
    return {n: int(v) for n, v in zip(nrcs, valores, strict=True) if v is not None}


async def ultimo_cupo(
    cat: Catalogo,
    clientes: list[Cliente],
    rnd: random.Random,
    cuenta: Counter[str],
    redis_url: str,
    periodo: str,
) -> None:
    """Disputa por el ultimo cupo: para cada NRC foco, varios estudiantes que lo vieron
    disponible lo piden a la vez (la pantalla de cada uno quedo vieja, como en la vida real)."""
    focos = sorted(cat.calientes)
    libres = libres_actuales(redis_url, periodo, focos)
    for nrc in focos:
        materia = cat.nrc[nrc]["materiaId"]
        candidatos = [c for c in clientes if nrc in c.vistos and materia not in c.materias]
        rnd.shuffle(candidatos)
        n = max(libres.get(nrc, 0), 0) + 4
        grupo = candidatos[:n]
        if not grupo:
            continue
        cuenta["disputas"] += 1
        respuestas = await asyncio.gather(*(c.inscribir(nrc) for c in grupo))
        for c, r in zip(grupo, respuestas, strict=True):
            res = _resultado(r)
            cuenta["disputa_" + res] += 1
            if res == "exito":
                c.materias.add(materia)


async def simular(
    api: str,
    password: str,
    cantidad: int,
    semilla: int,
    concurrencia: int,
    n_calientes: int,
    pausa_s: float,
    mongo_url: str,
    redis_url: str,
    periodo: str,
) -> Counter[str]:
    rnd = random.Random(semilla)
    cat = cargar_catalogo(mongo_url, redis_url, periodo, rnd, n_calientes)
    muestra = rnd.sample(cat.estudiantes, min(cantidad, len(cat.estudiantes)))
    print(
        f"simulando {len(muestra)} estudiantes (semilla {semilla}, concurrencia {concurrencia}); "
        f"{len(cat.calientes)} NRC con pocos cupos (1 a 4) como foco de disputa"
    )
    cuenta: Counter[str] = Counter()
    sem = asyncio.Semaphore(concurrencia)
    clientes: list[Cliente] = []
    async with httpx.AsyncClient(base_url=api, timeout=20.0) as http:
        # un generador por estudiante: el plan de cada uno no depende del orden de llegada
        async def uno(i: int, e: dict[str, Any]) -> None:
            async with sem:
                try:
                    cliente = Cliente(http, e, password)
                    clientes.append(cliente)
                    await estudiante(cat, cliente, random.Random(f"{semilla}:{i}"), cuenta, pausa_s)
                except httpx.HTTPError as exc:
                    cuenta["error_http"] += 1
                    print(f"  aviso: {type(exc).__name__} con un estudiante", file=sys.stderr)

        await asyncio.gather(*(uno(i, e) for i, e in enumerate(muestra)))
        await ultimo_cupo(cat, clientes, rnd, cuenta, redis_url, periodo)
    return cuenta


def main() -> int:
    ap = argparse.ArgumentParser(description="Genera trafico real contra la API para el lake")
    ap.add_argument("--estudiantes", type=int, default=int(os.environ.get("SIM_ESTUDIANTES", 500)))
    ap.add_argument("--semilla", type=int, default=int(os.environ.get("SEED", 20271)))
    ap.add_argument("--concurrencia", type=int, default=12)
    ap.add_argument("--calientes", type=int, default=30, help="NRC foco de disputa de cupos")
    ap.add_argument("--pausa-s", type=float, default=0.05)
    ap.add_argument("--api", default=os.environ.get("API_URL", "http://localhost:8000"))
    args = ap.parse_args()
    password = os.environ.get("DEMO_PASSWORD")
    if not password:
        print("Falta DEMO_PASSWORD (cargue .env)", file=sys.stderr)
        return 2
    t0 = time.monotonic()
    cuenta = asyncio.run(
        simular(
            args.api,
            password,
            args.estudiantes,
            args.semilla,
            args.concurrencia,
            args.calientes,
            args.pausa_s,
            os.environ.get("MONGO_URL", "mongodb://localhost:27017/inscripcion"),
            os.environ.get("REDIS_URL", "redis://localhost:6379/0"),
            os.environ.get("PERIODO", "2027-1"),
        )
    )
    print(f"listo en {time.monotonic() - t0:.1f}s")
    for k, v in sorted(cuenta.items()):
        print(f"  {k:28s} {v}")
    return 0 if cuenta["sesiones"] else 1


if __name__ == "__main__":
    sys.exit(main())
