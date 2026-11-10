"""Recomendaciones de horario. La interfaz ``Recomendador`` permite, en la fase 6, sustituir la
heurística por una que use la capa oro (demanda/combinaciones) sin tocar la ruta."""

from __future__ import annotations

from typing import Protocol

from .contexto import Contexto
from .dominio import CandidataMateria, armar_horario, evaluar_habilitacion
from .schemas import NrcOut, RecomendacionOut
from .servicio import leer_ocupado_y_libres, nrc_a_dict


class Recomendador(Protocol):
    async def recomendar(self, ctx: Contexto, estudiante_id: str) -> RecomendacionOut: ...


class RecomendadorHeuristico:
    """Materias habilitadas de los semestres más bajos pendientes + greedy sin cruces."""

    fuente = "heuristica"

    async def recomendar(self, ctx: Contexto, estudiante_id: str) -> RecomendacionOut:
        cat = ctx.catalogo
        est = await cat.estudiante(ctx.db, estudiante_id)
        assert est is not None
        todos = [n for nrcs in cat.nrc_por_materia.values() for n in nrcs]
        ocupado, libres = await leer_ocupado_y_libres(ctx, estudiante_id, todos)

        inscritas = {e["materiaId"] for e in ocupado.values()}
        ya_creditos = sum(cat.nrc_info[n].creditos for n in ocupado if n in cat.nrc_info)
        presupuesto = max(0, ctx.settings.max_creditos_recomendacion - ya_creditos)

        candidatas: list[CandidataMateria] = []
        sin_oferta: list[str] = []
        for mid in cat.materias_pensum:
            if mid in inscritas:
                continue
            if not evaluar_habilitacion(
                mid, cat.prerrequisitos, cat.creditos_minimos, est.aprobadas, est.creditos_aprobados
            ).habilitada:
                continue
            materia = cat.materias[mid]
            opciones = [
                cat.nrc_info[n] for n in cat.nrc_por_materia.get(mid, []) if libres.get(n, 0) > 0
            ]
            if not opciones:
                sin_oferta.append(mid)
                continue
            candidatas.append(CandidataMateria(mid, materia.semestre, materia.creditos, opciones))

        elegidos = armar_horario(candidatas, ocupado, libres, presupuesto)
        salida = [NrcOut(**nrc_a_dict(ctx, n.nrc, libres[n.nrc])) for n in elegidos]
        return RecomendacionOut(
            fuente=self.fuente,
            creditosTotales=sum(n.creditos for n in salida),
            nrc=salida,
            materiasSinOferta=sorted(sin_oferta),
        )
