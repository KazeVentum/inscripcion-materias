/**
 * Datos de ejemplo con la forma exacta de la API. Todo es sintético: nombres de docentes
 * y estudiantes inventados, NRC con el formato y la distribución de data/reference/.
 * Escenario: estudiante de 3.er semestre con Estructuras de Datos inscrita, Inglés II
 * reservado y Sistemas Operativos 80852 en vista previa (maqueta aprobada del brief).
 */
import type {
  BloqueCalendarioDatos,
  ErrorOut,
  HorarioOut,
  MateriaHabilitadaOut,
  NrcOut,
  PerfilOut,
  ReservaOut,
} from "./tipos";
import { bloquesDe } from "./horario";

/** Instante fijo para que stories y capturas sean deterministas. */
export const AHORA = Date.parse("2026-11-09T21:04:00.000Z");
const enSegundos = (s: number) => new Date(AHORA + s * 1000).toISOString();

export const perfil: PerfilOut = {
  estudianteId: "est-000123",
  nombre: "Valentina Ospina Cárdenas",
  programa: "Ingeniería de Sistemas",
  sede: "Calle 80",
  semestre: 3,
  jornada: "noche",
  creditosAprobados: 32,
};

export const materias: MateriaHabilitadaOut[] = [
  {
    materiaId: "ISUMBG103",
    nombre: "Sistemas Operativos",
    creditos: 3,
    semestre: 3,
    area: "Organizaciones y TI",
    estado: "pendiente",
    nrcDisponibles: 3,
  },
  {
    materiaId: "MATE1051",
    nombre: "Cálculo Integral",
    creditos: 3,
    semestre: 3,
    area: "Ciencias básicas comunes",
    estado: "pendiente",
    nrcDisponibles: 4,
  },
  {
    materiaId: "FISI1010",
    nombre: "Física Mecánica",
    creditos: 3,
    semestre: 3,
    area: "Ciencias básicas comunes",
    estado: "pendiente",
    nrcDisponibles: 0,
  },
  {
    materiaId: "INGL1020",
    nombre: "Inglés II",
    creditos: 3,
    semestre: 3,
    area: "General",
    estado: "inscrita",
    nrcDisponibles: 0,
  },
  {
    materiaId: "ISUMBG033",
    nombre: "Estructuras de Datos",
    creditos: 3,
    semestre: 3,
    area: "Ingeniería de software",
    estado: "inscrita",
    nrcDisponibles: 0,
  },
];

export const nrc80852: NrcOut = {
  nrc: "80852",
  materiaId: "ISUMBG103",
  titulo: "Sistemas Operativos",
  creditos: 3,
  sede: "Calle 80",
  modalidad: "presencial",
  docente: "Ricardo Peña Solano",
  franja: "noche",
  cupoTotal: 18,
  cuposLibres: 3,
  bloques: [
    { dia: "MAR", inicio: "18:15", fin: "19:44", edificio: "RGH", salon: "A406LS27" },
    { dia: "JUE", inicio: "18:15", fin: "19:44", edificio: "RGH", salon: "A406LS27" },
  ],
};

export const nrc86366Agotado: NrcOut = {
  nrc: "86366",
  materiaId: "ISUMBG103",
  titulo: "Sistemas Operativos",
  creditos: 3,
  sede: "Calle 80",
  modalidad: "presencial",
  docente: "Marcela Quintero Arias",
  franja: "mañana",
  cupoTotal: 20,
  cuposLibres: 0,
  bloques: [
    { dia: "LUN", inicio: "07:00", fin: "08:29", edificio: "RGH", salon: "B104LS08" },
    { dia: "MIE", inicio: "07:00", fin: "08:29", edificio: "RGH", salon: "B104LS08" },
  ],
};

export const nrc40930Alternativa: NrcOut = {
  nrc: "40930",
  materiaId: "ISUMBG103",
  titulo: "Sistemas Operativos",
  creditos: 3,
  sede: "Virtual",
  modalidad: "sincronica",
  docente: "Diana Carolina Ruiz",
  franja: "noche",
  cupoTotal: 20,
  cuposLibres: 6,
  bloques: [{ dia: "LUN", inicio: "20:30", fin: "21:59", edificio: null, salon: null }],
};

export const nrc81377: NrcOut = {
  nrc: "81377",
  materiaId: "ISUMBG103",
  titulo: "Sistemas Operativos",
  creditos: 3,
  sede: "Calle 80",
  modalidad: "presencial",
  docente: "Andrés Felipe Mora",
  franja: "noche",
  cupoTotal: 15,
  cuposLibres: 1,
  bloques: [{ dia: "VIE", inicio: "20:30", fin: "21:59", edificio: "RGH", salon: "B201LS12" }],
};

