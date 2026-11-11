"""Plata: limpieza, deduplicacion por eventId, union con el catalogo y anonimizacion.

Todo el parseo se hace en SQL (DuckDB) sobre las lineas crudas de bronce, de modo que una
linea corrupta no rompe el job: se cuenta como invalida, con su motivo.

Cuadratura: lineas_bronce = filas_plata + duplicados + invalidos, donde `lineas_bronce` es un
conteo FISICO e independiente (saltos de linea de los .jsonl, leidos con `read_text`) y no
lo que `read_csv` logro parsear. Las lineas que DuckDB no puede leer (byte \\x01, mas de 4 MB)
se cuentan como invalidas con motivo `linea_ilegible`; los mensajes vacios, `mensaje_vacio`.

Techo de volumen: plata y oro se recalculan COMPLETOS desde todo bronce en cada ciclo, con
`memory_limit` 192 MB y spill a disco acotado (128 MB en /tmp). Con eventos de ~400 B eso
aguanta del orden de 1 a 2 millones de lineas en bronce; mas alla hay que pasar a plata
incremental por particion `fecha=` (no implementado: fuera del alcance de la simulacion).
"""

from __future__ import annotations

from typing import Any

from .catalogo import FilaEstudiante, FilaNrc
from .config import Settings

RESULTADOS = (
    "exito",
    "sin_cupo",
    "cruce",
    "prerrequisito",
    "ya_inscrita",
    "materia_aprobada",
    "rechazada",
    "error",
    "fuera_de_jornada",
)
TIPOS = ("intento", "confirmacion", "cancelacion", "busqueda")
ARCHIVOS_PLATA = (
    "intentos",
    "confirmaciones",
    "cancelaciones",
    "busquedas",
    "dim_nrc",
)
_SEP = "\x01"  # delimitador imposible en JSON: cada linea es una sola columna


def _lista(valores: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in valores)


def cargar_dimensiones(con: Any, nrcs: list[FilaNrc], ests: list[FilaEstudiante]) -> None:
    con.execute(
        """CREATE OR REPLACE TEMP TABLE dim_nrc_src (
        nrc VARCHAR, materiaId VARCHAR, materia VARCHAR, creditos INTEGER,
        semestreMateria INTEGER, area VARCHAR, sede VARCHAR, modalidad VARCHAR,
        franja VARCHAR, cupoTotal INTEGER, cuposLibres INTEGER)"""
    )
    if nrcs:
        con.executemany(
            "INSERT INTO dim_nrc_src VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            [
                (
                    n.nrc,
                    n.materiaId,
                    n.materia,
                    n.creditos,
                    n.semestreMateria,
                    n.area,
                    n.sede,
                    n.modalidad,
                    n.franja,
                    n.cupoTotal,
                    n.cuposLibres,
                )
                for n in nrcs
            ],
        )
    con.execute(
        """CREATE OR REPLACE TEMP TABLE dim_est_src (
        estudianteId VARCHAR, programa VARCHAR, semestre INTEGER, jornada VARCHAR)"""
    )
    if ests:
        con.executemany(
            "INSERT INTO dim_est_src VALUES (?,?,?,?)",
            [(e.estudianteId, e.programa, e.semestre, e.jornada) for e in ests],
        )


def hay_bronce(con: Any, s: Settings) -> bool:
    try:
        n = con.execute(
            f"SELECT count(*) FROM glob('{s.esquema}{s.bucket_bronce}/tipo=*/fecha=*/*.jsonl')"
        ).fetchone()[0]
    except Exception:
        return False
    return bool(n)


def lineas_fisicas(con: Any, s: Settings) -> int:
    """Lineas fisicas de bronce (conteo de saltos de linea), independiente del parser CSV."""
    if not hay_bronce(con, s):
        return 0
    return int(
        con.execute(
            "SELECT coalesce(sum(length(content) - length(replace(content, chr(10), ''))), 0) "
            f"FROM read_text('{s.esquema}{s.bucket_bronce}/tipo=*/fecha=*/*.jsonl')"
        ).fetchone()[0]
    )


