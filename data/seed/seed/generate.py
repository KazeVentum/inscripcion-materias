"""Genera los JSON sintéticos en data/seed/out/.

Determinista: misma SEED y PERIODO producen exactamente los mismos archivos.
Todo dato es sintético (Faker es_CO). No se lee ningún insumo real.

Uso: python -m seed.generate   (variables: SEED=20271, PERIODO=2027-1)
"""

from __future__ import annotations

import json
import os
import random
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from itertools import pairwise
from pathlib import Path
from typing import Any, Literal

import yaml
from faker import Faker
from pydantic import BaseModel, Field

from . import rules

DEFAULT_SEED = 20271
DEFAULT_PERIODO = "2027-1"
N_ESTUDIANTES = 3500
N_DOCENTES = 300
PROGRAMA_ID = "ISIS-2019"
DOMINIO_CORREO = "sintetico.uniminuto.test"

# Pesos (los de la referencia son conteos; se normalizan con rng.choices).
# Sesgo hacia la noche: casi todos los estudiantes son nocturnos (la referencia real es 0.24/0.29/0.47).
PESOS_FRANJA = {"mañana": 0.06, "tarde": 0.22, "noche": 0.72}
# NRC por materia según semestre (los semestres bajos tienen más demanda).
RANGO_NRC_SEMESTRE = ((3, (12, 15)), (6, (10, 12)), (10, (7, 9)))
MIN_NRC_NOCHE = 3
MIN_NRC_TARDE = 3
PESOS_MODALIDAD = {"presencial": 0.887, "virtual": 0.077, "sincronica": 0.035}
PESOS_SEDE = {"Calle 80": 0.70, "Perdomo": 0.20, "San Camilo": 0.10}
PESOS_SEMESTRE = (0.12, 0.11, 0.11, 0.11, 0.10, 0.10, 0.09, 0.09, 0.09, 0.08)
PROB_REZAGO = 0.15

# Cuantiles de cupoTotal de la referencia: min 1, p10 4, mediana 15, p90 29, max 35.
_CUPO_CUANTILES = ((0.0, 1.0), (0.10, 4.0), (0.50, 15.0), (0.90, 29.0), (1.0, 35.0))

# NRC de demostración para HU3: clase martes y jueves 20:30 (materia de semestre 4).
DEMO_MATERIA = "ISUMBG193"
DEMO_NRC = "64269"  # NRC fijo del demo HU3 (lo usan las pruebas e2e)
# Electivas que el demo de semestre 9 no ha aprobado (deja 120 créditos).
DEMO_9_ELECTIVAS_NO_APROBADAS = frozenset({"ISUMBG014", "ISUMBG042", "ISUMBG044", "ISUMBG022", "ISUMBG093"})

PERFILES_DEMO: dict[str, dict[str, Any]] = {
    "est-000001": {
        "semestre": 1, "rezago": False, "inscripciones": 3,
        "perfil": "Primer semestre, sin materias aprobadas",
    },
    "est-000002": {
        "semestre": 4, "rezago": False, "inscripciones": 2,
        "forzadas": [(DEMO_MATERIA, 0)],
        "perfil": "Semestre 4 con clase martes y jueves 20:30 (HU3)",
    },
    "est-000003": {
        "semestre": 6, "rezago": False, "inscripciones": 4,
        "perfil": "Semestre 6 con avance regular",
    },
    "est-000004": {
        "semestre": 9, "rezago": False, "inscripciones": 3,
        # Habilitada para ISUMBG064 (120 créditos) pero NO inscrita; debe quedar un NRC con cupo.
        "habilitadas": ["ISUMBG064"],
        "excluir": frozenset({"ISUMBG064"}),
        "perfil": "Semestre 9 cerca de práctica: 120 créditos, habilitada para ISUMBG064 (no inscrita)",
    },
    "est-000005": {
        "semestre": 7, "rezago": True, "inscripciones": 4, "antiguas": True,
        "perfil": "Semestre 7 con rezago: materias pendientes de semestres anteriores",
    },
    "est-000006": {
        "semestre": 3, "rezago": False, "inscripciones": 2, "jornada": "tarde",
        "perfil": "Semestre 3 de jornada tarde: solo ve NRC entre 12:00 y 18:00",
    },
}

