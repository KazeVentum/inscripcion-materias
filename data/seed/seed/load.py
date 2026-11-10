"""Carga los datos sintéticos en Mongo y Redis.

Mongo (MONGO_URL, por defecto mongodb://localhost:27017/inscripcion): recarga las colecciones
estudiantes, pensums, materias, nrc e inscripciones (drop + insert) con índices por la clave de
partición de CLAUDE.md.

Redis (REDIS_URL, por defecto redis://localhost:6379/0): antes de cargar borra (SCAN, nunca KEYS)
`cupos:{periodo}:*`, `cupototal:{periodo}:*`, `ocupado:*`, `reserva:*` y `reservas:pendientes`,
y después crea:
  cupos:{periodo}:{nrc}      = cupoTotal - confirmadas (entero)
  cupototal:{periodo}:{nrc}  = cupoTotal (entero)
  ocupado:{estudianteId}     = hash, campo = nrc, valor = JSON {"materiaId", "bloques"}
                               (NRC virtuales: "bloques": [])

Al final compara Mongo con Redis (check_consistency) y sale con 1 si hay incumplimientos.
Idempotente: ejecutarlo dos veces deja el mismo estado.
Uso: python -m seed.load
"""

from __future__ import annotations

import json
import os
import sys
from collections import Counter, defaultdict
from collections.abc import Iterable
from typing import Any

import redis
from pymongo import ASCENDING, MongoClient
from pymongo.database import Database

from .verify import leer_salida

DEFAULT_MONGO_URL = "mongodb://localhost:27017/inscripcion"
DEFAULT_REDIS_URL = "redis://localhost:6379/0"
LOTE_REDIS = 1000
PATRONES_BORRADO = ("cupos:{periodo}:*", "cupototal:{periodo}:*", "ocupado:*", "reserva:*")
CLAVE_RESERVAS = "reservas:pendientes"

Datos = dict[str, list[dict[str, Any]]]


def cargar_mongo(db: Database[Any], data: Datos) -> None:
    for nombre, docs in data.items():
        if nombre == "docentes":
            continue  # no es una colección del modelo de CLAUDE.md
        coleccion = db[nombre]
        coleccion.drop()
        if docs:
            coleccion.insert_many([dict(d) for d in docs])

    db["estudiantes"].create_index([("estudianteId", ASCENDING)], unique=True)
    db["pensums"].create_index([("programaId", ASCENDING)], unique=True)
    db["materias"].create_index([("materiaId", ASCENDING)], unique=True)
    db["nrc"].create_index([("materiaId", ASCENDING)])
    db["nrc"].create_index([("nrc", ASCENDING)], unique=True)
    db["inscripciones"].create_index([("estudianteId", ASCENDING)])
    db["inscripciones"].create_index([("nrc", ASCENDING)])


def _periodo_unico(data: Datos) -> str:
    periodos = {str(n["periodo"]) for n in data["nrc"]}
    if len(periodos) != 1:
        raise ValueError(f"se esperaba un solo periodo en los NRC, hay {sorted(periodos)}")
    return periodos.pop()


def _texto(valor: bytes | str | None) -> str:
    if valor is None:
        return "(ausente)"
    return valor.decode() if isinstance(valor, bytes) else valor


def _borrar_claves(r: redis.Redis, patrones: Iterable[str]) -> None:
    for patron in patrones:
        lote: list[bytes | str] = []
        for clave in r.scan_iter(match=patron, count=LOTE_REDIS):
            lote.append(clave)
            if len(lote) >= LOTE_REDIS:
                r.delete(*lote)
                lote = []
        if lote:
            r.delete(*lote)


def cargar_redis(r: redis.Redis, data: Datos) -> None:
    periodo = _periodo_unico(data)
    _borrar_claves(r, [p.format(periodo=periodo) for p in PATRONES_BORRADO])
    r.delete(CLAVE_RESERVAS)

    confirmadas: Counter[str] = Counter(
        i["nrc"] for i in data["inscripciones"] if i["estado"] == "confirmada"
    )
    pipe = r.pipeline(transaction=False)
    n_pipe = 0
    for n in data["nrc"]:
        pipe.set(f"cupos:{periodo}:{n['nrc']}", n["cupoTotal"] - confirmadas.get(n["nrc"], 0))
        pipe.set(f"cupototal:{periodo}:{n['nrc']}", n["cupoTotal"])
        n_pipe += 2
        if n_pipe >= LOTE_REDIS:
            pipe.execute()
            pipe = r.pipeline(transaction=False)
            n_pipe = 0

    por_nrc = {n["nrc"]: n for n in data["nrc"]}
    for i in data["inscripciones"]:
        if i["estado"] != "confirmada":
            continue
        n = por_nrc[i["nrc"]]
        valor = json.dumps({"materiaId": n["materiaId"], "bloques": n["bloques"]}, ensure_ascii=False)
        pipe.hset(f"ocupado:{i['estudianteId']}", i["nrc"], valor)
        n_pipe += 1
        if n_pipe >= LOTE_REDIS:
            pipe.execute()
            pipe = r.pipeline(transaction=False)
            n_pipe = 0
    pipe.execute()


