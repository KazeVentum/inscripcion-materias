"""Oro: tablas de negocio en Parquet (`gold`) calculadas desde los Parquet de plata."""

from __future__ import annotations

from typing import Any

from .config import Settings

TABLAS_ORO = (
    "demanda_nrc",
    "ocupacion_franja",
    "combinaciones_nrc",
    "auditoria_intentos",
    "demanda_insatisfecha",
)


def _vistas(con: Any, s: Settings) -> None:
    for nombre in ("intentos", "confirmaciones", "cancelaciones", "busquedas", "dim_nrc"):
        con.execute(
            f"CREATE OR REPLACE TEMP VIEW s_{nombre} AS "
            f"SELECT * FROM read_parquet('{s.ruta_plata(nombre)}.parquet')"
        )


def _movimientos(con: Any) -> None:
    """Altas (+1) y bajas (-1) por estudiante y NRC, en orden cronologico."""
    con.execute(
        """CREATE OR REPLACE TEMP TABLE movimientos AS
        SELECT estudianteHash, nrc, ocurridoEn, eventId, 1 AS delta FROM s_intentos
          WHERE resultado = 'exito'
        UNION ALL
        SELECT estudianteHash, nrc, ocurridoEn, eventId, -1 FROM s_confirmaciones
          WHERE resultado = 'rechazada'
        UNION ALL
        SELECT estudianteHash, nrc, ocurridoEn, eventId, -1 FROM s_cancelaciones
          WHERE resultado = 'exito'"""
    )
    # estado actual por (estudiante, NRC): manda el ultimo movimiento
    con.execute(
        """CREATE OR REPLACE TEMP TABLE activas AS
        SELECT estudianteHash, nrc FROM (
          SELECT *, row_number() OVER (
            PARTITION BY estudianteHash, nrc ORDER BY ocurridoEn DESC, eventId DESC) AS r
          FROM movimientos)
        WHERE r = 1 AND delta = 1"""
    )


def _demanda_nrc(con: Any) -> None:
    con.execute(
        """CREATE OR REPLACE TEMP TABLE acumulado AS
        SELECT nrc, ocurridoEn, d.cupoTotal,
          sum(delta) OVER (PARTITION BY nrc ORDER BY ocurridoEn, eventId) AS neto_acum
        FROM movimientos m LEFT JOIN s_dim_nrc d USING (nrc)"""
    )
    con.execute(
        """CREATE OR REPLACE TEMP TABLE demanda_nrc AS
        WITH intentos AS (
          SELECT nrc, count(*) AS intentos,
            count(*) FILTER (WHERE resultado = 'exito') AS exitos,
            count(*) FILTER (WHERE resultado = 'sin_cupo') AS sinCupo,
            count(*) FILTER (WHERE resultado NOT IN ('exito', 'sin_cupo')) AS otros,
            count(DISTINCT estudianteHash) AS estudiantes,
            min(ocurridoEn) AS primerIntento
          FROM s_intentos GROUP BY nrc),
        neto AS (SELECT nrc, sum(delta) AS neto FROM movimientos GROUP BY nrc),
        base AS (
          SELECT coalesce(d.nrc, i.nrc) AS nrc, d.materiaId, d.materia, d.semestreMateria,
            d.area, d.sede, d.modalidad, d.franja, d.cupoTotal, d.cuposLibres,
            coalesce(i.intentos, 0) AS intentos, coalesce(i.exitos, 0) AS exitos,
            coalesce(i.sinCupo, 0) AS sinCupo, coalesce(i.otros, 0) AS otros,
            coalesce(i.estudiantes, 0) AS estudiantes, i.primerIntento,
            coalesce(n.neto, 0) AS neto
          FROM s_dim_nrc d
          FULL JOIN intentos i ON i.nrc = d.nrc
          LEFT JOIN neto n ON n.nrc = coalesce(d.nrc, i.nrc)),
        ocup AS (
          SELECT *,
            -- ocupados al momento del snapshot: cupo total - cupos libres (Redis); si falta, neto
            CASE WHEN cupoTotal IS NOT NULL AND cuposLibres IS NOT NULL
                 THEN cupoTotal - cuposLibres ELSE greatest(neto, 0) END AS ocupados
          FROM base),
        lleno AS (
          SELECT o.nrc, min(a.ocurridoEn) AS llenoEn
          FROM ocup o JOIN acumulado a ON a.nrc = o.nrc
          WHERE o.cupoTotal IS NOT NULL
            -- ocupacion inicial inferida = ocupados actuales - neto de los eventos
            AND greatest(o.ocupados - o.neto, 0) + a.neto_acum >= o.cupoTotal
          GROUP BY o.nrc)
        SELECT getvariable('periodo') AS periodo, o.nrc, o.materiaId, o.materia, o.semestreMateria, o.area,
          o.sede, o.modalidad, o.franja, o.cupoTotal, o.intentos, o.exitos, o.sinCupo,
          o.otros, o.estudiantes,
          CASE WHEN o.intentos > 0 THEN o.exitos::DOUBLE / o.intentos END AS tasaExito,
          o.ocupados,
          CASE WHEN o.cupoTotal > 0 THEN o.ocupados::DOUBLE / o.cupoTotal END AS ocupacion,
          CASE WHEN o.cupoTotal IS NOT NULL THEN greatest(o.cupoTotal - o.ocupados, 0) END
            AS cuposVacios,
          o.primerIntento, l.llenoEn,
          CASE WHEN l.llenoEn IS NOT NULL AND o.primerIntento IS NOT NULL
               THEN greatest(epoch(l.llenoEn) - epoch(o.primerIntento), 0) END
            AS tiempoHastaLlenarseS
        FROM ocup o LEFT JOIN lleno l USING (nrc)"""
    )