REFERENCE_DIR = rules.REFERENCE_DIR
OUT_DIR = rules.OUT_DIR

Dia = Literal["LUN", "MAR", "MIE", "JUE", "VIE", "SAB"]

_PARES_DIAS: tuple[tuple[Dia, Dia], ...] = (("LUN", "MIE"), ("MAR", "JUE"), ("MIE", "VIE"), ("LUN", "JUE"), ("MAR", "VIE"), ("LUN", "VIE"))
_DIAS_LABORALES: tuple[Dia, ...] = ("LUN", "MAR", "MIE", "JUE", "VIE")


class Bloque(BaseModel):
    """Bloque horario embebido en un NRC (modelo de CLAUDE.md)."""

    dia: Dia
    inicio: str = Field(pattern=r"^\d{2}:\d{2}$")
    fin: str = Field(pattern=r"^\d{2}:\d{2}$")
    edificio: str
    salon: str


@dataclass(frozen=True)
class Referencia:
    pensum: dict[str, Any]
    prerrequisitos: dict[str, list[str]]
    creditos_minimos: dict[str, int]
    distribucion: dict[str, Any]


@dataclass
class _Estudiante:
    id: str
    semestre: int
    max_insc: int
    demo: bool
    jornada: str = "noche"
    aprobadas: set[str] = field(default_factory=set)
    creditos: int = 0
    matriculadas: set[str] = field(default_factory=set)
    bloques: list[dict[str, str]] = field(default_factory=list)
    nrcs: list[str] = field(default_factory=list)


@dataclass
class _Ctx:
    materias: dict[str, dict[str, Any]]
    materias_orden: list[str]
    prereq: dict[str, list[str]]
    minimos: dict[str, int]
    meta: dict[str, dict[str, Any]]
    nrc_por_materia: dict[str, list[str]]


def cargar_referencia(ref_dir: Path = REFERENCE_DIR) -> Referencia:
    """Lee y valida los tres insumos de data/reference/."""
    pensum = json.loads((ref_dir / "pensum.json").read_text(encoding="utf-8"))
    yml = yaml.safe_load((ref_dir / "prerrequisitos.yaml").read_text(encoding="utf-8"))
    dist = json.loads((ref_dir / "nrc_distribucion.json").read_text(encoding="utf-8"))

    ids = {m["materiaId"] for m in pensum["materias"]}
    if len(ids) != len(pensum["materias"]):
        raise ValueError("materiaId duplicado en pensum.json")
    prereq: dict[str, list[str]] = {mid: [] for mid in ids}
    for mid, lista in (yml.get("prerrequisitos") or {}).items():
        if mid not in ids:
            raise ValueError(f"prerrequisitos.yaml: materia desconocida {mid}")
        for p in lista or []:
            if p not in ids:
                raise ValueError(f"prerrequisito desconocido {p} para {mid}")
        prereq[mid] = list(lista or [])
    minimos = {k: int(v) for k, v in (yml.get("creditos_minimos") or {}).items()}
    for mid in minimos:
        if mid not in ids:
            raise ValueError(f"creditos_minimos: materia desconocida {mid}")
    total = sum(m["creditos"] for m in pensum["materias"])
    if total != pensum["creditosTotales"]:
        raise ValueError(f"créditos sumados {total} != creditosTotales {pensum['creditosTotales']}")
    orden_topologico(sorted(ids), prereq)  # lanza si hay ciclos
    return Referencia(pensum=pensum, prerrequisitos=prereq, creditos_minimos=minimos, distribucion=dist)


def orden_topologico(ids: list[str], prereq: dict[str, list[str]]) -> list[str]:
    """Orden que respeta prerrequisitos; determinista (desempate lexicográfico)."""
    pendientes = {mid: set(prereq[mid]) for mid in ids}
    orden: list[str] = []
    while pendientes:
        listos = sorted(mid for mid, deps in pendientes.items() if not deps)
        if not listos:
            raise ValueError("ciclo en prerrequisitos")
        orden.extend(listos)
        for mid in listos:
            del pendientes[mid]
        for deps in pendientes.values():
            deps.difference_update(listos)
    return orden


