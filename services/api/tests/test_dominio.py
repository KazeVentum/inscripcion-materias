"""Pruebas unitarias puras de la lógica de dominio."""

from __future__ import annotations

from typing import Any

from app.dominio import (
    CandidataMateria,
    MateriaPensum,
    NrcInfo,
    armar_horario,
    calcular_avance,
    elegir_alternativa,
    en_jornada,
    evaluar_habilitacion,
    franja_de,
    hay_cruce,
    materias_habilitadas,
    mensaje_avance,
    nrc_en_conflicto,
    se_cruzan,
)


def b(dia: str, inicio: str, fin: str) -> dict[str, str]:
    return {"dia": dia, "inicio": inicio, "fin": fin}


# ------------------------------------------------------------------------ cruces


def test_cruce_solapamiento_parcial() -> None:
    assert se_cruzan(b("MAR", "18:15", "19:44"), b("MAR", "19:00", "20:29"))


def test_cruce_bloque_contenido() -> None:
    assert se_cruzan(b("MAR", "08:00", "12:00"), b("MAR", "09:00", "10:00"))


def test_no_cruce_borde_exacto() -> None:
    # fin de uno == inicio del otro: no se traslapan
    assert not se_cruzan(b("MAR", "18:15", "19:44"), b("MAR", "19:44", "21:13"))
    assert not se_cruzan(b("MAR", "19:44", "21:13"), b("MAR", "18:15", "19:44"))


def test_cruce_un_minuto() -> None:
    assert se_cruzan(b("MAR", "18:15", "19:45"), b("MAR", "19:44", "21:13"))


def test_no_cruce_distinto_dia() -> None:
    assert not se_cruzan(b("MAR", "20:30", "21:59"), b("MIE", "20:30", "21:59"))


def test_cruce_hu3_martes_jueves_2030() -> None:
    ocupado = [b("MAR", "20:30", "21:59"), b("JUE", "20:30", "21:59")]
    assert hay_cruce([b("JUE", "21:00", "22:30")], ocupado)
    assert not hay_cruce([b("JUE", "18:45", "20:29")], ocupado)


def test_virtual_sin_bloques_nunca_cruza() -> None:
    assert not hay_cruce([], [b("MAR", "08:00", "09:00")])
    assert not hay_cruce([b("MAR", "08:00", "09:00")], [])


def test_nrc_en_conflicto_devuelve_el_nrc() -> None:
    ocupado: dict[str, dict[str, Any]] = {
        "111": {"materiaId": "A", "bloques": [b("LUN", "08:00", "09:00")]},
        "222": {"materiaId": "B", "bloques": [b("MAR", "08:00", "09:00")]},
    }
    assert nrc_en_conflicto([b("MAR", "08:30", "10:00")], ocupado) == "222"
    assert nrc_en_conflicto([b("MIE", "08:30", "10:00")], ocupado) is None


def test_franja() -> None:
    assert franja_de("11:59") == "mañana"
    assert franja_de("12:00") == "tarde"
    assert franja_de("17:59") == "tarde"
    assert franja_de("18:00") == "noche"


# ----------------------------------------------------------------- prerrequisitos

PRE = {"B": ["A"], "C": ["A", "B"], "PRACTICA": [], "A": []}
MIN = {"PRACTICA": 114}


def test_habilitada_sin_prerrequisitos() -> None:
    assert evaluar_habilitacion("A", PRE, MIN, set(), 0).habilitada


def test_no_habilitada_si_faltan_prerrequisitos() -> None:
    h = evaluar_habilitacion("C", PRE, MIN, {"A"}, 3)
    assert not h.habilitada
    assert "B" in h.motivo


def test_habilitada_con_todos_los_prerrequisitos() -> None:
    assert evaluar_habilitacion("C", PRE, MIN, {"A", "B"}, 6).habilitada


def test_materia_aprobada_no_esta_habilitada() -> None:
    assert not evaluar_habilitacion("A", PRE, MIN, {"A"}, 3).habilitada


def test_creditos_minimos_borde() -> None:
    assert not evaluar_habilitacion("PRACTICA", PRE, MIN, set(), 113).habilitada
    assert evaluar_habilitacion("PRACTICA", PRE, MIN, set(), 114).habilitada
    assert evaluar_habilitacion("PRACTICA", PRE, MIN, set(), 163).habilitada


def test_materias_habilitadas_lista() -> None:
    res = materias_habilitadas(["A", "B", "C", "PRACTICA"], PRE, MIN, {"A"}, 10)
    assert res == ["B"]


# -------------------------------------------------------------------- alternativa