def _ocupacion_franja(con: Any) -> None:
    con.execute(
        """CREATE OR REPLACE TEMP TABLE ocupacion_franja AS
        SELECT getvariable('periodo') AS periodo, coalesce(franja, 'desconocida') AS franja,
          coalesce(sede, 'desconocida') AS sede,
          count(*) AS nrcs, coalesce(sum(cupoTotal), 0) AS cupoTotal,
          sum(ocupados) AS ocupados, coalesce(sum(cuposVacios), 0) AS cuposVacios,
          CASE WHEN sum(cupoTotal) > 0 THEN sum(ocupados)::DOUBLE / sum(cupoTotal) END
            AS ocupacion,
          count(*) FILTER (WHERE cuposVacios = 0) AS nrcLlenos,
          sum(intentos) AS intentos, sum(exitos) AS exitos, sum(sinCupo) AS sinCupo
        FROM demanda_nrc GROUP BY 2, 3"""
    )


def _combinaciones(con: Any, minimo: int) -> None:
    con.execute(
        """CREATE OR REPLACE TEMP TABLE est_attr AS
        SELECT estudianteHash, any_value(programa) AS programa,
          any_value(semestreEstudiante) AS semestre
        FROM s_intentos GROUP BY 1"""
    )
    con.execute(
        """CREATE OR REPLACE TEMP TABLE activas_attr AS
        SELECT a.estudianteHash, a.nrc, coalesce(e.programa, 'desconocido') AS programa,
          coalesce(e.semestre, 0) AS semestre, d.materiaId, d.materia
        FROM activas a LEFT JOIN est_attr e USING (estudianteHash)
        LEFT JOIN s_dim_nrc d USING (nrc)"""
    )
    con.execute(
        f"""CREATE OR REPLACE TEMP TABLE combinaciones_nrc AS
        WITH totales AS (
          SELECT programa, semestre, count(DISTINCT estudianteHash) AS total
          FROM activas_attr GROUP BY 1, 2),
        pares AS (
          SELECT a.programa, a.semestre, a.nrc AS nrcA, b.nrc AS nrcB,
            any_value(a.materiaId) AS materiaA, any_value(b.materiaId) AS materiaB,
            any_value(a.materia) AS tituloA, any_value(b.materia) AS tituloB,
            count(DISTINCT a.estudianteHash) AS estudiantes
          FROM activas_attr a JOIN activas_attr b
            ON a.estudianteHash = b.estudianteHash AND a.nrc < b.nrc
          GROUP BY 1, 2, 3, 4
          HAVING count(DISTINCT a.estudianteHash) >= {int(minimo)})
        SELECT getvariable('periodo') AS periodo, p.programa, p.semestre, p.nrcA, p.nrcB, p.materiaA,
          p.materiaB, p.tituloA, p.tituloB, p.estudiantes,
          p.estudiantes::DOUBLE / t.total AS soporte
        FROM pares p JOIN totales t USING (programa, semestre)"""
    )


