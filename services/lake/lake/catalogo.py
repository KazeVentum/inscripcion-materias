"""Snapshot del catalogo (NRC, materias) y de los atributos no identificables del estudiante.

Se lee de Mongo (sistema academico simulado) y de Redis (cupos libres actuales). El docente
no se copia. Del estudiante solo salen programa, semestre y jornada, y solo para unirlos a
los eventos por su id; el id en claro nunca se escribe en silver ni gold.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import redis as redis_sync
from pymongo import MongoClient

from .config import Settings


@dataclass(frozen=True)
class FilaNrc:
    nrc: str
    materiaId: str
    materia: str
    creditos: int
    semestreMateria: int
    area: str
    sede: str
    modalidad: str
    franja: str
    cupoTotal: int
    cuposLibres: int | None


@dataclass(frozen=True)
class FilaEstudiante:
    estudianteId: str
    programa: str
    semestre: int
    jornada: str


def leer_catalogo(s: Settings) -> tuple[list[FilaNrc], list[FilaEstudiante]]:
    mongo: MongoClient[dict[str, Any]] = MongoClient(s.mongo_url, serverSelectionTimeoutMS=5000)
    r = redis_sync.Redis.from_url(s.redis_url, decode_responses=True)
    try:
        db = mongo.get_default_database()
        materias = {m["materiaId"]: m for m in db["materias"].find()}
        docs = list(db["nrc"].find({"periodo": s.periodo}))
        libres: dict[str, int | None] = {}
        if docs:
            valores: list[Any] = r.mget(  # type: ignore[assignment]
                [f"cupos:{s.periodo}:{d['nrc']}" for d in docs]
            )
            for d, v in zip(docs, valores, strict=True):
                libres[str(d["nrc"])] = int(v) if v is not None else None
        nrcs = [
            FilaNrc(
                nrc=str(d["nrc"]),
                materiaId=d["materiaId"],
                materia=materias.get(d["materiaId"], {}).get("nombre", d.get("titulo", "")),
                creditos=int(d.get("creditos", 0)),
                semestreMateria=int(materias.get(d["materiaId"], {}).get("semestre", 0)),
                area=materias.get(d["materiaId"], {}).get("area", ""),
                sede=d.get("sede", ""),
                modalidad=d.get("modalidad", ""),
                franja=d.get("franja", ""),
                cupoTotal=int(d["cupoTotal"]),
                cuposLibres=libres.get(str(d["nrc"])),
            )
            for d in docs
        ]
        ests = [
            FilaEstudiante(
                estudianteId=e["estudianteId"],
                programa=e.get("programa", ""),
                semestre=int(e.get("semestre", 0)),
                jornada=e.get("jornada", ""),
            )
            for e in db["estudiantes"].find(
                {}, {"estudianteId": 1, "programa": 1, "semestre": 1, "jornada": 1}
            )
        ]
        return nrcs, ests
    finally:
        mongo.close()
        r.close()
