"""Verifica los invariantes de los datos sintéticos.

Uso: python -m seed.verify   (lee data/seed/out/; sale con 1 si hay fallos)
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from . import rules

ARCHIVOS = ("materias", "pensums", "nrc", "docentes", "estudiantes", "inscripciones")


def leer_salida(out_dir: Path = rules.OUT_DIR) -> dict[str, list[dict[str, Any]]]:
    return {
        nombre: json.loads((out_dir / f"{nombre}.json").read_text(encoding="utf-8"))
        for nombre in ARCHIVOS
    }


def _creditos(materias: dict[str, dict[str, Any]], mids: set[str]) -> int:
    return sum(materias[m]["creditos"] for m in mids if m in materias)


def check(data: dict[str, list[dict[str, Any]]]) -> list[str]:
    """Devuelve la lista de fallos (vacía si todo cumple)."""
    errores: list[str] = []
    materias = {m["materiaId"]: m for m in data["materias"]}
    pensum = data["pensums"][0]
    prereq: dict[str, list[str]] = pensum["prerrequisitos"]
    minimos: dict[str, int] = pensum["creditosMinimos"]

    # NRC: duplicados, formato, bloques, franja, virtuales
    ids_nrc = Counter(n["_id"] for n in data["nrc"])
    for nrc_id, c in ids_nrc.items():
        if c > 1:
            errores.append(f"NRC duplicado: {nrc_id}")
    codigos = Counter(n["nrc"] for n in data["nrc"])
    for codigo, c in codigos.items():
        if c > 1:
            errores.append(f"código NRC duplicado: {codigo}")
    nrcs = {n["nrc"]: n for n in data["nrc"]}
    for n in data["nrc"]:
        nrc = n["nrc"]
        if not re.fullmatch(r"\d{5}", nrc):
            errores.append(f"NRC {nrc} no tiene 5 dígitos")
        if n["_id"] != nrc:
            errores.append(f"NRC {nrc}: _id distinto del código")
        if n["materiaId"] not in materias:
            errores.append(f"NRC {nrc}: materia inexistente {n['materiaId']}")
        if n["franja"] not in rules.FRANJAS:
            errores.append(f"NRC {nrc}: franja inválida {n['franja']}")
        if n["modalidad"] not in rules.MODALIDADES:
            errores.append(f"NRC {nrc}: modalidad inválida {n['modalidad']}")
        if n["cupoTotal"] < 1:
            errores.append(f"NRC {nrc}: cupoTotal < 1")
        bloques = n["bloques"]
        if n["modalidad"] in rules.MODALIDADES_SIN_BLOQUES:
            if bloques:
                errores.append(f"NRC virtual {nrc} tiene bloques")
        elif not bloques:
            errores.append(f"NRC {nrc} ({n['modalidad']}) sin bloques")
        for b in bloques:
            if b["dia"] not in rules.DIAS:
                errores.append(f"NRC {nrc}: día inválido {b['dia']}")
            if rules.minutos(b["inicio"]) >= rules.minutos(b["fin"]):
                errores.append(f"NRC {nrc}: bloque con inicio >= fin")
        if rules.bloques_internos_solapados(bloques):
            errores.append(f"NRC {nrc}: bloques solapados")
        if bloques and rules.franja_de(bloques[0]["inicio"]) != n["franja"]:
            errores.append(f"NRC {nrc}: franja no coincide con la hora de inicio")

    franjas_por_materia: dict[str, set[str]] = defaultdict(set)
    for n in data["nrc"]:
        franjas_por_materia[n["materiaId"]].add(n["franja"])
    for mid in materias:
        if len(franjas_por_materia.get(mid, set())) < 2:
            errores.append(f"materia {mid} con NRC en menos de 2 franjas")

    # Estudiantes: aprobadas coherentes con prerrequisitos y créditos
    estudiantes = {e["estudianteId"]: e for e in data["estudiantes"]}
    if len(estudiantes) != len(data["estudiantes"]):
        errores.append("estudianteId duplicado")
    for eid, e in estudiantes.items():
        aprobadas = set(e["materiasAprobadas"])
        if len(aprobadas) != len(e["materiasAprobadas"]):
            errores.append(f"{eid}: materia aprobada repetida")
        for mid in aprobadas:
            if mid not in materias:
                errores.append(f"{eid}: aprobada materia inexistente {mid}")
                continue
            faltan = [p for p in prereq.get(mid, []) if p not in aprobadas]
            if faltan:
                errores.append(f"{eid}: aprobada {mid} sin prerrequisitos {faltan}")
            if mid in minimos and _creditos(materias, aprobadas - {mid}) < minimos[mid]:
                errores.append(f"{eid}: aprobada {mid} sin créditos mínimos ({minimos[mid]})")
        if e["creditosAprobados"] != _creditos(materias, aprobadas):
            errores.append(f"{eid}: creditosAprobados no coincide con sus materias")

    # Jornada: valor válido y oferta mínima por ventana
    for eid, e in estudiantes.items():
        if e.get("jornada") not in rules.JORNADAS:
            errores.append(f"{eid}: jornada inválida {e.get('jornada')!r}")
    por_materia_nrc: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for n in data["nrc"]:
        por_materia_nrc[n["materiaId"]].append(n)
    for mid in materias:
        if not any(rules.en_jornada(n["bloques"], "noche") for n in por_materia_nrc[mid]):
            errores.append(f"materia {mid} sin NRC en la ventana noche")
    tarde = estudiantes.get("est-000006")
    if tarde is not None:
        if tarde.get("jornada") != "tarde":
            errores.append("est-000006 debe ser de jornada tarde")
        libres_nrc = _libres_por_nrc(data)
        aprob = set(tarde["materiasAprobadas"])
        for mid in materias:
            if mid in aprob or any(p not in aprob for p in prereq.get(mid, [])):
                continue
            if mid in minimos and _creditos(materias, aprob) < minimos[mid]:
                continue
            if materias[mid]["semestre"] > tarde["semestre"]:
                continue
            if not any(
                rules.en_jornada(n["bloques"], "tarde") and libres_nrc[n["nrc"]] > 0
                for n in por_materia_nrc[mid]
            ):
                errores.append(f"est-000006: materia habilitada {mid} sin NRC de tarde con cupo")

    # Inscripciones: habilitación, cruces, cupos
    por_estudiante: dict[str, list[dict[str, Any]]] = defaultdict(list)
    confirmadas: Counter[str] = Counter()
    for ins in data["inscripciones"]:
        eid, nrc = ins["estudianteId"], ins["nrc"]
        if nrc not in nrcs:
            errores.append(f"inscripción a NRC inexistente {nrc}")
            continue
        if eid not in estudiantes:
            errores.append(f"inscripción de estudiante inexistente {eid}")
            continue
        n = nrcs[nrc]
        mid = n["materiaId"]
        if ins["materiaId"] != mid:
            errores.append(f"inscripción {eid}/{nrc}: materiaId no coincide con el NRC")
        aprobadas = set(estudiantes[eid]["materiasAprobadas"])
        if mid in aprobadas:
            errores.append(f"{eid}: inscrito en {mid} que ya aprobó")
        faltan = [p for p in prereq.get(mid, []) if p not in aprobadas]
        if faltan:
            errores.append(f"{eid}: inscrito en {mid} sin prerrequisitos {faltan}")
        if mid in minimos and _creditos(materias, aprobadas) < minimos[mid]:
            errores.append(f"{eid}: inscrito en {mid} sin créditos mínimos")
        jornada = estudiantes[eid].get("jornada")
        if jornada in rules.JORNADAS and not rules.en_jornada(n["bloques"], jornada):
            errores.append(f"{eid}: inscrito en NRC {nrc} fuera de su jornada {jornada}")
        if ins["estado"] == "confirmada":
            confirmadas[nrc] += 1
        por_estudiante[eid].append(ins)

    for eid, lista in por_estudiante.items():
        vistas = Counter(nrcs[i["nrc"]]["materiaId"] for i in lista)
        for mid, c in vistas.items():
            if c > 1:
                errores.append(f"{eid}: inscrito dos veces en {mid}")
        for i, a in enumerate(lista):
            for b in lista[i + 1 :]:
                if rules.hay_cruce(nrcs[a["nrc"]]["bloques"], nrcs[b["nrc"]]["bloques"]):
                    errores.append(f"{eid}: cruce entre NRC {a['nrc']} y {b['nrc']}")

    for nrc, c in confirmadas.items():
        if c > nrcs[nrc]["cupoTotal"]:
            errores.append(f"NRC {nrc}: inscritos {c} > cupoTotal {nrcs[nrc]['cupoTotal']}")

    _garantias_de_prueba(data, materias, nrcs, errores)
    return errores


# Mínimos que las pruebas de las fases 3 y 7 necesitan (competencia por el último cupo, NRC llenos).
MIN_NRC_ULTIMO_CUPO = 5
MIN_NRC_LLENOS = 5


def _libres_por_nrc(data: dict[str, list[dict[str, Any]]]) -> dict[str, int]:
    confirmadas = Counter(i["nrc"] for i in data["inscripciones"] if i["estado"] == "confirmada")
    return {n["nrc"]: n["cupoTotal"] - confirmadas.get(n["nrc"], 0) for n in data["nrc"]}


def _garantias_de_prueba(
    data: dict[str, list[dict[str, Any]]],
    materias: dict[str, dict[str, Any]],
    nrcs: dict[str, dict[str, Any]],
    errores: list[str],
) -> None:
    """Datos garantizados para las pruebas posteriores (fase 3 y fase 7)."""
    libres = _libres_por_nrc(data)
    por_materia: dict[str, list[str]] = defaultdict(list)
    for n in data["nrc"]:
        por_materia[n["materiaId"]].append(n["nrc"])

    ultimo_cupo = sum(
        1
        for nrc, lib in libres.items()
        if lib == 1 and any(libres[o] > 0 for o in por_materia[nrcs[nrc]["materiaId"]] if o != nrc)
    )
    if ultimo_cupo < MIN_NRC_ULTIMO_CUPO:
        errores.append(
            f"garantía: {ultimo_cupo} NRC con 1 cupo libre y otro NRC con cupo en su materia "
            f"(mínimo {MIN_NRC_ULTIMO_CUPO})"
        )
    llenos = sum(1 for lib in libres.values() if lib == 0)
    if llenos < MIN_NRC_LLENOS:
        errores.append(f"garantía: {llenos} NRC sin cupo libre (mínimo {MIN_NRC_LLENOS})")
    for mid in materias:
        if not any(libres[o] > 0 for o in por_materia.get(mid, [])):
            errores.append(f"materia {mid} sin NRC con cupo libre")

    periodos = {n["periodo"] for n in data["nrc"]}
    if len(periodos) != 1:
        errores.append(f"los NRC deben tener un solo periodo: {sorted(periodos)}")
    for ins in data["inscripciones"]:
        nrc = nrcs.get(ins["nrc"])
        if nrc is not None and ins["periodo"] != nrc["periodo"]:
            errores.append(
                f"inscripción {ins['estudianteId']}/{ins['nrc']}: periodo {ins['periodo']} "
                f"distinto del NRC ({nrc['periodo']})"
            )


def resumen(data: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    """Conteos para el reporte."""
    nrcs = data["nrc"]
    ins = Counter(i["nrc"] for i in data["inscripciones"] if i["estado"] == "confirmada")
    libres = {n["nrc"]: n["cupoTotal"] - ins.get(n["nrc"], 0) for n in nrcs}
    total_cupo = sum(n["cupoTotal"] for n in nrcs)
    por_semestre = Counter(e["semestre"] for e in data["estudiantes"])
    return {
        "materias": len(data["materias"]),
        "nrc": len(nrcs),
        "nrc_por_franja": dict(Counter(n["franja"] for n in nrcs)),
        "nrc_por_modalidad": dict(Counter(n["modalidad"] for n in nrcs)),
        "estudiantes": len(data["estudiantes"]),
        "estudiantes_por_semestre": {s: por_semestre.get(s, 0) for s in range(1, 11)},
        "inscripciones": len(data["inscripciones"]),
        "ocupacion_media": round(sum(ins.values()) / total_cupo, 3) if total_cupo else 0.0,
        "nrc_sin_cupo_libre": sum(1 for v in libres.values() if v == 0),
        "nrc_1_a_3_libres": sum(1 for v in libres.values() if 1 <= v <= 3),
        "nrc_1_libre": sum(1 for v in libres.values() if v == 1),
        "nrc_mas_80_libres": sum(1 for n in nrcs if libres[n["nrc"]] > 0.8 * n["cupoTotal"]),
        "demo": [
            {"estudianteId": e["estudianteId"], "semestre": e["semestre"], "jornada": e.get("jornada"), "perfil": e.get("perfilDemo")}
            for e in data["estudiantes"]
            if e.get("demo")
        ],
    }


def main() -> int:
    data = leer_salida()
    info = resumen(data)
    for clave, valor in info.items():
        print(f"{clave}: {valor}")
    errores = check(data)
    if errores:
        print(f"FALLA: {len(errores)} incumplimientos")
        for err in errores[:50]:
            print(f"  - {err}")
        return 1
    print("OK: todos los invariantes se cumplen")
    return 0


if __name__ == "__main__":
    sys.exit(main())