def nrc(
    id_: str, bloques: list[dict[str, str]], sede: str = "Calle 80", materia: str = "M"
) -> NrcInfo:
    franja = franja_de(bloques[0]["inicio"]) if bloques else "mañana"
    return NrcInfo(id_, materia, sede, franja, 20, 3, tuple(bloques))


def test_alternativa_prefiere_misma_franja_y_dias() -> None:
    objetivo = nrc("1", [b("MAR", "18:15", "19:44"), b("JUE", "18:15", "19:44")])
    mismo = nrc("2", [b("MAR", "19:45", "21:14"), b("JUE", "19:45", "21:14")])  # noche, MAR/JUE
    cercano_otro_dia = nrc("3", [b("LUN", "18:15", "19:44")])  # misma hora, otros días
    libres = {"2": 1, "3": 5}
    elegido = elegir_alternativa(objetivo, [mismo, cercano_otro_dia], libres, {})
    assert elegido is not None and elegido.nrc == "2"


def test_alternativa_menor_diferencia_de_inicio() -> None:
    objetivo = nrc("1", [b("MAR", "08:00", "09:29")])
    lejos = nrc("2", [b("MIE", "11:00", "12:29")])
    cerca = nrc("3", [b("MIE", "09:00", "10:29")])
    elegido = elegir_alternativa(objetivo, [lejos, cerca], {"2": 3, "3": 3}, {})
    assert elegido is not None and elegido.nrc == "3"


def test_alternativa_desempata_por_sede() -> None:
    objetivo = nrc("1", [b("MAR", "08:00", "09:29")], sede="Calle 80")
    otra_sede = nrc("2", [b("MIE", "08:00", "09:29")], sede="Perdomo")
    misma_sede = nrc("3", [b("MIE", "08:00", "09:29")], sede="Calle 80")
    elegido = elegir_alternativa(objetivo, [otra_sede, misma_sede], {"2": 1, "3": 1}, {})
    assert elegido is not None and elegido.nrc == "3"


def test_alternativa_descarta_sin_cupo_cruce_y_otra_materia() -> None:
    objetivo = nrc("1", [b("MAR", "08:00", "09:29")])
    sin_cupo = nrc("2", [b("MAR", "08:00", "09:29")])
    con_cruce = nrc("3", [b("LUN", "08:00", "09:29")])
    otra_materia = nrc("4", [b("VIE", "08:00", "09:29")], materia="OTRA")
    buena = nrc("5", [b("SAB", "14:00", "15:29")])
    ocupado = {"900": {"materiaId": "X", "bloques": [b("LUN", "08:30", "10:00")]}}
    libres = {"2": 0, "3": 4, "4": 4, "5": 2}
    elegido = elegir_alternativa(
        objetivo, [sin_cupo, con_cruce, otra_materia, buena], libres, ocupado
    )
    assert elegido is not None and elegido.nrc == "5"


def test_alternativa_ninguna() -> None:
    objetivo = nrc("1", [b("MAR", "08:00", "09:29")])
    assert elegir_alternativa(objetivo, [objetivo], {"1": 5}, {}) is None


def test_alternativa_virtual() -> None:
    objetivo = nrc("1", [])
    virtual = nrc("2", [])
    presencial = nrc("3", [b("MAR", "08:00", "09:29")])
    elegido = elegir_alternativa(objetivo, [presencial, virtual], {"2": 1, "3": 9}, {})
    assert elegido is not None and elegido.nrc == "2"


# ------------------------------------------------------------------- recomendación


def test_armar_horario_evita_cruces_y_respeta_creditos() -> None:
    a1 = nrc("a1", [b("MAR", "08:00", "09:29")], materia="A")
    a2 = nrc("a2", [b("MIE", "08:00", "09:29")], materia="A")
    b1 = nrc("b1", [b("MAR", "08:30", "10:00")], materia="B")  # cruza con a1
    c1 = nrc("c1", [b("JUE", "08:00", "09:29")], materia="C")
    libres = {"a1": 9, "a2": 1, "b1": 5, "c1": 5}
    candidatas = [
        CandidataMateria("A", 1, 3, [a1, a2]),
        CandidataMateria("B", 1, 3, [b1]),
        CandidataMateria("C", 2, 3, [c1]),
    ]
    res = armar_horario(candidatas, {}, libres, max_creditos=18)
    assert [n.nrc for n in res] == ["a1", "c1"]  # B no cabe sin cruce
    assert [n.nrc for n in armar_horario(candidatas, {}, libres, max_creditos=3)] == ["a1"]


# ----------------------------------------------------------------------- jornada


def test_jornada_noche_exige_todos_los_bloques_entre_18_y_22() -> None:
    assert en_jornada([b("MAR", "20:30", "21:59"), b("JUE", "18:15", "19:44")], "noche")
    assert en_jornada([b("LUN", "18:00", "22:00")], "noche")
    assert not en_jornada([b("MAR", "16:45", "18:14")], "noche")
    assert not en_jornada([b("MAR", "20:30", "21:59"), b("JUE", "15:15", "16:44")], "noche")
    assert not en_jornada([b("MAR", "21:00", "22:01")], "noche")


