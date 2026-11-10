"""Catálogo en memoria: NRC, materias y pensum son estáticos durante el periodo.

El perfil del estudiante (materias aprobadas) también cambia poco: se cachea con TTL corto.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from typing import Any

from pymongo.asynchronous.database import AsyncDatabase

from .dominio import NrcInfo

TTL_ESTUDIANTE_S = 300.0


@dataclass(frozen=True)
class Estudiante:
    estudiante_id: str
    nombre: str
    programa: str
    sede: str
    semestre: int
    aprobadas: frozenset[str]
    creditos_aprobados: int


@dataclass(frozen=True)
class MateriaInfo:
    materia_id: str
    nombre: str
    creditos: int
    semestre: int
    area: str


def _estudiante(doc: dict[str, Any]) -> Estudiante:
    return Estudiante(
        estudiante_id=doc["estudianteId"],
        nombre=doc["nombre"],
        programa=doc["programa"],
        sede=doc["sede"],
        semestre=int(doc["semestre"]),
        aprobadas=frozenset(doc.get("materiasAprobadas", [])),
        creditos_aprobados=int(doc.get("creditosAprobados", 0)),
    )


class Catalogo:
    def __init__(self, periodo: str) -> None:
        self.periodo = periodo
        self.nrc_doc: dict[str, dict[str, Any]] = {}  # documento Mongo sin _id
        self.nrc_info: dict[str, NrcInfo] = {}
        self.nrc_por_materia: dict[str, list[str]] = {}
        self.ocupado_json: dict[str, str] = {}  # valor que se guarda en ocupado:{est}
        self.materias: dict[str, MateriaInfo] = {}
        self.prerrequisitos: dict[str, list[str]] = {}
        self.creditos_minimos: dict[str, int] = {}
        self.materias_pensum: list[str] = []
        self._estudiantes: dict[str, tuple[float, Estudiante]] = {}

    async def cargar(self, db: AsyncDatabase[Any]) -> None:
        self.nrc_doc.clear()
        self.nrc_info.clear()
        self.nrc_por_materia.clear()
        self.ocupado_json.clear()
        async for doc in db["nrc"].find({"periodo": self.periodo, "estado": "activo"}):
            doc.pop("_id", None)
            nrc = str(doc["nrc"])
            self.nrc_doc[nrc] = doc
            self.nrc_info[nrc] = NrcInfo(
                nrc=nrc,
                materia_id=doc["materiaId"],
                sede=doc["sede"],
                franja=doc["franja"],
                cupo_total=int(doc["cupoTotal"]),
                creditos=int(doc["creditos"]),
                bloques=tuple(doc["bloques"]),
            )
            self.ocupado_json[nrc] = json.dumps(
                {"materiaId": doc["materiaId"], "bloques": doc["bloques"]}, ensure_ascii=False
            )
            self.nrc_por_materia.setdefault(doc["materiaId"], []).append(nrc)
        async for doc in db["materias"].find():
            self.materias[doc["materiaId"]] = MateriaInfo(
                materia_id=doc["materiaId"],
                nombre=doc["nombre"],
                creditos=int(doc["creditos"]),
                semestre=int(doc["semestre"]),
                area=doc.get("area", ""),
            )
        pensum = await db["pensums"].find_one()
        if pensum is not None:
            self.prerrequisitos = {k: list(v) for k, v in pensum["prerrequisitos"].items()}
            self.creditos_minimos = {
                k: int(v) for k, v in pensum.get("creditosMinimos", {}).items()
            }
            self.materias_pensum = [m for s in pensum["semestres"] for m in s["materias"]]

    async def estudiante(self, db: AsyncDatabase[Any], estudiante_id: str) -> Estudiante | None:
        ahora = time.monotonic()
        hit = self._estudiantes.get(estudiante_id)
        if hit is not None and ahora - hit[0] < TTL_ESTUDIANTE_S:
            return hit[1]
        doc = await db["estudiantes"].find_one({"estudianteId": estudiante_id})
        if doc is None:
            return None
        est = _estudiante(doc)
        self._estudiantes[estudiante_id] = (ahora, est)
        return est

    @staticmethod
    async def buscar_para_login(db: AsyncDatabase[Any], usuario: str) -> Estudiante | None:
        doc = await db["estudiantes"].find_one(
            {"$or": [{"estudianteId": usuario}, {"correo": usuario}]}
        )
        return _estudiante(doc) if doc is not None else None
