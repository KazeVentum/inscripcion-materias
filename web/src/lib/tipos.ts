/**
 * Tipos del dominio con los nombres exactos de la API (services/api/app/schemas.py).
 * Donde la API declara `str` pero CLAUDE.md fija un conjunto cerrado (día, modalidad,
 * franja), aquí se estrecha a la unión.
 */

export type Dia = "LUN" | "MAR" | "MIE" | "JUE" | "VIE" | "SAB";
export const DIAS: readonly Dia[] = ["LUN", "MAR", "MIE", "JUE", "VIE", "SAB"];

export type Modalidad = "presencial" | "virtual" | "sincronica";
export type Franja = "mañana" | "tarde" | "noche";
/** "HH:MM" en 24 h, hora de Bogotá. */
export type HoraHM = string;
/** ISO-8601 UTC. */
export type FechaIso = string;

// ------------------------------------------------------------------- auth

export interface LoginIn {
  usuario: string;
  password: string;
}

export interface LoginOut {
  accessToken: string;
  tokenType: "bearer";
  expiraEnS: number;
  estudianteId: string;
}

export interface PerfilOut {
  estudianteId: string;
  nombre: string;
  programa: string;
  sede: string;
  semestre: number;
  /** noche: bloques 18:00-22:00; tarde: 12:00-18:00; los virtuales se ven en cualquiera. */
  jornada: Jornada;
  creditosAprobados: number;
}

export type Jornada = "noche" | "tarde";

export type EstadoMateriaAvance =
  | "inscrita"
  | "habilitada"
  | "bloqueada_prerrequisito"
  | "sin_oferta";

export interface MateriaAvanceOut {
  materiaId: string;
  nombre: string;
  semestre: number;
  estado: EstadoMateriaAvance;
}

/** GET /avance: obligatorias del semestre actual sin aprobar. */
export interface AvanceOut {
  semestreActual: number;
  totalPendientes: number;
  inscritas: number;
  /** totalPendientes - inscritas */
  faltan: number;
  habilitadasSinInscribir: number;
  materias: MateriaAvanceOut[];
  /** Dato secundario: obligatorias de semestres anteriores sin aprobar (no cuentan arriba). */
  atrasadas: MateriaAvanceOut[];
  mensaje: string;
}

// ----------------------------------------------------------------- oferta

export interface MateriaHabilitadaOut {
  materiaId: string;
  nombre: string;
  creditos: number;
  semestre: number;
  area: string;
  estado: "pendiente" | "inscrita";
  nrcDisponibles: number;
}

export interface BloqueOut {
  dia: Dia;
  inicio: HoraHM;
  fin: HoraHM;
  edificio?: string | null;
  salon?: string | null;
}

export interface NrcOut {
  nrc: string;
  materiaId: string;
  titulo: string;
  creditos: number;
  sede: string;
  modalidad: Modalidad;
  docente: string;
  franja: Franja;
  cupoTotal: number;
  cuposLibres: number;
  bloques: BloqueOut[];
}

// ------------------------------------------------------------ inscripción

export interface InscripcionIn {
  nrc: string;
}

/** 202 de POST /inscripciones. */
export interface ReservaOut {
  estado: "reservada";
  nrc: string;
  materiaId: string;
  cuposLibres: number;
  vencimiento: FechaIso;
}

export type EstadoInscripcion = "reservada" | "confirmada" | "rechazada" | "cancelada";

export interface EstadoInscripcionOut {
  nrc: string;
  materiaId?: string | null;
  estado: EstadoInscripcion;
  motivo?: string | null;
  vencimiento?: FechaIso | null;
  actualizadaEn?: FechaIso | null;
}

export interface HorarioItemOut extends NrcOut {
  estado: "reservada" | "confirmada";
  vencimiento?: FechaIso | null;
}

export interface HorarioOut {
  periodo: string;
  creditosTotales: number;
  inscripciones: HorarioItemOut[];
}

export interface RecomendacionOut {
  fuente: string;
  creditosTotales: number;
  nrc: NrcOut[];
  materiasSinOferta: string[];
}

// ----------------------------------------------------------------- errores

export type CodigoError =
  | "sin_cupo"
  | "cruce"
  | "ya_inscrita"
  | "materia_aprobada"
  | "fuera_de_jornada"
  | "prerrequisito"
  | "nrc_inexistente"
  | "materia_inexistente"
  | "sin_inscripcion"
  | "credenciales_invalidas"
  | "no_autorizado"
  | "token_expirado"
  | "token_invalido"
  | "servicio_no_disponible"
  | "error_interno";

/** Cuerpo de error: `{ codigo, mensaje, alternativa }`. */
export interface ErrorOut {
  codigo: CodigoError;
  mensaje: string;
  alternativa?: NrcOut | null;
}

// ------------------------------------------------------------------ stream

export interface TicketOut {
  ticket: string;
  expiraEnS: number;
}

/** `event: cupo` de GET /stream/cupos (sale de los scripts Lua por Pub/Sub). */
export interface EventoCupo {
  nrc: string;
  libres: number;
}

// --------------------------------------------------------------- solo UI

/** Estado visual de un bloque en la semana. */
export type EstadoBloque = "inscrito" | "vista-previa" | "reservado" | "conflicto";

/** Un bloque listo para pintar en CalendarioSemanal. */
export interface BloqueCalendarioDatos {
  id: string;
  nrc: string;
  titulo: string;
  dia: Dia;
  inicio: HoraHM;
  fin: HoraHM;
  salon?: string | null;
  edificio?: string | null;
  estado: EstadoBloque;
  /** Reservado: vencimiento ISO para el contador. */
  vencimiento?: FechaIso | null;
  /** Conflicto: NRC con el que cruza. */
  cruzaCon?: string | null;
}
