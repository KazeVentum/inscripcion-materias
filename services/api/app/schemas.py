"""Modelos Pydantic de la API (entrada/salida)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class LoginIn(BaseModel):
    usuario: str = Field(
        min_length=1, max_length=120, description="estudianteId (est-000001) o correo sintético"
    )
    password: str = Field(min_length=1, max_length=128)


class LoginOut(BaseModel):
    accessToken: str
    tokenType: Literal["bearer"] = "bearer"
    expiraEnS: int
    estudianteId: str


class PerfilOut(BaseModel):
    estudianteId: str
    nombre: str
    programa: str
    sede: str
    semestre: int
    jornada: Literal["noche", "tarde"] = Field(
        description="noche: bloques 18:00-22:00; tarde: 12:00-18:00; virtuales en cualquiera"
    )
    creditosAprobados: int


class MateriaHabilitadaOut(BaseModel):
    materiaId: str
    nombre: str
    creditos: int
    semestre: int
    area: str
    estado: Literal["pendiente", "inscrita"]
    nrcDisponibles: int


class BloqueOut(BaseModel):
    dia: str
    inicio: str
    fin: str
    edificio: str | None = None
    salon: str | None = None


class NrcOut(BaseModel):
    nrc: str
    materiaId: str
    titulo: str
    creditos: int
    sede: str
    modalidad: str
    docente: str
    franja: str
    cupoTotal: int
    cuposLibres: int
    bloques: list[BloqueOut]


class InscripcionIn(BaseModel):
    nrc: str = Field(min_length=1, max_length=20)


class ReservaOut(BaseModel):
    estado: Literal["reservada"] = "reservada"
    nrc: str
    materiaId: str
    cuposLibres: int
    vencimiento: str = Field(description="ISO-8601 UTC en que vence la reserva")


class EstadoInscripcionOut(BaseModel):
    nrc: str
    materiaId: str | None = None
    estado: Literal["reservada", "confirmada", "rechazada", "cancelada"]
    motivo: str | None = None
    vencimiento: str | None = None
    actualizadaEn: str | None = None


class HorarioItemOut(NrcOut):
    estado: Literal["reservada", "confirmada"]
    vencimiento: str | None = None


class HorarioOut(BaseModel):
    periodo: str
    creditosTotales: int
    inscripciones: list[HorarioItemOut]


class RecomendacionOut(BaseModel):
    fuente: str
    creditosTotales: int
    nrc: list[NrcOut]
    materiasSinOferta: list[str]


class MateriaAvanceOut(BaseModel):
    materiaId: str
    nombre: str
    semestre: int
    estado: Literal["inscrita", "habilitada", "bloqueada_prerrequisito", "sin_oferta"]


class AvanceOut(BaseModel):
    """Obligatorias del semestre actual del estudiante que aún no aprobó."""

    semestreActual: int
    totalPendientes: int = Field(
        description="Obligatorias con semestre == semestreActual sin aprobar"
    )
    inscritas: int = Field(description="De esas, las confirmadas o reservadas este periodo")
    faltan: int = Field(description="totalPendientes - inscritas")
    habilitadasSinInscribir: int = Field(
        description="Las que puede inscribir ya, con oferta en su jornada"
    )
    materias: list[MateriaAvanceOut]
    atrasadas: list[MateriaAvanceOut] = Field(
        description="Dato secundario: obligatorias de semestres anteriores sin aprobar; "
        "no cuentan en totalPendientes, faltan ni mensaje"
    )
    mensaje: str


class ErrorOut(BaseModel):
    codigo: str
    mensaje: str
    alternativa: NrcOut | None = None


class TicketOut(BaseModel):
    ticket: str
    expiraEnS: int
