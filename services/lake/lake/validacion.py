"""Validacion de conteos bronce -> plata -> oro y revision de datos personales."""

from __future__ import annotations

from typing import Any

from .config import Settings
from .oro import TABLAS_ORO
from .plata import ARCHIVOS_PLATA

# Columnas que nunca deben aparecer en plata ni oro
COLUMNAS_PROHIBIDAS = frozenset(
    {"estudianteid", "nombre", "correo", "email", "docente", "telefono", "documento"}
)


def _uno(con: Any, sql: str) -> Any:
    return con.execute(sql).fetchone()[0]


def _check(nombre: str, esperado: Any, obtenido: Any) -> dict[str, Any]:
    return {
        "nombre": nombre,
        "esperado": esperado,
        "obtenido": obtenido,
        "ok": esperado == obtenido,
    }


def sin_datos_personales(con: Any, s: Settings) -> int:
    """Cuenta columnas prohibidas y valores con forma de id de estudiante o correo."""
    problemas = 0
    archivos = [(s.bucket_plata, f"{n}.parquet") for n in ARCHIVOS_PLATA] + [
        (s.bucket_oro, f"{n}.parquet") for n in TABLAS_ORO
    ]
    for bucket, archivo in archivos:
        ruta = f"{s.esquema}{bucket}/{archivo}"
        cols = con.execute(f"DESCRIBE SELECT * FROM read_parquet('{ruta}')").fetchall()
        for nombre, tipo, *_ in cols:
            if str(nombre).lower() in COLUMNAS_PROHIBIDAS:
                problemas += 1
            if tipo == "VARCHAR":
                problemas += _uno(
                    con,
                    f"SELECT count(*) FROM read_parquet('{ruta}') WHERE "
                    f"regexp_matches(\"{nombre}\", 'est-[0-9]{{3,}}|@')",
                )
    return int(problemas)


def validar(con: Any, s: Settings, plata: dict[str, Any]) -> dict[str, Any]:
    """Cruza los contadores de plata con lo que realmente hay en los Parquet de plata y oro."""

    def silver(nombre: str) -> str:
        return f"read_parquet('{s.esquema}{s.bucket_plata}/{nombre}.parquet')"

    def gold(nombre: str) -> str:
        return f"read_parquet('{s.esquema}{s.bucket_oro}/{nombre}.parquet')"

    def suma(columna: str, tabla: str, filtro: str = "") -> int:
        return int(_uno(con, f"SELECT coalesce(sum({columna}), 0) FROM {gold(tabla)} {filtro}"))

    n_int = _uno(con, f"SELECT count(*) FROM {silver('intentos')}")
    n_exito = _uno(con, f"SELECT count(*) FROM {silver('intentos')} WHERE resultado='exito'")
    n_sin = _uno(con, f"SELECT count(*) FROM {silver('intentos')} WHERE resultado='sin_cupo'")
    n_otros = sum(
        _uno(con, f"SELECT count(*) FROM {silver(t)}")
        for t in ("confirmaciones", "cancelaciones", "busquedas")
    )
    n_ev = plata["eventos"]
    checks = [
        _check(
            "bronce = plata + duplicados + invalidos",
            plata["lineas"],
            n_ev + plata["duplicados"] + plata["invalidos"],
        ),
        _check("plata: eventos escritos = suma de los 4 archivos", n_ev, n_int + n_otros),
        _check(
            "oro demanda_nrc: intentos = plata.intentos", n_int, suma("intentos", "demanda_nrc")
        ),
        _check("oro demanda_nrc: exitos = plata exitos", n_exito, suma("exitos", "demanda_nrc")),
        _check("oro demanda_nrc: sin_cupo = plata sin_cupo", n_sin, suma("sinCupo", "demanda_nrc")),
        _check(
            "oro ocupacion_franja: intentos = plata.intentos",
            n_int,
            suma("intentos", "ocupacion_franja"),
        ),
        _check(
            "oro auditoria_intentos: total = eventos de plata",
            n_ev,
            suma("n", "auditoria_intentos", "WHERE fecha IS NULL"),
        ),
        _check(
            "oro auditoria_intentos: suma por dia = eventos de plata",
            n_ev,
            suma("n", "auditoria_intentos", "WHERE fecha IS NOT NULL"),
        ),
        _check(
            "oro demanda_insatisfecha: sin_cupo = plata sin_cupo",
            n_sin,
            suma("sinCupo", "demanda_insatisfecha"),
        ),
        _check("sin datos personales en plata ni oro", 0, sin_datos_personales(con, s)),
    ]
    return {
        "cuadra": all(c["ok"] for c in checks),
        "bronce": {"lineas": plata["lineas"]},
        "plata": {
            "eventos": n_ev,
            "intentos": n_int,
            "duplicados": plata["duplicados"],
            "invalidos": plata["invalidos"],
            "invalidosPorMotivo": plata["invalidosPorMotivo"],
            "sinCatalogo": plata["sinCatalogo"],
            "filas": plata["filas"],
        },
        "checks": checks,
    }


def resumen(con: Any, s: Settings) -> dict[str, Any]:
    """KPIs para la tarjeta de resumen de la pagina de analitica."""
    p = f"{s.esquema}{s.bucket_plata}"
    g = f"{s.esquema}{s.bucket_oro}"
    fila = con.execute(
        f"""SELECT count(*), count(*) FILTER (WHERE resultado='exito'),
          count(*) FILTER (WHERE resultado='sin_cupo'), count(DISTINCT estudianteHash),
          quantile_cont(latenciaMs, 0.5), quantile_cont(latenciaMs, 0.95)
        FROM read_parquet('{p}/intentos.parquet')"""
    ).fetchone()
    intentos, exitos, sin_cupo, estudiantes, p50, p95 = fila
    ocup = con.execute(
        f"""SELECT count(*), count(*) FILTER (WHERE cuposVacios = 0),
          coalesce(sum(cupoTotal),0), coalesce(sum(ocupados),0)
        FROM read_parquet('{g}/demanda_nrc.parquet') WHERE cupoTotal IS NOT NULL"""
    ).fetchone()
    nrcs, llenos, cupo, ocupados = ocup
    eventos = _uno(
        con,
        f"SELECT coalesce(sum(n),0) FROM read_parquet('{g}/auditoria_intentos.parquet') "
        "WHERE fecha IS NULL",
    )
    return {
        "periodo": s.periodo,
        "eventos": int(eventos),
        "intentos": int(intentos),
        "exitos": int(exitos),
        "sinCupo": int(sin_cupo),
        "tasaExito": (exitos / intentos) if intentos else None,
        "estudiantesUnicos": int(estudiantes),
        "nrcTotales": int(nrcs),
        "nrcLlenos": int(llenos),
        "ocupacionGlobal": (ocupados / cupo) if cupo else None,
        "latenciaIntentoP50Ms": None if p50 is None else float(p50),
        "latenciaIntentoP95Ms": None if p95 is None else float(p95),
    }