def construir(con: Any, s: Settings) -> dict[str, Any]:
    """Crea las tablas temporales `ev` (eventos validos y unicos) y los contadores."""
    con.execute("SET TimeZone='UTC'")  # los instantes de ocurridoEn se guardan en UTC
    if hay_bronce(con, s):
        origen = (
            f"read_csv('{s.esquema}{s.bucket_bronce}/tipo=*/fecha=*/*.jsonl', "
            f"columns={{'linea': 'VARCHAR'}}, delim='{_SEP}', quote='', escape='', "
            "header=false, auto_detect=false, max_line_size=4194304, ignore_errors=true, "
            "filename=true)"
        )
    else:
        origen = "(SELECT NULL::VARCHAR AS linea, NULL::VARCHAR AS filename WHERE false)"
    con.execute(
        f"""CREATE OR REPLACE TEMP TABLE crudo AS
        SELECT row_number() OVER () AS rn, linea, filename AS archivo FROM {origen}"""
    )
    con.execute(
        """CREATE OR REPLACE TEMP TABLE parseado AS
        SELECT rn, archivo, linea, CASE WHEN json_type(j0) = 'OBJECT' THEN j0 END AS j
        FROM (SELECT rn, archivo, linea, TRY_CAST(linea AS JSON) AS j0 FROM crudo)"""
    )
    con.execute(
        """CREATE OR REPLACE TEMP TABLE parcial AS
        SELECT rn, archivo, j IS NULL AS no_json, coalesce(trim(linea), '') = '' AS vacio,
          json_extract_string(j, '$.eventId') AS eventId,
          json_extract_string(j, '$.tipo') AS tipo,
          TRY_CAST(json_extract_string(j, '$.ocurridoEn') AS TIMESTAMPTZ)::TIMESTAMP AS ocurridoEn,
          json_extract_string(j, '$.periodo') AS periodo,
          json_extract_string(j, '$.estudianteId') AS estudianteId,
          json_extract_string(j, '$.nrc') AS nrc,
          json_extract_string(j, '$.materiaId') AS materiaId,
          json_extract_string(j, '$.resultado') AS resultado,
          TRY_CAST(json_extract_string(j, '$.latenciaMs') AS BIGINT) AS latenciaMs,
          json_extract_string(j, '$.latenciaMs') AS latenciaTxt,
          json_extract_string(j, '$.alternativaNrc') AS alternativaNrc,
          json_extract_string(j, '$.motivo') AS motivo,
          json_extract_string(j, '$.conflicto') AS conflicto,
          TRY_CAST(json_extract_string(j, '$.resultados') AS INTEGER) AS resultados,
          json_extract_string(j, '$.eventoOrigen') AS eventoOrigen
        FROM parseado"""
    )
    con.execute(
        f"""CREATE OR REPLACE TEMP TABLE clasificado AS
        SELECT *, CASE
          WHEN vacio THEN 'mensaje_vacio'
          WHEN no_json THEN 'json_invalido'
          WHEN eventId IS NULL OR eventId = '' THEN 'sin_eventId'
          WHEN tipo IS NULL OR tipo NOT IN ({_lista(TIPOS)}) THEN 'tipo_desconocido'
          WHEN ocurridoEn IS NULL THEN 'fecha_invalida'
          WHEN estudianteId IS NULL OR estudianteId = '' THEN 'sin_estudiante'
          WHEN tipo <> 'busqueda' AND (nrc IS NULL OR nrc = '') THEN 'sin_nrc'
          WHEN tipo = 'busqueda' AND (materiaId IS NULL OR materiaId = '') THEN 'sin_materia'
          WHEN resultado IS NULL OR resultado NOT IN ({_lista(RESULTADOS)})
               THEN 'resultado_invalido'
          WHEN latenciaTxt IS NOT NULL AND (latenciaMs IS NULL OR latenciaMs < 0)
               THEN 'latencia_invalida'
        END AS invalido
        FROM parcial"""
    )
    con.execute(
        """CREATE OR REPLACE TEMP TABLE numerado AS
        SELECT *, row_number() OVER (PARTITION BY eventId ORDER BY ocurridoEn, archivo, rn) AS orden
        FROM clasificado WHERE invalido IS NULL"""
    )
    con.execute(
        """CREATE OR REPLACE TEMP TABLE ev AS
        SELECT e.eventId, e.tipo, e.ocurridoEn, CAST(e.ocurridoEn AS DATE) AS fecha,
          e.periodo,
          sha256(? || ':' || e.estudianteId) AS estudianteHash,
          d.programa, d.semestre AS semestreEstudiante, d.jornada,
          e.nrc, coalesce(e.materiaId, n.materiaId) AS materiaId,
          coalesce(m.materia, n.materia) AS materia, n.creditos,
          coalesce(m.semestreMateria, n.semestreMateria) AS semestreMateria,
          coalesce(m.area, n.area) AS area, n.sede, n.modalidad, n.franja, n.cupoTotal,
          e.resultado, e.latenciaMs, e.alternativaNrc, e.motivo, e.conflicto,
          e.resultados, e.eventoOrigen
        FROM numerado e
        LEFT JOIN dim_est_src d ON d.estudianteId = e.estudianteId
        LEFT JOIN dim_nrc_src n ON n.nrc = e.nrc
        LEFT JOIN (SELECT DISTINCT ON (materiaId) materiaId, materia, semestreMateria, area
                   FROM dim_nrc_src ORDER BY materiaId) m ON m.materiaId = e.materiaId
        WHERE e.orden = 1""",
        [s.hash_salt],
    )
    lineas = lineas_fisicas(con, s)
    leidas = con.execute("SELECT count(*) FROM crudo").fetchone()[0]
    invalidos = dict(
        con.execute(
            "SELECT invalido, count(*) FROM clasificado WHERE invalido IS NOT NULL GROUP BY 1"
        ).fetchall()
    )
    ilegibles = lineas - leidas  # DuckDB las descarto: se cuentan, no desaparecen
    if ilegibles:
        invalidos["linea_ilegible"] = ilegibles
    duplicados = con.execute("SELECT count(*) FROM numerado WHERE orden > 1").fetchone()[0]
    return {
        "lineas": lineas,
        "invalidos": sum(invalidos.values()),
        "invalidosPorMotivo": invalidos,
        "duplicados": duplicados,
    }