export const nrcVirtual: NrcOut = {
  nrc: "62014",
  materiaId: "MATE1051",
  titulo: "Cálculo Integral",
  creditos: 3,
  sede: "Virtual",
  modalidad: "virtual",
  docente: "Jorge Iván Salcedo",
  franja: "noche",
  cupoTotal: 35,
  cuposLibres: 21,
  bloques: [],
};

export const nrcHolgado: NrcOut = {
  nrc: "71530",
  materiaId: "MATE1051",
  titulo: "Cálculo Integral",
  creditos: 3,
  sede: "Calle 80",
  modalidad: "presencial",
  docente: "Paula Andrea Gómez",
  franja: "tarde",
  cupoTotal: 18,
  cuposLibres: 12,
  bloques: [
    { dia: "MAR", inicio: "14:00", fin: "15:29", edificio: "MPD", salon: "C302LS19" },
    { dia: "VIE", inicio: "14:00", fin: "15:29", edificio: "MPD", salon: "C302LS19" },
  ],
};

export const nrcPorMateria: Record<string, NrcOut[]> = {
  ISUMBG103: [nrc80852, nrc86366Agotado, nrc81377],
  MATE1051: [nrcHolgado, nrcVirtual],
};

const nrc81204: NrcOut = {
  nrc: "81204",
  materiaId: "ISUMBG033",
  titulo: "Estructuras de Datos",
  creditos: 3,
  sede: "Calle 80",
  modalidad: "presencial",
  docente: "Hernán Darío Castaño",
  franja: "noche",
  cupoTotal: 18,
  cuposLibres: 4,
  bloques: [
    { dia: "LUN", inicio: "18:15", fin: "19:44", edificio: "RGH", salon: "A402LS25" },
    { dia: "MIE", inicio: "18:15", fin: "19:44", edificio: "RGH", salon: "A402LS25" },
  ],
};

const nrc55120: NrcOut = {
  nrc: "55120",
  materiaId: "INGL1020",
  titulo: "Inglés II",
  creditos: 3,
  sede: "Calle 80",
  modalidad: "presencial",
  docente: "Catalina Restrepo Vélez",
  franja: "mañana",
  cupoTotal: 25,
  cuposLibres: 9,
  bloques: [{ dia: "SAB", inicio: "08:30", fin: "09:59", edificio: "MPD", salon: "D105LS03" }],
};

/** Vence en 4:32 respecto a AHORA. */
export const VENCIMIENTO_RESERVA = enSegundos(272);

export const horario: HorarioOut = {
  periodo: "2027-1",
  creditosTotales: 6,
  inscripciones: [
    { ...nrc81204, estado: "confirmada", vencimiento: null },
    { ...nrc55120, estado: "reservada", vencimiento: VENCIMIENTO_RESERVA },
  ],
};

export const reserva: ReservaOut = {
  estado: "reservada",
  nrc: "80852",
  materiaId: "ISUMBG103",
  cuposLibres: 2,
  vencimiento: enSegundos(300),
};

export const errorSinCupo: ErrorOut = {
  codigo: "sin_cupo",
  mensaje: "El NRC 86366 no tiene cupos",
  alternativa: nrc40930Alternativa,
};

export const errorCruce: ErrorOut = {
  codigo: "cruce",
  mensaje: "Se cruza con 81204",
  alternativa: null,
};

/** Bloques de la semana del escenario: inscrito + reservado + vista previa de 80852. */
export const bloquesSemana: BloqueCalendarioDatos[] = [
  ...bloquesDe(nrc81204, "inscrito"),
  ...bloquesDe(nrc55120, "reservado", { vencimiento: VENCIMIENTO_RESERVA }),
  ...bloquesDe(nrc80852, "vista-previa"),
];

/** Variante con un conflicto: el usuario prueba un NRC que cruza el lunes. */
export const bloquesConConflicto: BloqueCalendarioDatos[] = [
  ...bloquesDe(nrc81204, "inscrito"),
  ...bloquesDe(nrc55120, "reservado", { vencimiento: VENCIMIENTO_RESERVA }),
  {
    id: "90011-LUN-0",
    nrc: "90011",
    titulo: "Física Mecánica",
    dia: "LUN",
    inicio: "18:15",
    fin: "19:44",
    salon: "C201LS10",
    edificio: "MPD",
    estado: "conflicto",
    cruzaCon: "81204",
  },
];
