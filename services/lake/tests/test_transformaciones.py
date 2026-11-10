"""Plata y oro con datos pequenos, sobre una carpeta local (sin MinIO ni Redpanda)."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

import duckdb
import pytest

from lake import oro, plata, validacion
from lake.catalogo import FilaEstudiante, FilaNrc
from lake.config import Settings

SAL = "sal-de-prueba"


def hash_esperado(est: str) -> str:
    return hashlib.sha256(f"{SAL}:{est}".encode()).hexdigest()


def nrc(n: str, materia: str, cupo: int, libres: int | None, **kw: Any) -> FilaNrc:
    datos: dict[str, Any] = {
        "nrc": n,
        "materiaId": materia,
        "materia": f"Materia {materia}",
        "creditos": 3,
        "semestreMateria": 2,
        "area": "Area",
        "sede": "Calle 80",
        "modalidad": "presencial",
        "franja": "noche",
        "cupoTotal": cupo,
        "cuposLibres": libres,
    }
    datos.update(kw)
    return FilaNrc(**datos)


CATALOGO = [nrc("100", "M1", 3, 0), nrc("200", "M2", 5, 3, franja="tarde"), nrc("300", "M3", 4, 4)]
ESTUDIANTES = [FilaEstudiante(f"est-00000{i}", "ISIS", 2, "noche") for i in range(1, 5)]


def ev(
    eid: str, tipo: str, seg: int, est: str, n: str | None, res: str, lat: int = 5, **extra: Any
) -> dict[str, Any]:
    d: dict[str, Any] = {
        "eventId": eid,
        "tipo": tipo,
        "ocurridoEn": f"2026-11-09T21:00:{seg:02d}.000Z",
        "periodo": "2027-1",
        "estudianteId": est,
        "nrc": n,
        "materiaId": {"100": "M1", "200": "M2", "300": "M3"}.get(n or ""),
        "resultado": res,
        "latenciaMs": lat,
        "alternativaNrc": None,
    }
    d.update(extra)
    return d


EVENTOS: list[dict[str, Any]] = [
    # NRC 100 (cupo 3, hoy lleno): tres estudiantes entran; el 4.o recibe sin_cupo
    ev("i1", "intento", 1, "est-000001", "100", "exito", 10),
    ev("i2", "intento", 2, "est-000002", "100", "exito", 20),
    ev("i3", "intento", 3, "est-000003", "100", "exito", 30),
    ev("i4", "intento", 4, "est-000004", "100", "sin_cupo", 40, alternativaNrc="200"),
    # NRC 200: est 1, 2 y 3 lo toman; est 3 lo cancela (no debe contar en combinaciones)
    ev("i5", "intento", 5, "est-000001", "200", "exito", 50),
    ev("i6", "intento", 6, "est-000002", "200", "exito", 60),
    ev("i7", "intento", 7, "est-000003", "200", "exito", 70),
    ev("c1", "cancelacion", 8, "est-000003", "200", "exito", 3),
    ev("k1", "confirmacion", 9, "est-000001", "100", "exito", 100, eventoOrigen="i1"),
    ev("b1", "busqueda", 10, "est-000004", None, "exito", 2, materiaId="M2", resultados=2),
    ev("i8", "intento", 11, "est-000004", "300", "cruce", 15, conflicto="200"),
]


@pytest.fixture
def lake(tmp_path: Path) -> tuple[Settings, Any]:
    s = Settings(hash_salt=SAL, esquema=f"{tmp_path}/", combos_min_estudiantes=2)
    for b in (s.bucket_bronce, s.bucket_plata, s.bucket_oro):
        (tmp_path / b).mkdir()
    return s, duckdb.connect(":memory:")


def escribir_bronce(s: Settings, lineas: list[str], nombre: str = "lote") -> None:
    carpeta = Path(s.esquema) / s.bucket_bronce / "tipo=intento" / "fecha=2026-11-09"
    carpeta.mkdir(parents=True, exist_ok=True)
    (carpeta / f"{nombre}.jsonl").write_text("\n".join(lineas) + "\n", encoding="utf-8")


def correr(s: Settings, con: Any) -> dict[str, Any]:
    pl = plata.ejecutar(con, s, CATALOGO, ESTUDIANTES)
    filas_oro = oro.ejecutar(con, s)
    val = validacion.validar(con, s, pl)
    val["oro"] = filas_oro
    return val


def test_plata_dedup_invalidos_y_cuadratura(lake: tuple[Settings, Any]) -> None:
    s, con = lake
    lineas = [json.dumps(e) for e in EVENTOS]
    lineas += [json.dumps(EVENTOS[0])]  # duplicado exacto (redelivery at-least-once)
    lineas += [json.dumps({**EVENTOS[1], "ocurridoEn": "2026-11-09T21:59:00.000Z"})]  # mismo id
    lineas += ["esto no es json", "[1,2]"]
    lineas += [json.dumps({**EVENTOS[2], "eventId": ""})]
    lineas += [json.dumps({**EVENTOS[2], "eventId": "x1", "tipo": "otro"})]
    lineas += [json.dumps({**EVENTOS[2], "eventId": "x2", "ocurridoEn": "ayer"})]
    lineas += [json.dumps({**EVENTOS[2], "eventId": "x3", "resultado": "quizas"})]
    lineas += [json.dumps({**EVENTOS[2], "eventId": "x4", "latenciaMs": -5})]
    lineas += [json.dumps({**EVENTOS[2], "eventId": "x5", "nrc": None})]
    escribir_bronce(s, lineas)
    val = correr(s, con)

    p = val["plata"]
    assert val["bronce"]["lineas"] == len(lineas) == 11 + 2 + 2 + 6
    assert p["eventos"] == len(EVENTOS)
    assert p["duplicados"] == 2
    assert p["invalidos"] == 8
    assert p["invalidosPorMotivo"] == {
        "json_invalido": 2,
        "sin_eventId": 1,
        "tipo_desconocido": 1,
        "fecha_invalida": 1,
        "resultado_invalido": 1,
        "latencia_invalida": 1,
        "sin_nrc": 1,
    }
    # el contrato central: plata = bronce - duplicados - invalidos
    assert p["eventos"] == val["bronce"]["lineas"] - p["duplicados"] - p["invalidos"]
    malos = [c for c in val["checks"] if not c["ok"]]
    assert val["cuadra"] and not malos


def test_plata_anonimiza_y_une_con_el_catalogo(lake: tuple[Settings, Any]) -> None:
    s, con = lake
    escribir_bronce(s, [json.dumps(e) for e in EVENTOS])
    correr(s, con)
    fila = con.execute(
        f"SELECT estudianteHash, programa, semestreEstudiante, materia, sede, modalidad, franja, "
        f"cupoTotal FROM read_parquet('{s.esquema}silver/intentos.parquet') WHERE eventId = 'i5'"
    ).fetchone()
    assert fila == (
        hash_esperado("est-000001"),
        "ISIS",
        2,
        "Materia M2",
        "Calle 80",
        "presencial",
        "tarde",
        5,
    )
    # ni columnas ni valores con el id original, correos o nombres
    for tabla in plata.ARCHIVOS_PLATA:
        cols = con.execute(
            f"DESCRIBE SELECT * FROM read_parquet('{s.esquema}silver/{tabla}.parquet')"
        ).fetchall()
        assert not {c[0].lower() for c in cols} & validacion.COLUMNAS_PROHIBIDAS
    assert validacion.sin_datos_personales(con, s) == 0
    otra_sal = hashlib.sha256(b"otra:est-000001").hexdigest()
    assert fila[0] != otra_sal


def test_oro_demanda_nrc(lake: tuple[Settings, Any]) -> None:
    s, con = lake
    escribir_bronce(s, [json.dumps(e) for e in EVENTOS])
    correr(s, con)
    filas = {
        r[0]: r
        for r in con.execute(
            f"SELECT nrc, intentos, exitos, sinCupo, otros, ocupados, ocupacion, cuposVacios, "
            f"llenoEn, tiempoHastaLlenarseS, primerIntento "
            f"FROM read_parquet('{s.esquema}gold/demanda_nrc.parquet')"
        ).fetchall()
    }
    assert len(filas) == 3  # todos los NRC del catalogo, tengan o no intentos
    n100 = filas["100"]
    assert n100[1:6] == (4, 3, 1, 0, 3)  # intentos, exitos, sinCupo, otros, ocupados
    assert n100[6] == 1.0 and n100[7] == 0
    # se lleno con el 3.er exito (21:00:03); el primer intento fue a las 21:00:01
    assert str(n100[8]).endswith("21:00:03") and n100[9] == 2.0
    n200 = filas["200"]
    assert n200[1:6] == (3, 3, 0, 0, 2)  # cupo 5, libres 3 => 2 ocupados (Redis)
    assert n200[8] is None and n200[9] is None  # nunca se lleno
    assert n200[7] == 3
    n300 = filas["300"]
    assert n300[1:6] == (1, 0, 0, 1, 0) and n300[6] == 0.0


def test_oro_ocupacion_franja_y_insatisfecha(lake: tuple[Settings, Any]) -> None:
    s, con = lake
    escribir_bronce(s, [json.dumps(e) for e in EVENTOS])
    correr(s, con)
    franjas = {
        r[0]: r
        for r in con.execute(
            f"SELECT franja, nrcs, cupoTotal, ocupados, nrcLlenos, intentos, sinCupo "
            f"FROM read_parquet('{s.esquema}gold/ocupacion_franja.parquet')"
        ).fetchall()
    }
    assert franjas["noche"] == ("noche", 2, 7, 3, 1, 5, 1)
    assert franjas["tarde"] == ("tarde", 1, 5, 2, 0, 3, 0)
    ins = con.execute(
        f"SELECT materiaId, sinCupo, estudiantesAfectados, intentos "
        f"FROM read_parquet('{s.esquema}gold/demanda_insatisfecha.parquet')"
    ).fetchall()
    assert ins == [("M1", 1, 1, 4)]


def test_oro_combinaciones_ignora_cancelados_y_respeta_el_minimo(
    lake: tuple[Settings, Any],
) -> None:
    s, con = lake
    escribir_bronce(s, [json.dumps(e) for e in EVENTOS])
    correr(s, con)
    pares = con.execute(
        f"SELECT programa, semestre, nrcA, nrcB, estudiantes, soporte "
        f"FROM read_parquet('{s.esquema}gold/combinaciones_nrc.parquet')"
    ).fetchall()
    # est 1 y 2 tienen (100, 200); est 3 cancelo 200 y no suma
    assert [p[:5] for p in pares] == [("ISIS", 2, "100", "200", 2)]
    assert pares[0][5] == pytest.approx(2 / 3)  # 3 estudiantes con inscripcion activa


def test_oro_auditoria_percentiles(lake: tuple[Settings, Any]) -> None:
    s, con = lake
    lat = [10, 20, 30, 40, 50]
    evs = [ev(f"a{i}", "intento", i, "est-000001", "300", "exito", v) for i, v in enumerate(lat)]
    escribir_bronce(s, [json.dumps(e) for e in evs])
    plata.ejecutar(con, s, CATALOGO, ESTUDIANTES)
    oro.ejecutar(con, s)
    fila = con.execute(
        f"SELECT n, latenciaP50Ms, latenciaP95Ms, latenciaMaxMs "
        f"FROM read_parquet('{s.esquema}gold/auditoria_intentos.parquet') "
        f"WHERE fecha IS NULL AND tipo = 'intento' AND resultado = 'exito'"
    ).fetchone()
    assert fila == (5, 30.0, pytest.approx(48.0), 50)
    por_dia = con.execute(
        f"SELECT count(*) FROM read_parquet('{s.esquema}gold/auditoria_intentos.parquet') "
        f"WHERE fecha = DATE '2026-11-09'"
    ).fetchone()
    assert por_dia == (1,)


def test_sin_bronce_todo_queda_en_cero_y_cuadra(lake: tuple[Settings, Any]) -> None:
    s, con = lake
    val = correr(s, con)
    assert val["bronce"]["lineas"] == 0 and val["plata"]["eventos"] == 0
    assert val["cuadra"]
    assert val["oro"]["demanda_nrc"] == 3  # el catalogo se publica aunque no haya eventos


def test_recalcular_es_idempotente(lake: tuple[Settings, Any]) -> None:
    s, con = lake
    escribir_bronce(s, [json.dumps(e) for e in EVENTOS])
    a = correr(s, con)
    b = correr(s, con)
    assert a["plata"] == b["plata"] and a["oro"] == b["oro"]
