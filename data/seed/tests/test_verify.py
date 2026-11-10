"""Los invariantes de verify se cumplen en los datos generados y fallan ante incumplimientos."""

from __future__ import annotations

import copy

from seed.verify import check


def _sin_fallos(datos):
    assert check(datos) == []


def test_datos_generados_cumplen_invariantes(datos):
    _sin_fallos(datos)


def test_detecta_aprobada_sin_prerrequisitos(datos):
    d = copy.deepcopy(datos)
    e = next(x for x in d["estudiantes"] if "ISUMBG013" not in x["materiasAprobadas"])
    e["materiasAprobadas"] = sorted(set(e["materiasAprobadas"]) | {"ISUMBG023"})  # POO sin Programación básica
    e["creditosAprobados"] = sum(m["creditos"] for m in d["materias"] if m["materiaId"] in e["materiasAprobadas"])
    assert any("sin prerrequisitos" in err for err in check(d))


def test_detecta_inscripcion_en_materia_aprobada(datos):
    d = copy.deepcopy(datos)
    ins = d["inscripciones"][0]
    e = next(x for x in d["estudiantes"] if x["estudianteId"] == ins["estudianteId"])
    e["materiasAprobadas"] = sorted(set(e["materiasAprobadas"]) | {ins["materiaId"]})
    e["creditosAprobados"] = sum(m["creditos"] for m in d["materias"] if m["materiaId"] in e["materiasAprobadas"])
    assert any("ya aprobó" in err for err in check(d))


def test_detecta_cruce_entre_inscripciones(datos):
    d = copy.deepcopy(datos)
    nrcs = {n["nrc"]: n for n in d["nrc"]}
    por_est = {}
    for ins in d["inscripciones"]:
        por_est.setdefault(ins["estudianteId"], []).append(ins["nrc"])
    _eid, lista = next((k, v) for k, v in por_est.items() if len(v) >= 2)
    # Forzar que el segundo NRC tenga el mismo horario que el primero.
    nrcs[lista[1]]["bloques"] = copy.deepcopy(nrcs[lista[0]]["bloques"])
    nrcs[lista[1]]["modalidad"] = "presencial"
    assert any("cruce" in err for err in check(d))


def test_detecta_bloques_solapados_en_un_nrc(datos):
    d = copy.deepcopy(datos)
    n = next(x for x in d["nrc"] if x["bloques"])
    b = dict(n["bloques"][0])
    n["bloques"].append(b)  # mismo día y horas: se solapa consigo mismo
    assert any("solapados" in err for err in check(d))


def test_detecta_inscritos_mayores_que_cupo(datos):
    d = copy.deepcopy(datos)
    conteo = {}
    for ins in d["inscripciones"]:
        conteo[ins["nrc"]] = conteo.get(ins["nrc"], 0) + 1
    nrc_id = max(conteo, key=conteo.get)
    next(n for n in d["nrc"] if n["nrc"] == nrc_id)["cupoTotal"] = conteo[nrc_id] - 1
    assert any("> cupoTotal" in err for err in check(d))


def test_detecta_nrc_duplicado(datos):
    d = copy.deepcopy(datos)
    d["nrc"].append(copy.deepcopy(d["nrc"][0]))
    assert any("duplicado" in err for err in check(d))


def test_detecta_nrc_virtual_con_bloques(datos):
    d = copy.deepcopy(datos)
    n = d["nrc"][0]
    n["modalidad"] = "virtual"
    n["bloques"] = [{"dia": "LUN", "inicio": "07:00", "fin": "08:29", "edificio": "RGH", "salon": "A101"}]
    assert any("virtual" in err and "bloques" in err for err in check(d))
