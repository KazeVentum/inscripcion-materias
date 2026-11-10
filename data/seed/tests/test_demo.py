"""Perfiles de los seis estudiantes demo (historias de usuario)."""

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


def test_seis_demos_con_ids_fijos(datos: Datos) -> None:
    demos = [e for e in datos["estudiantes"] if e["demo"]]
    assert sorted(e["estudianteId"] for e in demos) == [f"est-00000{i}" for i in range(1, 7)]
    assert sorted(e["semestre"] for e in demos) == [1, 3, 4, 6, 7, 9]


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


def test_est_000002_conserva_nrc_64269_martes_jueves(datos: Datos) -> None:
    nrc = next(n for n in _nrc_inscritos(datos, "est-000002") if n["nrc"] == "64269")
    assert [(b["dia"], b["inicio"], b["fin"]) for b in nrc["bloques"]] == [
        ("MAR", "20:30", "21:59"),
        ("JUE", "20:30", "21:59"),
    ]


def test_est_000006_tarde_semestre_intermedio(datos: Datos) -> None:
    from seed import rules

    demo = _estudiante(datos, "est-000006")
    assert demo["jornada"] == "tarde"
    assert demo["semestre"] == 3
    for n in _nrc_inscritos(datos, "est-000006"):
        assert rules.en_jornada(n["bloques"], "tarde")


def test_todos_los_demas_son_nocturnos(datos: Datos) -> None:
    assert {e["jornada"] for e in datos["estudiantes"] if e["estudianteId"] != "est-000006"} == {"noche"}


def test_cada_materia_tiene_3_nrc_noche_distintos_y_2_tarde(datos: Datos) -> None:
    from seed import rules

    for m in datos["materias"]:
        nrcs = [n for n in datos["nrc"] if n["materiaId"] == m["materiaId"] and n["bloques"]]
        for jornada, minimo in (("noche", 3), ("tarde", 2)):
            firmas = {
                tuple((b["dia"], b["inicio"]) for b in n["bloques"])
                for n in nrcs
                if rules.en_jornada(n["bloques"], jornada)
            }
            assert len(firmas) >= minimo, (m["materiaId"], jornada)
