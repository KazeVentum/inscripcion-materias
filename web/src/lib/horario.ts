import type {
  Jornada,
  BloqueCalendarioDatos,
  BloqueOut,
  Dia,
  Franja,
  HoraHM,
  NrcOut,
} from "./tipos";

export const HORA_INICIO = 7;
export const HORA_FIN = 22;

export function minutos(hm: HoraHM): number {
  const [h = "0", m = "0"] = hm.split(":");
  return Number(h) * 60 + Number(m);
}

/** Franja por hora de inicio: mañana < 12:00, tarde < 18:00, noche ≥ 18:00. */
export function franjaDe(inicio: HoraHM): Franja {
  const m = minutos(inicio);
  if (m < 12 * 60) return "mañana";
  if (m < 18 * 60) return "tarde";
  return "noche";
}

/** Cruce: mismo día y inicio_a < fin_b && inicio_b < fin_a. */
export function cruzan(a: BloqueOut, b: BloqueOut): boolean {
  return (
    a.dia === b.dia && minutos(a.inicio) < minutos(b.fin) && minutos(b.inicio) < minutos(a.fin)
  );
}

const CORTO: Record<Dia, string> = {
  LUN: "Lun",
  MAR: "Mar",
  MIE: "Mié",
  JUE: "Jue",
  VIE: "Vie",
  SAB: "Sáb",
};

const LARGO: Record<Dia, string> = {
  LUN: "lunes",
  MAR: "martes",
  MIE: "miércoles",
  JUE: "jueves",
  VIE: "viernes",
  SAB: "sábado",
};

export function diaLargo(d: Dia): string {
  return LARGO[d];
}

function unir(partes: string[]): string {
  if (partes.length <= 1) return partes.join("");
  return `${partes.slice(0, -1).join(", ")} y ${partes.at(-1) ?? ""}`;
}

/**
 * "Mar y Jue 18:15–19:44". Si los bloques tienen horas distintas, se agrupan:
 * "Lun 07:00–08:29, Mié 18:15–19:44".
 */
export function horarioLegible(bloques: readonly BloqueOut[]): string {
  if (bloques.length === 0) return "Virtual, sin horario fijo";
  const grupos = new Map<string, Dia[]>();
  for (const b of bloques) {
    const clave = `${b.inicio}–${b.fin}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), b.dia]);
  }
  return [...grupos.entries()]
    .map(([hora, dias]) => `${unir(dias.map((d) => CORTO[d]))} ${hora}`)
    .join(", ");
}

/** "RGH A406LS27" o "A406LS27 y A402LS25" si cambia de salón. */
export function salonesLegibles(bloques: readonly BloqueOut[]): string {
  const salones = [
    ...new Set(bloques.map((b) => [b.edificio, b.salon].filter(Boolean).join(" ")).filter(Boolean)),
  ];
  return unir(salones);
}

export const MODALIDAD: Record<NrcOut["modalidad"], string> = {
  presencial: "Presencial",
  virtual: "Virtual",
  sincronica: "Sincrónica",
};

/** Convierte un NRC en bloques de calendario con el estado indicado. */
export function bloquesDe(
  nrc: NrcOut,
  estado: BloqueCalendarioDatos["estado"],
  extra: Partial<Pick<BloqueCalendarioDatos, "vencimiento" | "cruzaCon">> = {},
): BloqueCalendarioDatos[] {
  return nrc.bloques.map((b, i) => ({
    id: `${nrc.nrc}-${b.dia}-${i}`,
    nrc: nrc.nrc,
    titulo: nrc.titulo,
    dia: b.dia,
    inicio: b.inicio,
    fin: b.fin,
    salon: b.salon ?? null,
    edificio: b.edificio ?? null,
    estado,
    ...extra,
  }));
}

/** Abreviatura para bloques estrechos: "Sistemas Operativos" → "Sist. Operativos". */
export function tituloCorto(titulo: string, max = 14): string {
  if (titulo.length <= max) return titulo;
  const palabras = titulo.split(" ").filter((p) => !["de", "y", "la", "el"].includes(p));
  const primera = palabras[0] ?? titulo;
  const resto = palabras.slice(1).join(" ");
  const abreviada = `${primera.slice(0, 4)}. ${resto}`.trim();
  return abreviada.length <= max + 2 ? abreviada : `${abreviada.slice(0, max)}…`;
}

/** Segundos restantes hasta un ISO (no negativo). */
export function segundosHasta(iso: string, ahora: number): number {
  return Math.max(0, Math.round((Date.parse(iso) - ahora) / 1000));
}

/** 272 → "4:32". */
export function mmss(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "18:00–22:00" (noche) o "12:00–18:00" (tarde). */
export function ventanaJornada(j: Jornada): string {
  return j === "noche" ? "18:00–22:00" : "12:00–18:00";
}

/** "Jornada noche · 18:00–22:00". */
export function textoJornada(j: Jornada): string {
  return `Jornada ${j} · ${ventanaJornada(j)}`;
}