def _auditoria(con: Any) -> None:
    con.execute(
        """CREATE OR REPLACE TEMP TABLE auditoria_intentos AS
        WITH todo AS (
          SELECT fecha, 'intento' AS tipo, resultado, latenciaMs FROM s_intentos
          UNION ALL SELECT fecha, 'confirmacion', resultado, latenciaMs FROM s_confirmaciones
          UNION ALL SELECT fecha, 'cancelacion', resultado, latenciaMs FROM s_cancelaciones
          UNION ALL SELECT fecha, 'busqueda', resultado, latenciaMs FROM s_busquedas)
        SELECT fecha, tipo, resultado, count(*) AS n,
          quantile_cont(latenciaMs, 0.5) AS latenciaP50Ms,
          quantile_cont(latenciaMs, 0.95) AS latenciaP95Ms,
          max(latenciaMs) AS latenciaMaxMs
        FROM todo
        GROUP BY GROUPING SETS ((tipo, resultado), (fecha, tipo, resultado))"""
    )


def _insatisfecha(con: Any) -> None:
    con.execute(
        """CREATE OR REPLACE TEMP TABLE demanda_insatisfecha AS
        SELECT getvariable('periodo') AS periodo, materiaId, any_value(materia) AS materia,
          any_value(semestreMateria) AS semestreMateria, any_value(area) AS area,
          count(*) FILTER (WHERE resultado = 'sin_cupo') AS sinCupo,
          count(DISTINCT estudianteHash) FILTER (WHERE resultado = 'sin_cupo')
            AS estudiantesAfectados,
          count(DISTINCT nrc) FILTER (WHERE resultado = 'sin_cupo') AS nrcAfectados,
          count(*) AS intentos,
          count(*) FILTER (WHERE resultado = 'sin_cupo')::DOUBLE / count(*) AS tasaSinCupo
        FROM s_intentos
        GROUP BY materiaId
        HAVING count(*) FILTER (WHERE resultado = 'sin_cupo') > 0
        ORDER BY sinCupo DESC, materiaId"""
    )


def ejecutar(con: Any, s: Settings) -> dict[str, int]:
    """Calcula y escribe las tablas de oro. Devuelve las filas de cada una."""
    con.execute("SET VARIABLE periodo = ?", [s.periodo])
    _vistas(con, s)
    _movimientos(con)
    _demanda_nrc(con)
    _ocupacion_franja(con)
    _combinaciones(con, s.combos_min_estudiantes)
    _auditoria(con)
    _insatisfecha(con)
    filas: dict[str, int] = {}
    for nombre in TABLAS_ORO:
        destino = f"{s.ruta_oro(nombre)}.parquet"
        con.execute(
            f"COPY (SELECT * FROM {nombre}) TO '{destino}' (FORMAT parquet, COMPRESSION zstd)"
        )
        filas[nombre] = con.execute(f"SELECT count(*) FROM read_parquet('{destino}')").fetchone()[0]
    return filas
