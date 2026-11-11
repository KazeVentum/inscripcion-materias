import { duracion, latencia, numero, porcentaje } from "./formatos";
import type {
  AuditoriaFila,
  DemandaInsatisfechaItem,
  OcupacionFranjaItem,
  OrdenDemanda,
  ResumenOut,
  TipoEvento,
} from "./tipos";

/** Meta del informe: oferta e intento responden en menos de 1 s. */
export const META_LATENCIA_MS = 1000;
/** Ocupación desde la cual una celda del mapa se marca como crítica. */
export const UMBRAL_OCUPACION_ALTA = 0.85;

// ------------------------------------------------------------------------------- KPIs

export type TonoKpi = "neutro" | "critico" | "bueno" | "malo";

export interface Kpi {
  id: "intentos" | "exito" | "sin_cupo" | "ocupacion" | "latencia" | "llenos";
  etiqueta: string;
  valor: string;
  detalle: string;
  tono: TonoKpi;
}

/** Los seis KPIs de la fila superior, ya formateados. */
export function kpisDe(r: ResumenOut): Kpi[] {
  const cumpleMeta =
    r.latenciaIntentoP95Ms === null ? null : r.latenciaIntentoP95Ms < META_LATENCIA_MS;
  return [
    {
      id: "intentos",
      etiqueta: "Intentos",
      valor: numero(r.intentos),
      detalle: `${numero(r.estudiantesUnicos)} estudiantes`,
      tono: "neutro",
    },
    {
      id: "exito",
      etiqueta: "Tasa de éxito",
      valor: porcentaje(r.tasaExito),
      detalle: `${numero(r.exitos)} inscripciones`,
      tono: "neutro",
    },
    {
      id: "sin_cupo",
      etiqueta: "Sin cupo",
      valor: numero(r.sinCupo),
      detalle: "demanda no atendida",
      tono: r.sinCupo > 0 ? "critico" : "neutro",
    },
    {
      id: "ocupacion",
      etiqueta: "Ocupación global",
      valor: porcentaje(r.ocupacionGlobal),
      detalle: `${numero(r.nrcTotales)} NRC`,
      tono: "neutro",
    },
    {
      id: "latencia",
      etiqueta: "Latencia p95 del intento",
      valor: latencia(r.latenciaIntentoP95Ms),
      detalle:
        cumpleMeta === null
          ? "sin intentos"
          : cumpleMeta
            ? "cumple meta < 1 s"
            : "supera meta < 1 s",
      tono: cumpleMeta === null ? "neutro" : cumpleMeta ? "bueno" : "malo",
    },
    {
      id: "llenos",
      etiqueta: "NRC llenos",
      valor: numero(r.nrcLlenos),
      detalle: `de ${numero(r.nrcTotales)} NRC`,
      tono: "neutro",
    },
  ];
}

// -------------------------------------------------------------------- escala de datos

/** Paso 1..5 de la escala secuencial para una ocupación 0..1 (umbrales fijos). */
export function pasoEscala(valor: number | null): 1 | 2 | 3 | 4 | 5 {
  if (valor === null || valor < 0.2) return 1;
  if (valor < 0.4) return 2;
  if (valor < 0.6) return 3;
  if (valor < 0.8) return 4;
  return 5;
}

// -------------------------------------------------------------- demanda insatisfecha

export interface BarraDemanda {
  materiaId: string;
  etiqueta: string;
  valor: number;
  /** 0..1 respecto al máximo de la lista. */
  proporcion: number;
  /** Las primeras barras son donde abrir más grupos. */
  critica: boolean;
  detalle: string;
  textoAccesible: string;
}

/** Barras ordenadas (más sin cupo primero); las `criticas` primeras se resaltan. */
export function barrasDemanda(
  items: readonly DemandaInsatisfechaItem[],
  criticas = 3,
): BarraDemanda[] {
  const orden = [...items].sort(
    (a, b) => b.sinCupo - a.sinCupo || a.materiaId.localeCompare(b.materiaId),
  );
  const max = Math.max(1, ...orden.map((i) => i.sinCupo));
  return orden.map((i, idx) => {
    const etiqueta = i.materia ?? i.materiaId;
    const detalle = `${numero(i.estudiantesAfectados)} estudiantes · ${numero(i.nrcAfectados)} NRC · ${porcentaje(i.tasaSinCupo)} de ${numero(i.intentos)} intentos`;
    return {
      materiaId: i.materiaId,
      etiqueta,
      valor: i.sinCupo,
      proporcion: i.sinCupo / max,
      critica: idx < criticas && i.sinCupo > 0,
      detalle,
      textoAccesible: `${etiqueta}: ${numero(i.sinCupo)} intentos sin cupo. ${detalle}`,
    };
  });
}

