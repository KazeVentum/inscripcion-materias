"""Reglas de dominio compartidas por el generador y el verificador.

Franja por hora de inicio: mañana < 12:00, tarde < 18:00, noche >= 18:00.
Cruce: mismo día y inicio_a < fin_b and inicio_b < fin_a.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from pathlib import Path

SEED_DIR: Path = Path(__file__).resolve().parents[1]  # data/seed
REFERENCE_DIR: Path = Path(__file__).resolve().parents[2] / "reference"  # data/reference
OUT_DIR: Path = SEED_DIR / "out"  # salidas JSON (ignoradas por git)

DIAS: tuple[str, ...] = ("LUN", "MAR", "MIE", "JUE", "VIE", "SAB")
FRANJAS: tuple[str, ...] = ("mañana", "tarde", "noche")
MODALIDADES: tuple[str, ...] = ("presencial", "virtual", "sincronica")

# Modalidades sin bloques horarios embebidos. Las sincrónicas sí tienen horario.
MODALIDADES_SIN_BLOQUES: frozenset[str] = frozenset({"virtual"})

# Materias con prerrequisito de créditos (no de materia). Se leen de prerrequisitos.yaml.
MATERIAS_CON_CREDITOS: frozenset[str] = frozenset({"ISUMBG064", "ISUMBG074"})


def minutos(hora: str) -> int:
    """Convierte 'HH:MM' a minutos desde medianoche."""
    horas, minutos_ = hora.split(":")
    return int(horas) * 60 + int(minutos_)


def franja_de(inicio: str) -> str:
    """Franja según la hora de inicio del bloque."""
    m = minutos(inicio)
    if m < 12 * 60:
        return "mañana"
    if m < 18 * 60:
        return "tarde"
    return "noche"


def se_cruzan(a: Mapping[str, str], b: Mapping[str, str]) -> bool:
    """True si dos bloques ocupan el mismo día con horas traslapadas."""
    return (
        a["dia"] == b["dia"]
        and minutos(a["inicio"]) < minutos(b["fin"])
        and minutos(b["inicio"]) < minutos(a["fin"])
    )


def hay_cruce(bloques_a: Iterable[Mapping[str, str]], bloques_b: Iterable[Mapping[str, str]]) -> bool:
    """True si algún bloque de A se cruza con algún bloque de B."""
    lista_b = list(bloques_b)
    return any(se_cruzan(x, y) for x in bloques_a for y in lista_b)


def bloques_internos_solapados(bloques: Iterable[Mapping[str, str]]) -> bool:
    """True si dos bloques de un mismo NRC se cruzan entre sí."""
    lista = list(bloques)
    for i, x in enumerate(lista):
        for y in lista[i + 1 :]:
            if se_cruzan(x, y):
                return True
    return False