def test_jornada_tarde_exige_todos_los_bloques_entre_12_y_18() -> None:
    assert en_jornada([b("LUN", "12:15", "13:44"), b("MIE", "16:00", "17:29")], "tarde")
    assert not en_jornada([b("LUN", "16:45", "18:14")], "tarde")  # termina después de las 18:00
    assert not en_jornada([b("LUN", "11:30", "12:59")], "tarde")
    assert not en_jornada([b("LUN", "18:15", "19:44")], "tarde")


def test_nrc_virtual_sin_bloques_esta_en_cualquier_jornada() -> None:
    assert en_jornada([], "noche")
    assert en_jornada([], "tarde")


def test_alternativa_solo_dentro_de_la_jornada() -> None:
    objetivo = nrc("1", [b("MAR", "20:30", "21:59")])
    de_tarde = nrc("2", [b("MAR", "14:00", "15:29")])
    de_noche = nrc("3", [b("JUE", "18:15", "19:44")])
    libres = {"2": 5, "3": 5}
    cands = [objetivo, de_tarde, de_noche]
    assert elegir_alternativa(objetivo, cands, libres, {}, "noche") == de_noche
    assert elegir_alternativa(objetivo, [objetivo, de_tarde], libres, {}, "noche") is None
    assert elegir_alternativa(objetivo, cands, libres, {}, "tarde") == de_tarde


# ------------------------------------------------------------------------ avance

PENSUM = [
    MateriaPensum("A1", "Materia A1", 1, False),
    MateriaPensum("B3", "Materia B3", 3, False),
    MateriaPensum("C3", "Materia C3", 3, False),
    MateriaPensum("D3", "Materia D3", 3, False),
    MateriaPensum("E3", "Electiva E3", 3, True),
    MateriaPensum("F3", "Materia F3", 3, False),
    MateriaPensum("G4", "Materia G4", 4, False),
]


def _avance(aprobadas: set[str], inscritas: set[str], bloqueadas: set[str], sin_oferta: set[str]):  # type: ignore[no-untyped-def]
    return calcular_avance(
        3,
        PENSUM,
        aprobadas,
        inscritas,
        lambda m: m not in bloqueadas,
        lambda m: m not in sin_oferta,
    )


def test_avance_cuenta_solo_obligatorias_del_semestre_actual() -> None:
    a = _avance({"F3"}, {"B3"}, {"D3"}, set())
    ids = [m.materia_id for m in a.materias]
    assert ids == ["B3", "C3", "D3"]  # sin electiva E3, sin aprobada F3, sin G4 (semestre 4)
    assert a.total_pendientes == 3
    assert a.inscritas == 1
    assert a.faltan == 2
    assert a.habilitadas_sin_inscribir == 1  # C3
    assert {m.materia_id: m.estado for m in a.materias} == {
        "B3": "inscrita",
        "C3": "habilitada",
        "D3": "bloqueada_prerrequisito",
    }


def test_avance_las_atrasadas_van_aparte_y_no_cuentan() -> None:
    a = _avance(set(), set(), set(), set())
    assert [m.materia_id for m in a.atrasadas] == ["A1"]
    assert a.total_pendientes == 4  # B3, C3, D3, F3
    assert a.faltan == 4
    assert "A1" not in a.mensaje
    assert "4 materias" in a.mensaje


def test_avance_estado_sin_oferta_y_prioridad() -> None:
    a = _avance({"B3", "C3"}, {"D3"}, {"D3"}, {"F3"})
    assert {m.materia_id: m.estado for m in a.materias} == {"D3": "inscrita", "F3": "sin_oferta"}
    assert a.habilitadas_sin_inscribir == 0
    assert a.faltan == 1


def test_avance_semestre_al_dia() -> None:
    a = _avance({"B3", "C3", "D3", "F3"}, set(), set(), set())
    assert a.total_pendientes == 0
    assert a.faltan == 0
    assert "al día" in a.mensaje


def test_mensajes_de_avance() -> None:
    esperado = "Te faltan 2 materias de tu semestre; puedes inscribir 1 ahora."
    assert mensaje_avance(3, 2, 1) == esperado
    assert mensaje_avance(3, 1, 2) == "Te falta 1 materia de tu semestre; puedes inscribir 2 ahora."
    assert mensaje_avance(3, 3, 0).startswith("Te faltan 3 materias de tu semestre; por ahora")
    assert "todas las materias de tu semestre" in mensaje_avance(3, 0, 0)
