"""Reglas de franja y de cruce de horario (seed/rules.py)."""

from __future__ import annotations

import pytest

from seed import rules


def _bloque(dia: str, inicio: str, fin: str) -> dict[str, str]:
    return {"dia": dia, "inicio": inicio, "fin": fin}


@pytest.mark.parametrize(
    ("hora", "franja"),
    [
        ("07:00", "mañana"),
        ("11:59", "mañana"),
        ("12:00", "tarde"),
        ("17:59", "tarde"),
        ("18:00", "noche"),
        ("21:30", "noche"),
    ],
)
def test_franja_en_los_bordes(hora: str, franja: str) -> None:
    assert rules.franja_de(hora) == franja


def test_bloques_adyacentes_no_se_cruzan() -> None:
    a = _bloque("LUN", "07:00", "08:29")
    b = _bloque("LUN", "08:30", "09:59")
    assert not rules.se_cruzan(a, b)
    assert not rules.hay_cruce([a], [b])


def test_bloques_que_se_traslapan_si_se_cruzan() -> None:
    assert rules.se_cruzan(_bloque("MAR", "08:00", "09:30"), _bloque("MAR", "09:00", "10:30"))


def test_bloque_contenido_en_otro_se_cruza() -> None:
    assert rules.se_cruzan(_bloque("MAR", "08:00", "12:00"), _bloque("MAR", "09:00", "10:00"))


def test_mismo_horario_en_distinto_dia_no_se_cruza() -> None:
    assert not rules.se_cruzan(_bloque("LUN", "18:15", "19:44"), _bloque("MAR", "18:15", "19:44"))


def test_virtual_sin_bloques_nunca_cruza() -> None:
    bloques = [_bloque("LUN", "07:00", "09:00")]
    assert not rules.hay_cruce([], bloques)
    assert not rules.hay_cruce(bloques, [])
    assert not rules.bloques_internos_solapados([])