def _norm(texto: str) -> str:
    ascii_ = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z]", "", ascii_.lower())


def _persona(fake: Faker) -> tuple[str, str, str]:
    return (
        fake.first_name().split()[0],
        fake.last_name().split()[0],
        fake.last_name().split()[0],
    )


def _correo(primer: str, ap1: str, usados: set[str]) -> str:
    base = f"{_norm(primer) or 'persona'}.{_norm(ap1) or 'sintetico'}"
    correo = f"{base}@{DOMINIO_CORREO}"
    n = 2
    while correo in usados:
        correo = f"{base}{n}@{DOMINIO_CORREO}"
        n += 1
    usados.add(correo)
    return correo


def _cupo(rng: random.Random) -> int:
    u = rng.random()
    for (u0, v0), (u1, v1) in pairwise(_CUPO_CUANTILES):
        if u <= u1:
            valor = v0 + (v1 - v0) * (u - u0) / (u1 - u0)
            return max(1, min(35, round(valor)))
    return 35


def _libres(rng: random.Random, cupo: int) -> int:
    """Cupos libres objetivo: ~2 % llenos, ~6 % con 1–3 (competencia), ~5 % casi vacíos, resto ~62–88 % ocupado.

    Los NRC grandes (cupo >= 8) del resto nunca quedan con 1–3 libres; los pequeños sí, de forma natural.
    """
    u = rng.random()
    if u < 0.02:
        return 0
    if u < 0.08:
        return min(rng.randint(1, 3), cupo)
    if u < 0.13:
        return cupo - round(rng.uniform(0.05, 0.20) * cupo)
    ocupacion = rng.uniform(0.62, 0.88)
    libres = cupo - round(ocupacion * cupo)
    if cupo >= 8 and libres < 4:
        libres = 4
    elif cupo < 8 and rng.random() < 0.15:
        # Grupos pequeños: con frecuencia se llenan del todo en vez de quedar con 1–3 libres.
        libres = 0
    return libres


def _franjas(rng: random.Random, n: int, primera: str | None) -> list[str]:
    """Franja por NRC de una materia; garantiza al menos 2 franjas distintas."""
    franjas = list(PESOS_FRANJA)
    seq = [rng.choices(franjas, weights=list(PESOS_FRANJA.values()))[0] for _ in range(n)]
    if primera is not None:
        seq[0] = primera
    if len(set(seq)) < 2:
        seq[-1] = next(f for f in franjas if f != seq[0])
    return seq


def _dias(rng: random.Random, k: int, franja: str) -> list[Dia]:
    """Días de las sesiones. Sábado solo en mañana (la referencia lo concentra ahí)."""
    if k == 1:
        if franja == "mañana" and rng.random() < 0.35:
            return ["SAB"]
        return [rng.choice(_DIAS_LABORALES)]
    if k == 2:
        if franja == "mañana" and rng.random() < 0.35:
            return ["SAB", rng.choice(_DIAS_LABORALES)]
        return list(rng.choice(_PARES_DIAS))
    return rng.sample(_DIAS_LABORALES, k)


def _salon(rng: random.Random, patrones: list[str]) -> str:
    pesos = [0.2 if p in ("PEND-LAB", "PENDIENTE") else 1.0 for p in patrones]
    patron = rng.choices(patrones, weights=pesos)[0]
    return re.sub(r"9", lambda _: str(rng.randint(0, 9)), patron)