// ---------------------------------------------------------------- franja × sede

const ORDEN_FRANJA: Record<string, number> = { mañana: 0, tarde: 1, noche: 2, desconocida: 3 };

export interface MatrizOcupacion {
  franjas: string[];
  sedes: string[];
  celda: (franja: string, sede: string) => OcupacionFranjaItem | undefined;
}

export function matrizOcupacion(items: readonly OcupacionFranjaItem[]): MatrizOcupacion {
  const franjas = [...new Set(items.map((i) => i.franja as string))].sort(
    (a, b) => (ORDEN_FRANJA[a] ?? 9) - (ORDEN_FRANJA[b] ?? 9),
  );
  const sedes = [...new Set(items.map((i) => i.sede))].sort((a, b) => a.localeCompare(b, "es"));
  const mapa = new Map<string, OcupacionFranjaItem>(items.map((i) => [`${i.franja}|${i.sede}`, i]));
  return { franjas, sedes, celda: (f, s) => mapa.get(`${f}|${s}`) };
}

export function etiquetaFranja(f: string): string {
  return f === "desconocida" ? "Sin franja" : f.charAt(0).toUpperCase() + f.slice(1);
}

// ------------------------------------------------------------------- demanda por NRC

export const ORDENES: { valor: OrdenDemanda; etiqueta: string }[] = [
  { valor: "demanda", etiqueta: "Más intentos" },
  { valor: "sin_cupo", etiqueta: "Más sin cupo" },
  { valor: "ocupacion", etiqueta: "Mayor ocupación" },
  { valor: "vacios", etiqueta: "Más cupos vacíos" },
  { valor: "tiempo_llenado", etiqueta: "Se llenó más rápido" },
];

export function etiquetaOrden(o: OrdenDemanda): string {
  return ORDENES.find((x) => x.valor === o)?.etiqueta ?? o;
}

/** aria-sort de una columna según el orden activo (todos descendentes salvo el tiempo). */
export function ariaSort(
  columna: OrdenDemanda,
  activo: OrdenDemanda,
): "ascending" | "descending" | "none" {
  if (columna !== activo) return "none";
  return columna === "tiempo_llenado" ? "ascending" : "descending";
}

export function textoTiempoLlenado(s: number | null): string {
  return s === null ? "No se llenó" : duracion(s);
}

// ------------------------------------------------------------------------ auditoría

const TIPOS: Record<TipoEvento, string> = {
  intento: "Intentos de inscripción",
  confirmacion: "Confirmaciones del sistema académico",
  cancelacion: "Cancelaciones",
  busqueda: "Búsquedas de oferta",
};
const ORDEN_TIPO: TipoEvento[] = ["intento", "confirmacion", "cancelacion", "busqueda"];

const RESULTADOS: Record<string, string> = {
  exito: "Éxito",
  sin_cupo: "Sin cupo",
  cruce: "Cruce de horario",
  prerrequisito: "Prerrequisito",
  ya_inscrita: "Ya inscrita",
  materia_aprobada: "Materia aprobada",
  rechazada: "Rechazada",
  error: "Error",
  fuera_de_jornada: "Fuera de jornada",
};

export const etiquetaTipo = (t: TipoEvento): string => TIPOS[t];
export const etiquetaResultado = (r: string): string => RESULTADOS[r] ?? r;

export interface GrupoAuditoria {
  tipo: TipoEvento;
  etiqueta: string;
  total: number;
  filas: AuditoriaFila[];
}

/** Agrupa por tipo (orden fijo) con el total de eventos; filas por n descendente. */
export function agruparAuditoria(filas: readonly AuditoriaFila[]): GrupoAuditoria[] {
  return ORDEN_TIPO.flatMap((tipo) => {
    const propias = filas.filter((f) => f.tipo === tipo).sort((a, b) => b.n - a.n);
    if (propias.length === 0) return [];
    return [
      {
        tipo,
        etiqueta: TIPOS[tipo],
        total: propias.reduce((s, f) => s + f.n, 0),
        filas: propias,
      },
    ];
  });
}
