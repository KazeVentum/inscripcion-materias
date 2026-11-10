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


class ErrorOut(BaseModel):
    codigo: str
    mensaje: str
    alternativa: NrcOut | None = None


class TicketOut(BaseModel):
    ticket: str
    expiraEnS: int
