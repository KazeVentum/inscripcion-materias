"""Lógica de dominio en funciones puras (sin Redis, Mongo ni Kafka).

Cruce: mismo día e ``inicio_a < fin_b and inicio_b < fin_a``.
Franja por hora de inicio: mañana < 12:00, tarde < 18:00, noche >= 18:00.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

Bloque = Mapping[str, str]

MINUTOS_SIN_HORARIO = 24 * 60  # diferencia "infinita" entre un NRC con horario y uno virtual


def minutos(hora: str) -> int:
    """Convierte 'HH:MM' a minutos desde medianoche."""
    h, m = hora.split(":")
    return int(h) * 60 + int(m)


def franja_de(inicio: str) -> str:
    m = minutos(inicio)
    if m < 12 * 60:
        return "mañana"
    if m < 18 * 60:
        return "tarde"
    return "noche"


def se_cruzan(a: Bloque, b: Bloque) -> bool:
    return (
        a["dia"] == b["dia"]
        and minutos(a["inicio"]) < minutos(b["fin"])
        and minutos(b["inicio"]) < minutos(a["fin"])
    )


def hay_cruce(bloques_a: Iterable[Bloque], bloques_b: Iterable[Bloque]) -> bool:
    lista_b = list(bloques_b)
    return any(se_cruzan(x, y) for x in bloques_a for y in lista_b)


def nrc_en_conflicto(
    bloques: Sequence[Bloque], ocupado: Mapping[str, Mapping[str, Any]]
) -> str | None:
    """Primer NRC ocupado cuyos bloques cruzan con ``bloques`` (None si no hay cruce)."""
    for nrc, entrada in ocupado.items():
        if hay_cruce(bloques, entrada["bloques"]):
            return nrc
    return None


# ----------------------------------------------------------------- prerrequisitos


@dataclass(frozen=True)
class Habilitacion:
    habilitada: bool
    motivo: str = ""


def evaluar_habilitacion(
    materia_id: str,
    prerrequisitos: Mapping[str, Sequence[str]],
    creditos_minimos: Mapping[str, int],
    aprobadas: frozenset[str] | set[str],
    creditos_aprobados: int,
) -> Habilitacion:
    """Una materia está habilitada si no está aprobada, todos sus prerrequisitos sí lo están
    y, para Práctica/Opción de grado, se alcanzan los créditos mínimos."""
    if materia_id in aprobadas:
        return Habilitacion(False, "La materia ya está aprobada")
    faltan = [p for p in prerrequisitos.get(materia_id, ()) if p not in aprobadas]
    if faltan:
        return Habilitacion(False, "Faltan prerrequisitos: " + ", ".join(faltan))
    minimo = creditos_minimos.get(materia_id)
    if minimo is not None and creditos_aprobados < minimo:
        return Habilitacion(
            False, f"Requiere {minimo} créditos aprobados y tienes {creditos_aprobados}"
        )
    return Habilitacion(True)


def materias_habilitadas(
    materias: Iterable[str],
    prerrequisitos: Mapping[str, Sequence[str]],
    creditos_minimos: Mapping[str, int],
    aprobadas: frozenset[str] | set[str],
    creditos_aprobados: int,
) -> list[str]:
    return [
        m
        for m in materias
        if evaluar_habilitacion(
            m, prerrequisitos, creditos_minimos, aprobadas, creditos_aprobados
        ).habilitada
    ]


# ----------------------------------------------------------------------- NRC / cupos


@dataclass(frozen=True)
class NrcInfo:
    nrc: str
    materia_id: str
    sede: str
    franja: str
    cupo_total: int
    creditos: int
    bloques: tuple[Bloque, ...]

    @property
    def dias(self) -> frozenset[str]:
        return frozenset(b["dia"] for b in self.bloques)

    @property
    def inicio_min(self) -> int | None:
        return min((minutos(b["inicio"]) for b in self.bloques), default=None)


def _diferencia_inicio(a: NrcInfo, b: NrcInfo) -> int:
    ia, ib = a.inicio_min, b.inicio_min
    if ia is None and ib is None:
        return 0
    if ia is None or ib is None:
        return MINUTOS_SIN_HORARIO
    return abs(ia - ib)


def elegir_alternativa(
    objetivo: NrcInfo,
    candidatos: Iterable[NrcInfo],
    libres: Mapping[str, int],
    ocupado: Mapping[str, Mapping[str, Any]],
) -> NrcInfo | None:
    """NRC alternativo más cercano al ``objetivo``: misma materia, con cupo y sin cruce.

    Orden: misma franja y mismos días > menor diferencia de hora de inicio > misma sede
    (el NRC como último desempate, para que el resultado sea determinista).
    """
    validos = [
        c
        for c in candidatos
        if c.nrc != objetivo.nrc
        and c.materia_id == objetivo.materia_id
        and libres.get(c.nrc, 0) > 0
        and nrc_en_conflicto(c.bloques, ocupado) is None
    ]
    if not validos:
        return None

    def clave(c: NrcInfo) -> tuple[int, int, int, str]:
        igual_horario = c.franja == objetivo.franja and c.dias == objetivo.dias
        return (
            0 if igual_horario else 1,
            _diferencia_inicio(objetivo, c),
            0 if c.sede == objetivo.sede else 1,
            c.nrc,
        )

    return min(validos, key=clave)


# ------------------------------------------------------------------ recomendaciones


@dataclass
class CandidataMateria:
    materia_id: str
    semestre: int
    creditos: int
    opciones: list[NrcInfo] = field(default_factory=list)  # ya filtrados por cupo y cruce


def armar_horario(
    candidatas: Sequence[CandidataMateria],
    ocupado: Mapping[str, Mapping[str, Any]],
    libres: Mapping[str, int],
    max_creditos: int,
) -> list[NrcInfo]:
    """Greedy: recorre las materias por semestre (menor primero) y créditos, y toma el NRC con
    más cupos libres que no cruce con lo ya ocupado ni con lo elegido, sin pasar de
    ``max_creditos``."""
    elegidos: list[NrcInfo] = []
    bloques_elegidos: list[Bloque] = []
    total = 0
    for cand in sorted(candidatas, key=lambda c: (c.semestre, -c.creditos, c.materia_id)):
        if total + cand.creditos > max_creditos:
            continue
        for nrc in sorted(cand.opciones, key=lambda n: (-libres.get(n.nrc, 0), n.nrc)):
            if libres.get(nrc.nrc, 0) <= 0:
                continue
            if nrc_en_conflicto(nrc.bloques, ocupado) is not None:
                continue
            if hay_cruce(nrc.bloques, bloques_elegidos):
                continue
            elegidos.append(nrc)
            bloques_elegidos.extend(nrc.bloques)
            total += cand.creditos
            break
    return elegidos