_COLUMNAS_COMUNES = (
    "eventId, ocurridoEn, fecha, periodo, estudianteHash, programa, semestreEstudiante, jornada"
)

_SELECTS = {
    "intentos": f"""SELECT {_COLUMNAS_COMUNES}, nrc, materiaId, materia, creditos,
        semestreMateria, area, sede, modalidad, franja, cupoTotal, resultado, latenciaMs,
        alternativaNrc, motivo, conflicto FROM ev WHERE tipo = 'intento'""",
    "confirmaciones": f"""SELECT {_COLUMNAS_COMUNES}, nrc, materiaId, resultado, latenciaMs,
        motivo, eventoOrigen FROM ev WHERE tipo = 'confirmacion'""",
    "cancelaciones": f"""SELECT {_COLUMNAS_COMUNES}, nrc, materiaId, resultado, latenciaMs
        FROM ev WHERE tipo = 'cancelacion'""",
    "busquedas": f"""SELECT {_COLUMNAS_COMUNES}, materiaId, materia, semestreMateria, area,
        resultado, latenciaMs, resultados FROM ev WHERE tipo = 'busqueda'""",
    "dim_nrc": """SELECT nrc, materiaId, materia, creditos, semestreMateria, area, sede,
        modalidad, franja, cupoTotal, cuposLibres, now()::TIMESTAMP AS snapshotEn
        FROM dim_nrc_src""",
}


def escribir_plata(con: Any, s: Settings) -> dict[str, int]:
    """Escribe los Parquet de silver y devuelve las filas leidas de vuelta de cada uno."""
    filas: dict[str, int] = {}
    for nombre, sql in _SELECTS.items():
        destino = f"{s.ruta_plata(nombre)}.parquet"
        con.execute(f"COPY ({sql}) TO '{destino}' (FORMAT parquet, COMPRESSION zstd)")
        filas[nombre] = con.execute(f"SELECT count(*) FROM read_parquet('{destino}')").fetchone()[0]
    return filas


def ejecutar(
    con: Any, s: Settings, nrcs: list[FilaNrc], ests: list[FilaEstudiante]
) -> dict[str, Any]:
    cargar_dimensiones(con, nrcs, ests)
    resumen = construir(con, s)
    filas = escribir_plata(con, s)
    eventos = sum(filas[t] for t in ("intentos", "confirmaciones", "cancelaciones", "busquedas"))
    sin_catalogo = con.execute(
        "SELECT count(*) FROM ev WHERE tipo <> 'busqueda' AND nrc NOT IN "
        "(SELECT nrc FROM dim_nrc_src)"
    ).fetchone()[0]
    resumen.update({"filas": filas, "eventos": eventos, "sinCatalogo": sin_catalogo})
    return resumen
