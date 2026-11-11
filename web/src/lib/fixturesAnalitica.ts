/** Datos de ejemplo de la analítica, con la forma exacta de la API (todo sintético). */
import type {
  AuditoriaFila,
  CombinacionItem,
  DemandaInsatisfechaItem,
  DemandaNrcItem,
  OcupacionFranjaItem,
  ResumenOut,
  ValidacionOut,
} from "./tipos";

export const validacionOk: ValidacionOut = {
  cuadra: true,
  lineasBronce: 5616,
  eventosPlata: 5616,
  duplicados: 0,
  invalidos: 0,
  checks: [
    { nombre: "bronce = plata + duplicados + invalidos", ok: true, esperado: 5616, obtenido: 5616 },
    {
      nombre: "oro demanda_nrc: intentos = plata.intentos",
      ok: true,
      esperado: 1454,
      obtenido: 1454,
    },
    { nombre: "oro demanda_nrc: sin_cupo = plata sin_cupo", ok: true, esperado: 33, obtenido: 33 },
    { nombre: "sin datos personales en plata ni oro", ok: true, esperado: 0, obtenido: 0 },
  ],
};

export const validacionFalla: ValidacionOut = {
  ...validacionOk,
  cuadra: false,
  eventosPlata: 5610,
  checks: [
    {
      nombre: "bronce = plata + duplicados + invalidos",
      ok: false,
      esperado: 5616,
      obtenido: 5610,
    },
    ...validacionOk.checks.slice(1),
  ],
};

export const resumen: ResumenOut = {
  generadoEn: "2026-11-10T16:44:10Z",
  periodo: "2027-1",
  eventos: 5616,
  intentos: 1454,
  exitos: 1215,
  sinCupo: 33,
  tasaExito: 0.8356,
  estudiantesUnicos: 497,
  nrcTotales: 696,
  nrcLlenos: 189,
  ocupacionGlobal: 0.5048,
  latenciaIntentoP50Ms: 0,
  latenciaIntentoP95Ms: 1,
  validacion: validacionOk,
};

const ins = (
  materiaId: string,
  materia: string,
  sinCupo: number,
  intentos: number,
): DemandaInsatisfechaItem => ({
  materiaId,
  materia,
  semestreMateria: 5,
  area: "Datos",
  sinCupo,
  estudiantesAfectados: sinCupo,
  nrcAfectados: Math.max(1, sinCupo - 1),
  intentos,
  tasaSinCupo: sinCupo / intentos,
});

export const demandaInsatisfecha: DemandaInsatisfechaItem[] = [
  ins("ISUMBG183", "Electiva CP", 5, 40),
  ins("ISUMBG074", "Opción de Grado", 4, 26),
  ins("ISUMBG203", "Sistemas Transaccionales", 3, 32),
  ins("PRAC1010", "Práctica en Responsabilidad Social", 3, 39),
  ins("ADMI1060", "Emprendimiento", 2, 50),
];

const fr = (
  franja: OcupacionFranjaItem["franja"],
  sede: string,
  cupoTotal: number,
  ocupados: number,
): OcupacionFranjaItem => ({
  franja,
  sede,
  nrcs: Math.round(cupoTotal / 16),
  cupoTotal,
  ocupados,
  cuposVacios: cupoTotal - ocupados,
  ocupacion: ocupados / cupoTotal,
  nrcLlenos: Math.round(ocupados / 40),
  intentos: 10,
  exitos: 8,
  sinCupo: 1,
});

export const ocupacionFranja: OcupacionFranjaItem[] = [
  fr("mañana", "Calle 80", 283, 33),
  fr("mañana", "Perdomo", 81, 0),
  fr("tarde", "Calle 80", 3208, 39),
  fr("noche", "Calle 80", 4874, 4075),
  fr("noche", "Perdomo", 1325, 1107),
  fr("noche", "San Camilo", 567, 494),
];

const nrc = (
  n: string,
  materia: string,
  cupoTotal: number,
  ocupados: number,
  sinCupo: number,
  tiempo: number | null,
): DemandaNrcItem => ({
  nrc: n,
  materiaId: "M-" + n,
  materia,
  semestreMateria: 5,
  area: "Datos",
  sede: "Calle 80",
  modalidad: "presencial",
  franja: "noche",
  cupoTotal,
  intentos: ocupados + sinCupo,
  exitos: ocupados,
  sinCupo,
  otros: 0,
  estudiantes: ocupados + sinCupo,
  tasaExito: ocupados / (ocupados + sinCupo || 1),
  ocupados,
  ocupacion: ocupados / cupoTotal,
  cuposVacios: cupoTotal - ocupados,
  primerIntento: "2026-11-10T16:43:20Z",
  llenoEn: tiempo === null ? null : "2026-11-10T16:43:26Z",
  tiempoHastaLlenarseS: tiempo,
});

export const demandaNrc: DemandaNrcItem[] = [
  nrc("81819", "Electiva CPC", 30, 30, 1, 6.06),
  nrc("71679", "Programación Web", 29, 20, 0, null),
  nrc("73186", "Práctica Profesional", 11, 11, 0, 252),
  nrc("87695", "Sistemas Operativos", 45, 32, 0, null),
];

export const combinaciones: CombinacionItem[] = [
  {
    programa: "ISIS-2019",
    semestre: 9,
    nrcA: "42207",
    nrcB: "72774",
    materiaA: "ISUMBG153",
    materiaB: "ISUMBG064",
    tituloA: "Calidad y Gestión de Proyectos Informáticos",
    tituloB: "Práctica Profesional",
    estudiantes: 3,
    soporte: 0.0667,
  },
  {
    programa: "ISIS-2019",
    semestre: 4,
    nrcA: "71679",
    nrcB: "88099",
    materiaA: "ISUMBG043",
    materiaB: "INGL1030",
    tituloA: "Programación Web",
    tituloB: "Inglés III",
    estudiantes: 3,
    soporte: 0.0588,
  },
];

const aud = (
  tipo: AuditoriaFila["tipo"],
  resultado: string,
  n: number,
  p50: number,
  p95: number,
): AuditoriaFila => ({
  fecha: null,
  tipo,
  resultado,
  n,
  latenciaP50Ms: p50,
  latenciaP95Ms: p95,
  latenciaMaxMs: p95 * 2,
});

export const auditoria: AuditoriaFila[] = [
  aud("intento", "exito", 1215, 0, 1),
  aud("intento", "cruce", 67, 0, 0),
  aud("intento", "sin_cupo", 33, 0, 1),
  aud("confirmacion", "exito", 1106, 130, 196),
  aud("cancelacion", "exito", 109, 1, 6.6),
  aud("busqueda", "exito", 2947, 0, 1),
];
