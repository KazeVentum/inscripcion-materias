"""Pruebas unitarias puras de la lógica de dominio."""

from __future__ import annotations

from typing import Any

from app.dominio import (
    CandidataMateria,
    NrcInfo,
    armar_horario,
    elegir_alternativa,
    evaluar_habilitacion,
    franja_de,
    hay_cruce,
    materias_habilitadas,
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