def check_consistency(mongo_db: Database[Any], r: redis.Redis) -> list[str]:
    """Compara Redis con Mongo. Devuelve los incumplimientos (lista vacía si todo cuadra).

    - Todo NRC: cupos == cupoTotal - confirmadas y cupototal == cupoTotal.
    - Todo estudiante con inscripciones confirmadas: ocupado tiene exactamente sus NRC.
    - Ningún ocupado:* de un estudiante sin inscripciones (clave sobrante).
    """
    errores: list[str] = []
    nrcs = list(
        mongo_db["nrc"].find({}, {"_id": 0, "nrc": 1, "periodo": 1, "cupoTotal": 1})
    )
    confirmadas: Counter[str] = Counter()
    por_estudiante: dict[str, set[str]] = defaultdict(set)
    for ins in mongo_db["inscripciones"].find(
        {"estado": "confirmada"}, {"_id": 0, "estudianteId": 1, "nrc": 1}
    ):
        confirmadas[ins["nrc"]] += 1
        por_estudiante[ins["estudianteId"]].add(ins["nrc"])

    claves: list[str] = []
    for n in nrcs:
        claves += [f"cupos:{n['periodo']}:{n['nrc']}", f"cupototal:{n['periodo']}:{n['nrc']}"]
    valores = r.mget(claves)
    for idx, n in enumerate(nrcs):
        cupos, total = valores[2 * idx], valores[2 * idx + 1]
        esperado = n["cupoTotal"] - confirmadas.get(n["nrc"], 0)
        if cupos is None or int(cupos) != esperado:
            errores.append(f"NRC {n['nrc']}: cupos en Redis {_texto(cupos)} != {esperado}")
        if total is None or int(total) != n["cupoTotal"]:
            errores.append(f"NRC {n['nrc']}: cupototal en Redis {_texto(total)} != {n['cupoTotal']}")

    for est_id, esperados in por_estudiante.items():
        reales = {_texto(c) for c in r.hkeys(f"ocupado:{est_id}")}
        if reales != esperados:
            errores.append(
                f"{est_id}: ocupado tiene {sorted(reales)} y debería tener {sorted(esperados)}"
            )
    for clave in r.scan_iter(match="ocupado:*", count=LOTE_REDIS):
        texto = _texto(clave)
        est_id = texto.removeprefix("ocupado:")
        if est_id not in por_estudiante:
            errores.append(f"{texto}: clave sobrante (el estudiante no tiene inscripciones)")
    return errores


def cargar(data: Datos, mongo_url: str, redis_url: str) -> list[str]:
    """Carga Mongo y Redis, y devuelve los incumplimientos de check_consistency."""
    cliente: MongoClient[Any] = MongoClient(mongo_url)
    r = redis.Redis.from_url(redis_url, decode_responses=True)
    try:
        db = cliente.get_default_database()
        cargar_mongo(db, data)
        cargar_redis(r, data)
        return check_consistency(db, r)
    finally:
        cliente.close()
        r.close()


def main() -> int:
    mongo_url = os.environ.get("MONGO_URL", DEFAULT_MONGO_URL)
    redis_url = os.environ.get("REDIS_URL", DEFAULT_REDIS_URL)
    data = leer_salida()
    errores = cargar(data, mongo_url, redis_url)
    print(
        f"Cargado: {len(data['estudiantes'])} estudiantes, {len(data['nrc'])} NRC, "
        f"{len(data['inscripciones'])} inscripciones (Mongo {mongo_url}, Redis {redis_url})"
    )
    if errores:
        print(f"FALLA: {len(errores)} incumplimientos de consistencia")
        for err in errores[:50]:
            print(f"  - {err}")
        return 1
    print("OK: Mongo y Redis son consistentes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
