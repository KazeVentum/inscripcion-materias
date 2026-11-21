"""Siembra automática para el servicio `seed` de docker compose.

Si Mongo ya tiene NRC y Redis tiene sus cupos, no hace nada (los datos y las inscripciones
hechas en la demo se conservan entre reinicios). Si falta cualquiera de los dos, genera los
datos sintéticos en memoria (misma semilla que `make seed`), los valida y los carga.

`SEED_FORZAR=1` recarga siempre (lo usa `make seed`).
Uso: python -m seed.auto
"""

from __future__ import annotations

import os
import sys
from typing import Any

import redis
from pymongo import MongoClient

from .generate import DEFAULT_PERIODO, DEFAULT_SEED, build
from .load import DEFAULT_MONGO_URL, DEFAULT_REDIS_URL, cargar
from .verify import check


def ya_sembrado(mongo_url: str, redis_url: str, periodo: str) -> bool:
    cliente: MongoClient[Any] = MongoClient(mongo_url)
    r = redis.Redis.from_url(redis_url, decode_responses=True)
    try:
        nrc = cliente.get_default_database()["nrc"].find_one({"periodo": periodo}, {"nrc": 1})
        if nrc is None:
            return False
        return bool(r.exists(f"cupototal:{periodo}:{nrc['nrc']}"))
    finally:
        cliente.close()
        r.close()


def main() -> int:
    mongo_url = os.environ.get("MONGO_URL", DEFAULT_MONGO_URL)
    redis_url = os.environ.get("REDIS_URL", DEFAULT_REDIS_URL)
    periodo = os.environ.get("PERIODO", DEFAULT_PERIODO)
    semilla = int(os.environ.get("SEED", DEFAULT_SEED))
    forzar = os.environ.get("SEED_FORZAR", "0") == "1"

    if not forzar and ya_sembrado(mongo_url, redis_url, periodo):
        print(f"Datos sintéticos ya cargados para {periodo}; no se recargan (SEED_FORZAR=1 obliga)")
        return 0

    print(f"Generando datos sintéticos (SEED={semilla}, PERIODO={periodo})...")
    data = build(semilla, periodo)
    errores = check(data)
    if errores:
        print(f"FALLA: {len(errores)} incumplimientos en los datos generados")
        for err in errores[:20]:
            print(f"  - {err}")
        return 1

    errores = cargar(data, mongo_url, redis_url)
    print(
        f"Cargado: {len(data['estudiantes'])} estudiantes, {len(data['materias'])} materias, "
        f"{len(data['nrc'])} NRC, {len(data['inscripciones'])} inscripciones"
    )
    if errores:
        print(f"FALLA: {len(errores)} incumplimientos de consistencia Mongo/Redis")
        for err in errores[:20]:
            print(f"  - {err}")
        return 1
    print("OK: Mongo y Redis son consistentes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