def _bloques(
    rng: random.Random,
    modalidad: str,
    franja: str,
    edificio: str,
    patrones: list[str],
    opciones_franja: dict[str, tuple[list[tuple[str, str]], list[int]]],
    jornada: str | None = None,
) -> list[dict[str, str]]:
    if modalidad in rules.MODALIDADES_SIN_BLOQUES:
        return []
    k = rng.choices((1, 2, 4), weights=(16, 124, 2))[0]
    salida: list[dict[str, str]] = []
    horas, pesos = opciones_franja[franja]
    if jornada is not None:
        # solo horas dentro de la ventana de la jornada (p. ej. la tarde excluye 16:45–18:14)
        pares = [
            (h, p) for h, p in zip(horas, pesos, strict=True)
            if rules.bloque_en_jornada({"inicio": h[0], "fin": h[1]}, jornada)
        ]
        horas, pesos = [h for h, _ in pares], [p for _, p in pares]
    for dia in sorted(_dias(rng, k, franja), key=rules.DIAS.index):
        inicio, fin = rng.choices(horas, weights=pesos)[0]
        bloque = Bloque(dia=dia, inicio=inicio, fin=fin, edificio=edificio, salon=_salon(rng, patrones))
        salida.append(bloque.model_dump())
    return salida


def _rango_nrc(semestre: int) -> tuple[int, int]:
    return next(r for tope, r in RANGO_NRC_SEMESTRE if semestre <= tope)


def _garantizar_jornadas(
    rng: random.Random,
    mid: str,
    nrcs: list[str],
    nrc_docs: list[dict[str, Any]],
    meta: dict[str, dict[str, Any]],
    edificios: dict[str, list[str]],
    patrones: list[str],
    opciones_franja: dict[str, tuple[list[tuple[str, str]], list[int]]],
    protegido: str | None,
) -> set[str]:
    """Cada materia tiene al menos MIN_NRC_NOCHE NRC en la ventana noche y MIN_NRC_TARDE en la
    ventana tarde, con horarios distintos (día y hora de inicio) para que haya opciones reales.

    Los virtuales no cuentan (no son una opción de horario). Si falta oferta se reescribe el
    horario de un NRC que no esté ya contado en la otra ventana.
    """
    docs = {d["nrc"]: d for d in nrc_docs if d["materiaId"] == mid}

    def firma(n: str) -> tuple[tuple[str, str], ...]:
        return tuple((b["dia"], b["inicio"]) for b in meta[n]["bloques"])

    contados: dict[str, set[str]] = {}
    for jornada, minimo in (("noche", MIN_NRC_NOCHE), ("tarde", MIN_NRC_TARDE)):
        firmas: set[tuple[tuple[str, str], ...]] = set()
        propios: set[str] = set()
        for n in nrcs:
            f = firma(n)
            if f and f not in firmas and rules.en_jornada(meta[n]["bloques"], jornada):
                firmas.add(f)
                propios.add(n)
        ajenos = {n for j, c in contados.items() if j != jornada for n in c}
        while len(propios) < minimo:
            libres = [n for n in nrcs if n not in propios and n not in ajenos and n != protegido]
            if not libres:
                raise RuntimeError(f"materia {mid}: no hay NRC para completar la ventana {jornada}")
            elegido = rng.choice(libres)
            doc = docs[elegido]
            if doc["modalidad"] == "virtual":
                doc["modalidad"] = "presencial"
            edificio = rng.choice(edificios[doc["sede"]])
            for _ in range(50):
                bloques = _bloques(rng, doc["modalidad"], jornada, edificio, patrones, opciones_franja, jornada)
                f = tuple((b["dia"], b["inicio"]) for b in bloques)
                if f not in firmas:
                    break
            else:
                raise RuntimeError(f"materia {mid}: sin horarios distintos en la ventana {jornada}")
            doc["bloques"] = bloques
            doc["franja"] = jornada
            meta[elegido]["bloques"] = bloques
            firmas.add(f)
            propios.add(elegido)
        # solo se protegen MIN NRC de la ventana; el resto queda libre para reescribirse
        orden = sorted(propios, key=lambda n: (n != protegido, nrcs.index(n)))
        contados[jornada] = set(orden[:minimo])
    return contados["noche"]


