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
    estudianteId: str = Field(description="Id del usuario (est-000123 o coord-0001)")
    rol: Literal["estudiante", "coordinador"] = "estudiante"


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


# ------------------------------------------------------------- coordinacion (HU5)


class CoordinadorOut(BaseModel):
    usuarioId: str
    nombre: str
    rol: Literal["coordinador"] = "coordinador"


class CheckValidacionOut(BaseModel):
    nombre: str
    ok: bool
    esperado: int
    obtenido: int


class ValidacionOut(BaseModel):
    """Cuadratura bronce -> plata -> oro de la ultima corrida del lake."""

    cuadra: bool
    lineasBronce: int
    eventosPlata: int
    duplicados: int
    invalidos: int
    checks: list[CheckValidacionOut]


class ResumenOut(BaseModel):
    generadoEn: str | None = Field(
        description="ISO-8601 UTC del ultimo calculo; null si no hay oro"
    )
    periodo: str | None = None
    eventos: int = 0
    intentos: int = 0
    exitos: int = 0
    sinCupo: int = 0
    tasaExito: float | None = None
    estudiantesUnicos: int = 0
    nrcTotales: int = 0
    nrcLlenos: int = 0
    ocupacionGlobal: float | None = None
    latenciaIntentoP50Ms: float | None = None
    latenciaIntentoP95Ms: float | None = None
    validacion: ValidacionOut | None = None


class DemandaNrcItem(BaseModel):
    nrc: str
    materiaId: str | None = None
    materia: str | None = None
    semestreMateria: int | None = None
    area: str | None = None
    sede: str | None = None
    modalidad: str | None = None
    franja: str | None = None
    cupoTotal: int | None = None
    intentos: int
    exitos: int
    sinCupo: int
    otros: int = Field(description="Intentos con otro resultado (cruce, prerrequisito...)")
    estudiantes: int = Field(description="Estudiantes distintos que lo intentaron")
    tasaExito: float | None = None
    ocupados: int
    ocupacion: float | None = Field(description="ocupados / cupoTotal (0 a 1)")
    cuposVacios: int | None = None
    primerIntento: str | None = None
    llenoEn: str | None = Field(description="Momento en que alcanzo el cupo total, si lo alcanzo")
    tiempoHastaLlenarseS: float | None = Field(
        description="Segundos desde el primer intento hasta llenarse"
    )


class DemandaNrcOut(BaseModel):
    generadoEn: str | None
    total: int = Field(description="NRC en la tabla antes de aplicar `limite`")
    items: list[DemandaNrcItem]


class OcupacionFranjaItem(BaseModel):
    franja: str
    sede: str
    nrcs: int
    cupoTotal: int
    ocupados: int
    cuposVacios: int
    ocupacion: float | None = None
    nrcLlenos: int
    intentos: int
    exitos: int
    sinCupo: int


class OcupacionFranjaOut(BaseModel):
    generadoEn: str | None
    items: list[OcupacionFranjaItem]


class CombinacionItem(BaseModel):
    programa: str
    semestre: int
    nrcA: str
    nrcB: str
    materiaA: str | None = None
    materiaB: str | None = None
    tituloA: str | None = None
    tituloB: str | None = None
    estudiantes: int = Field(description="Estudiantes que tienen ambos NRC inscritos")
    soporte: float = Field(description="estudiantes / estudiantes con inscripcion en su semestre")


class CombinacionesOut(BaseModel):
    generadoEn: str | None
    total: int
    items: list[CombinacionItem]


class AuditoriaFila(BaseModel):
    fecha: str | None = Field(description="YYYY-MM-DD; null en las filas de total")
    tipo: Literal["intento", "confirmacion", "cancelacion", "busqueda"]
    resultado: str
    n: int
    latenciaP50Ms: float | None = None
    latenciaP95Ms: float | None = None
    latenciaMaxMs: int | None = None


class AuditoriaOut(BaseModel):
    generadoEn: str | None
    total: list[AuditoriaFila] = Field(description="Por tipo y resultado, todo el periodo")
    porDia: list[AuditoriaFila] = Field(description="Por dia, tipo y resultado")


class DemandaInsatisfechaItem(BaseModel):
    materiaId: str
    materia: str | None = None
    semestreMateria: int | None = None
    area: str | None = None
    sinCupo: int
    estudiantesAfectados: int
    nrcAfectados: int
    intentos: int
    tasaSinCupo: float


class DemandaInsatisfechaOut(BaseModel):
    generadoEn: str | None
    items: list[DemandaInsatisfechaItem]
