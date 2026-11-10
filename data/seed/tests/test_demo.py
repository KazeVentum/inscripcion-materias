"""Perfiles de los cinco estudiantes demo (historias de usuario)."""

from __future__ import annotations

from collections import Counter
from typing import Any

from seed.generate import DEMO_MATERIA

Datos = dict[str, list[dict[str, Any]]]


def _estudiante(datos: Datos, eid: str) -> dict[str, Any]:
    return next(e for e in datos["estudiantes"] if e["estudianteId"] == eid)


def _nrc_inscritos(datos: Datos, eid: str) -> list[dict[str, Any]]:
    nrcs = {n["nrc"]: n for n in datos["nrc"]}
    return [nrcs[i["nrc"]] for i in datos["inscripciones"] if i["estudianteId"] == eid]


def test_cinco_demos_con_ids_fijos(datos: Datos) -> None:
    demos = [e for e in datos["estudiantes"] if e["demo"]]
    assert sorted(e["estudianteId"] for e in demos) == [f"est-00000{i}" for i in range(1, 6)]
    assert sorted(e["semestre"] for e in demos) == [1, 4, 6, 7, 9]


def test_est_000001_primer_semestre_sin_aprobadas(datos: Datos) -> None:
    demo = _estudiante(datos, "est-000001")
    assert demo["semestre"] == 1
    assert demo["materiasAprobadas"] == []


def test_est_000002_clase_martes_y_jueves_2030(datos: Datos) -> None:
    bloques = [b for n in _nrc_inscritos(datos, "est-000002") for b in n["bloques"]]
    assert any(b["dia"] == "MAR" and b["inicio"] == "20:30" for b in bloques)
    assert any(b["dia"] == "JUE" and b["inicio"] == "20:30" for b in bloques)
    assert DEMO_MATERIA in {n["materiaId"] for n in _nrc_inscritos(datos, "est-000002")}


def test_est_000004_habilitada_y_no_inscrita_en_isumbg064(datos: Datos) -> None:
    demo = _estudiante(datos, "est-000004")
    materia = "ISUMBG064"
    assert demo["semestre"] == 9
    assert demo["creditosAprobados"] >= 114
    assert materia not in demo["materiasAprobadas"]
    assert all(p in demo["materiasAprobadas"] for p in datos["pensums"][0]["prerrequisitos"][materia])
    assert materia not in {n["materiaId"] for n in _nrc_inscritos(datos, "est-000004")}

    confirmadas = Counter(i["nrc"] for i in datos["inscripciones"] if i["estado"] == "confirmada")
    con_cupo = [n for n in datos["nrc"] if n["materiaId"] == materia and confirmadas[n["nrc"]] < n["cupoTotal"]]
    assert con_cupo, "debe existir un NRC de ISUMBG064 con cupo libre"


def test_est_000005_con_materias_pendientes_de_semestres_1_2(datos: Datos) -> None:
    demo = _estudiante(datos, "est-000005")
    pendientes = {
        m["materiaId"]
        for m in datos["materias"]
        if m["semestre"] in (1, 2) and m["materiaId"] not in demo["materiasAprobadas"]
    }
    assert pendientes, "debe tener materias de semestres 1–2 sin aprobar"
    inscritas = {n["materiaId"] for n in _nrc_inscritos(datos, "est-000005")}
    assert inscritas & pendientes, "debe estar cursando alguna materia pendiente de semestres 1–2"