def _aprobar(
    rng: random.Random,
    semestre: int,
    rezago: bool,
    orden: list[str],
    materias: dict[str, dict[str, Any]],
    prereq: dict[str, list[str]],
    minimos: dict[str, int],
) -> set[str]:
    """Materias aprobadas: solo de semestres anteriores, con rezago aleatorio y prerrequisitos."""

    def prob(sem: int) -> float:
        if rezago:
            return 0.78
        if sem == semestre - 1:
            return 0.93
        return 0.97

    aprobadas: set[str] = set()
    for mid in orden:
        sem = materias[mid]["semestre"]
        if sem >= semestre:
            continue
        if rng.random() < prob(sem) and all(p in aprobadas for p in prereq[mid]):
            aprobadas.add(mid)
    # Materias con créditos mínimos: se aprueban solo si ya tiene esos créditos.
    for mid in sorted(minimos):
        sem = materias[mid]["semestre"]
        if sem >= semestre:
            continue
        creditos = sum(materias[a]["creditos"] for a in aprobadas)
        if rng.random() < prob(sem) and creditos >= minimos[mid]:
            aprobadas.add(mid)
    return aprobadas


def _habilitada(e: _Estudiante, mid: str, ctx: _Ctx) -> bool:
    """Regla central: materia del semestre alcanzado, no aprobada, no inscrita, prerrequisitos y créditos."""
    if ctx.materias[mid]["semestre"] > e.semestre:
        return False
    if mid in e.aprobadas or mid in e.matriculadas:
        return False
    if any(p not in e.aprobadas for p in ctx.prereq[mid]):
        return False
    return not (mid in ctx.minimos and e.creditos < ctx.minimos[mid])


def _cabe(e: _Estudiante, nrc: str, ctx: _Ctx) -> bool:
    """Hay cupo físico y no hay cruce con las otras inscripciones del estudiante."""
    meta = ctx.meta[nrc]
    if len(meta["inscritos"]) >= meta["cupo"]:
        return False
    if not rules.en_jornada(meta["bloques"], e.jornada):
        return False
    return not rules.hay_cruce(e.bloques, meta["bloques"])


def _matricular(e: _Estudiante, nrc: str, ctx: _Ctx) -> None:
    meta = ctx.meta[nrc]
    e.matriculadas.add(meta["materiaId"])
    e.bloques.extend(meta["bloques"])
    e.nrcs.append(nrc)
    meta["inscritos"].append(e.id)


def _completar(
    e: _Estudiante,
    objetivo: int,
    ctx: _Ctx,
    rng: random.Random,
    antiguas: bool = False,
    excluir: frozenset[str] = frozenset(),
) -> None:
    """Añade inscripciones habilitadas hasta llegar a `objetivo` (usado para los demos)."""
    while len(e.nrcs) < objetivo:
        opciones = [
            nrc
            for mid in ctx.materias_orden
            if mid not in excluir and _habilitada(e, mid, ctx)
            for nrc in ctx.nrc_por_materia[mid]
            if _cabe(e, nrc, ctx)
        ]
        if not opciones:
            return
        if antiguas:
            menor = min(ctx.materias[ctx.meta[n]["materiaId"]]["semestre"] for n in opciones)
            opciones = [n for n in opciones if ctx.materias[ctx.meta[n]["materiaId"]]["semestre"] == menor]
        _matricular(e, rng.choice(opciones), ctx)


