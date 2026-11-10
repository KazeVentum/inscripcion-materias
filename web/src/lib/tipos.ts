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
  /** Id del usuario: est-000123 o coord-0001. */
  estudianteId: string;
  /** Claim `rol` del JWT; el coordinador no puede llamar a los endpoints de estudiante (403). */
  rol: Rol;
}

export type Rol = "estudiante" | "coordinador";

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
  "inscrita" | "habilitada" | "bloqueada_prerrequisito" | "sin_oferta";

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

// ------------------------------------------------- coordinación (HU5, solo rol coordinador)
// GET /api/v1/coordinacion/...  Todas las respuestas traen `generadoEn` (ISO UTC del último
// cálculo del lake) o null si el oro aún no existe; en ese caso las listas vienen vacías.

/** GET /coordinacion/me */
export interface CoordinadorOut {
  usuarioId: string;
  nombre: string;
  rol: "coordinador";
}

export interface CheckValidacionOut {
  nombre: string;
  ok: boolean;
  esperado: number;
  obtenido: number;
}

/** Cuadratura bronce → plata → oro: líneas bronce = eventos plata + duplicados + inválidos. */
export interface ValidacionOut {
  cuadra: boolean;
  lineasBronce: number;
  eventosPlata: number;
  duplicados: number;
  invalidos: number;
  checks: CheckValidacionOut[];
}

/** GET /coordinacion/analitica/resumen */
export interface ResumenOut {
  generadoEn: FechaIso | null;
  periodo: string | null;
  eventos: number;
  intentos: number;
  exitos: number;
  sinCupo: number;
  /** 0 a 1; null si no hay intentos. */
  tasaExito: number | null;
  estudiantesUnicos: number;
  nrcTotales: number;
  nrcLlenos: number;
  /** ocupados / cupo total, 0 a 1. */
  ocupacionGlobal: number | null;
  latenciaIntentoP50Ms: number | null;
  latenciaIntentoP95Ms: number | null;
  validacion: ValidacionOut | null;
}

export type OrdenDemanda = "demanda" | "sin_cupo" | "ocupacion" | "vacios" | "tiempo_llenado";

export interface DemandaNrcItem {
  nrc: string;
  materiaId: string | null;
  materia: string | null;
  semestreMateria: number | null;
  area: string | null;
  sede: string | null;
  modalidad: string | null;
  franja: string | null;
  cupoTotal: number | null;
  intentos: number;
  exitos: number;
  sinCupo: number;
  /** Intentos con otro resultado (cruce, prerrequisito, fuera_de_jornada...). */
  otros: number;
  /** Estudiantes distintos que lo intentaron. */
  estudiantes: number;
  tasaExito: number | null;
  ocupados: number;
  /** 0 a 1; null si el NRC no está en el catálogo. */
  ocupacion: number | null;
  cuposVacios: number | null;
  primerIntento: FechaIso | null;
  /** Momento en que alcanzó el cupo total; null si nunca se llenó. */
  llenoEn: FechaIso | null;
  tiempoHastaLlenarseS: number | null;
}

/** GET /coordinacion/analitica/demanda-nrc?orden=&limite=&materiaId=&soloConIntentos= */
export interface DemandaNrcOut {
  generadoEn: FechaIso | null;
  /** NRC en la tabla antes de aplicar `limite`. */
  total: number;
  items: DemandaNrcItem[];
}

export interface OcupacionFranjaItem {
  franja: Franja | "desconocida";
  sede: string;
  nrcs: number;
  cupoTotal: number;
  ocupados: number;
  cuposVacios: number;
  ocupacion: number | null;
  nrcLlenos: number;
  intentos: number;
  exitos: number;
  sinCupo: number;
}

/** GET /coordinacion/analitica/ocupacion-franja */
export interface OcupacionFranjaOut {
  generadoEn: FechaIso | null;
  items: OcupacionFranjaItem[];
}

export interface CombinacionItem {
  programa: string;
  semestre: number;
  nrcA: string;
  nrcB: string;
  materiaA: string | null;
  materiaB: string | null;
  tituloA: string | null;
  tituloB: string | null;
  /** Estudiantes que tienen ambos NRC inscritos (mínimo 2). */
  estudiantes: number;
  /** estudiantes / estudiantes con inscripción en su programa y semestre, 0 a 1. */
  soporte: number;
}

/** GET /coordinacion/analitica/combinaciones?semestre=&limite= (más estudiantes primero) */
export interface CombinacionesOut {
  generadoEn: FechaIso | null;
  total: number;
  items: CombinacionItem[];
}

export type TipoEvento = "intento" | "confirmacion" | "cancelacion" | "busqueda";

export interface AuditoriaFila {
  /** YYYY-MM-DD; null en las filas de `total`. */
  fecha: string | null;
  tipo: TipoEvento;
  resultado: string;
  n: number;
  latenciaP50Ms: number | null;
  latenciaP95Ms: number | null;
  latenciaMaxMs: number | null;
}

/** GET /coordinacion/analitica/auditoria */
export interface AuditoriaOut {
  generadoEn: FechaIso | null;
  /** Por tipo y resultado, todo el periodo. */
  total: AuditoriaFila[];
  /** Por día, tipo y resultado. */
  porDia: AuditoriaFila[];
}

export interface DemandaInsatisfechaItem {
  materiaId: string;
  materia: string | null;
  semestreMateria: number | null;
  area: string | null;
  sinCupo: number;
  estudiantesAfectados: number;
  nrcAfectados: number;
  intentos: number;
  /** sinCupo / intentos, 0 a 1. */
  tasaSinCupo: number;
}

/** GET /coordinacion/analitica/demanda-insatisfecha?limite= (más sin cupo primero) */
export interface DemandaInsatisfechaOut {
  generadoEn: FechaIso | null;
  items: DemandaInsatisfechaItem[];
}