def build(
    seed: int = DEFAULT_SEED,
    periodo: str = DEFAULT_PERIODO,
    ref_dir: Path = REFERENCE_DIR,
) -> dict[str, list[dict[str, Any]]]:
    """Construye todos los conjuntos de datos en memoria."""
    ref = cargar_referencia(ref_dir)
    dist = ref.distribucion
    rng = random.Random(seed)
    fake = Faker("es_CO")
    fake.seed_instance(seed)
    usados_correo: set[str] = set()

    # Materias y pensum ---------------------------------------------------------
    materias_src: list[dict[str, Any]] = ref.pensum["materias"]
    materias = {m["materiaId"]: m for m in materias_src}
    materias_orden = orden_topologico(sorted(materias), ref.prerrequisitos)
    out_materias = [
        {
            "_id": m["materiaId"],
            "materiaId": m["materiaId"],
            "nombre": m["nombre"],
            "creditos": m["creditos"],
            "semestre": m["semestre"],
            "area": m["area"],
            "electiva": m["electiva"],
        }
        for m in materias_src
    ]
    semestres = [
        {"semestre": s, "materias": [m["materiaId"] for m in materias_src if m["semestre"] == s]}
        for s in range(1, ref.pensum["semestres"] + 1)
    ]
    out_pensum = [
        {
            "_id": PROGRAMA_ID,
            "programaId": PROGRAMA_ID,
            "programa": ref.pensum["programa"],
            "snies": ref.pensum["snies"],
            "creditosTotales": ref.pensum["creditosTotales"],
            "semestres": semestres,
            "prerrequisitos": {mid: ref.prerrequisitos[mid] for mid in materias},
            "creditosMinimos": ref.creditos_minimos,
        }
    ]

    # Docentes -------------------------------------------------------------------
    docentes: list[dict[str, Any]] = []
    for i in range(1, N_DOCENTES + 1):
        primer, ap1, ap2 = _persona(fake)
        docentes.append(
            {
                "_id": f"doc-{i:04d}",
                "docenteId": f"doc-{i:04d}",
                "nombre": f"{primer} {ap1} {ap2}",
                "correo": _correo(primer, ap1, usados_correo),
            }
        )

    # Patrones de salón y bloques por franja (de la referencia) ------------------
    patrones: list[str] = dist["patronesSalon"]
    edificios: dict[str, list[str]] = {s["sede"]: s["edificios"] for s in dist["sedes"]}
    if set(edificios) != set(PESOS_SEDE):
        raise ValueError("las sedes de la referencia no coinciden con PESOS_SEDE")
    opciones_franja: dict[str, tuple[list[tuple[str, str]], list[int]]] = {f: ([], []) for f in rules.FRANJAS}
    for b in dist["bloquesHorarios"]:
        horas, pesos = opciones_franja[rules.franja_de(b["inicio"])]
        horas.append((b["inicio"], b["fin"]))
        pesos.append(int(b["frecuencia"]))

    # NRC ----------------------------------------------------------------------------
    n_por_materia = {m["materiaId"]: rng.randint(*_rango_nrc(m["semestre"])) for m in materias_src}
    numeros = [str(n) for n in rng.sample(range(10000, 100000), sum(n_por_materia.values()))]
    # el NRC del demo HU3 tiene número fijo: ningún otro NRC lo usa
    primero_demo = 0
    for m in materias_src:
        if m["materiaId"] == DEMO_MATERIA:
            break
        primero_demo += n_por_materia[m["materiaId"]]
    numeros = [x for x in numeros if x != DEMO_NRC]
    numeros.insert(primero_demo, DEMO_NRC)
    numeros = numeros[: sum(n_por_materia.values())]
    nrc_docs: list[dict[str, Any]] = []
    meta: dict[str, dict[str, Any]] = {}
    nrc_por_materia: dict[str, list[str]] = {}
    indice = 0
    for m in materias_src:
        mid = m["materiaId"]
        nrc_por_materia[mid] = []
        franjas = _franjas(rng, n_por_materia[mid], "noche" if mid == DEMO_MATERIA else None)
        for j, franja in enumerate(franjas):
            nrc = numeros[indice]
            indice += 1
            modalidad = rng.choices(list(PESOS_MODALIDAD), weights=list(PESOS_MODALIDAD.values()))[0]
            sede = rng.choices(list(PESOS_SEDE), weights=list(PESOS_SEDE.values()))[0]
            edificio = rng.choice(edificios[sede])
            bloques = _bloques(rng, modalidad, franja, edificio, patrones, opciones_franja)
            cupo = _cupo(rng)
            libres = _libres(rng, cupo)
            docente = rng.choice(docentes)["nombre"]
            if mid == DEMO_MATERIA and j == 0:
                # NRC fijo para HU3: martes y jueves 20:30, presencial en Calle 80.
                modalidad, sede, edificio = "presencial", "Calle 80", "RGH"
                bloques = [
                    Bloque(dia="MAR", inicio="20:30", fin="21:59", edificio=edificio, salon="A406LS27").model_dump(),
                    Bloque(dia="JUE", inicio="20:30", fin="21:59", edificio=edificio, salon="A402LS25").model_dump(),
                ]
            nrc_docs.append(
                {
                    "_id": nrc,
                    "nrc": nrc,
                    "periodo": periodo,
                    "materiaId": mid,
                    "titulo": m["nombre"],
                    "creditos": m["creditos"],
                    "sede": sede,
                    "modalidad": modalidad,
                    "docente": docente,
                    "cupoTotal": cupo,
                    "franja": franja,
                    "estado": "activo",
                    "bloques": bloques,
                }
            )
            meta[nrc] = {
                "materiaId": mid,
                "cupo": cupo,
                "objetivo": cupo - libres,
                "bloques": bloques,
                "inscritos": [],
            }
            nrc_por_materia[mid].append(nrc)

        noche = _garantizar_jornadas(
            rng, mid, nrc_por_materia[mid], nrc_docs, meta, edificios, patrones, opciones_franja,
            protegido=nrc_por_materia[mid][0] if mid == DEMO_MATERIA else None,
        )
        # Los 3 NRC nocturnos "de oferta" conservan cupo libre: el estudiante nocturno siempre
        # tiene dónde inscribir cada materia (el resto de NRC sí puede llenarse).
        for n in noche:
            meta[n]["objetivo"] = min(meta[n]["objetivo"], max(0, meta[n]["cupo"] - 4))

    # Estudiantes ---------------------------------------------------------------------
    estudiantes: list[_Estudiante] = []
    est_docs: list[dict[str, Any]] = []
    for i in range(1, N_ESTUDIANTES + 1):
        est_id = f"est-{i:06d}"
        plan = PERFILES_DEMO.get(est_id)
        semestre = rng.choices(range(1, 11), weights=PESOS_SEMESTRE)[0]
        rezago = rng.random() < PROB_REZAGO
        max_insc = rng.choices((3, 4, 5, 6, 7), weights=(1, 2, 3, 2, 1))[0]
        sede = rng.choices(list(PESOS_SEDE), weights=list(PESOS_SEDE.values()))[0]
        primer, ap1, ap2 = _persona(fake)
        correo = _correo(primer, ap1, usados_correo)
        jornada = "noche"
        if plan is not None:
            semestre, rezago = plan["semestre"], plan["rezago"]
            jornada = plan.get("jornada", "noche")
        aprobadas = _aprobar(rng, semestre, rezago, [x for x in materias_orden if x not in ref.creditos_minimos],
                             materias, ref.prerrequisitos, ref.creditos_minimos)
        if est_id == "est-000004":
            aprobadas = {
                mid for mid, m in materias.items()
                if m["semestre"] <= 8 and mid not in DEMO_9_ELECTIVAS_NO_APROBADAS
            }
        creditos = sum(materias[a]["creditos"] for a in aprobadas)
        e = _Estudiante(id=est_id, semestre=semestre, max_insc=max_insc, demo=plan is not None,
                        jornada=jornada, aprobadas=aprobadas, creditos=creditos)
        estudiantes.append(e)
        doc: dict[str, Any] = {
            "_id": est_id,
            "estudianteId": est_id,
            "nombre": f"{primer} {ap1} {ap2}",
            "correo": correo,
            "programa": PROGRAMA_ID,
            "sede": sede,
            "semestre": semestre,
            "jornada": jornada,
            "materiasAprobadas": [mid for mid in materias_orden if mid in aprobadas],
            "creditosAprobados": creditos,
            "demo": e.demo,
        }
        if plan is not None:
            doc["perfilDemo"] = plan["perfil"]
        est_docs.append(doc)

    ctx = _Ctx(materias=materias, materias_orden=materias_orden, prereq=ref.prerrequisitos,
               minimos=ref.creditos_minimos, meta=meta, nrc_por_materia=nrc_por_materia)

    # Demos: inscripciones explícitas (antes del llenado general) --------------------------
    por_id = {e.id: e for e in estudiantes}
    for est_id in sorted(PERFILES_DEMO):
        e = por_id[est_id]
        plan = PERFILES_DEMO[est_id]
        for mid, idx in plan.get("forzadas", []):
            nrc = nrc_por_materia[mid][idx]
            if not (_habilitada(e, mid, ctx) and _cabe(e, nrc, ctx)):
                raise RuntimeError(f"inscripción forzada no aplicable: {est_id} en {nrc} ({mid})")
            _matricular(e, nrc, ctx)
        _completar(
            e, plan["inscripciones"], ctx, rng,
            antiguas=plan.get("antiguas", False),
            excluir=plan.get("excluir", frozenset()),
        )

    # Llenado general hacia el objetivo de cada NRC; segunda pasada con holgura de inscripciones.
    genericos = [e for e in estudiantes if not e.demo]
    orden_nrc = sorted(meta)
    rng.shuffle(orden_nrc)
    for holgura in (0, 3):
        for nrc in orden_nrc:
            m = meta[nrc]
            faltan = m["objetivo"] - len(m["inscritos"])
            if faltan <= 0:
                continue
            candidatos = [
                e
                for e in genericos
                if len(e.nrcs) < e.max_insc + holgura
                and _habilitada(e, m["materiaId"], ctx)
                and _cabe(e, nrc, ctx)
            ]
            rng.shuffle(candidatos)
            for e in candidatos[:faltan]:
                _matricular(e, nrc, ctx)

    # Garantías de los demos (estado final) -------------------------------------------
    for est_id in sorted(PERFILES_DEMO):
        e = por_id[est_id]
        for mid in PERFILES_DEMO[est_id].get("habilitadas", []):
            if not _habilitada(e, mid, ctx):
                raise RuntimeError(f"{est_id} no está habilitado para {mid}")
            if not any(_cabe(e, nrc, ctx) for nrc in nrc_por_materia[mid]):
                raise RuntimeError(f"{est_id}: ningún NRC de {mid} tiene cupo libre sin cruce")

    # est-000006 (tarde): toda materia que puede inscribir de su semestre o el siguiente conserva
    # al menos una opción de tarde sin cruce con lo que ya cursa.
    tarde = por_id["est-000006"]
    for mid in materias_orden:
        cerca = ctx.materias[mid]["semestre"] <= tarde.semestre + 1
        sin_opcion = not any(_cabe(tarde, nrc, ctx) for nrc in nrc_por_materia[mid])
        if cerca and sin_opcion and _habilitada(tarde, mid, ctx):
            raise RuntimeError(f"est-000006: sin NRC de tarde sin cruce para {mid}")

    # Inscripciones confirmadas --------------------------------------------------------
    pares = sorted((eid, nrc) for nrc, m in meta.items() for eid in m["inscritos"])
    inicio = datetime(2026, 10, 1, 8, 0, tzinfo=UTC)
    insc_docs: list[dict[str, Any]] = []
    for eid, nrc in pares:
        creada = inicio + timedelta(minutes=rng.randint(0, 30 * 24 * 60))
        insc_docs.append(
            {
                "_id": f"{periodo}|{eid}|{nrc}",
                "estudianteId": eid,
                "nrc": nrc,
                "materiaId": meta[nrc]["materiaId"],
                "periodo": periodo,
                "estado": "confirmada",
                "creadaEn": creada.strftime("%Y-%m-%dT%H:%M:%SZ"),
            }
        )

    return {
        "materias": out_materias,
        "pensums": out_pensum,
        "nrc": nrc_docs,
        "docentes": docentes,
        "estudiantes": est_docs,
        "inscripciones": insc_docs,
    }


def escribir(data: dict[str, list[dict[str, Any]]], out_dir: Path = OUT_DIR) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for nombre, docs in data.items():
        texto = json.dumps(docs, ensure_ascii=False, indent=2) + "\n"
        (out_dir / f"{nombre}.json").write_text(texto, encoding="utf-8")


def main() -> None:
    from .verify import check  # import tardío: verify no depende de generate

    seed = int(os.environ.get("SEED", DEFAULT_SEED))
    periodo = os.environ.get("PERIODO", DEFAULT_PERIODO)
    data = build(seed, periodo)
    errores = check(data)
    if errores:
        raise SystemExit("Datos generados inválidos:\n" + "\n".join(errores[:20]))
    escribir(data)
    print(f"Datos sintéticos (SEED={seed}, PERIODO={periodo}) escritos en {OUT_DIR}")
    for nombre, docs in data.items():
        print(f"  {nombre}.json: {len(docs)}")


if __name__ == "__main__":
    main()
