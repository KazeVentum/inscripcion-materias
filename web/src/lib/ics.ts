import type { Dia, HorarioItemOut } from "./tipos";

/**
 * Exporta el horario como iCalendar (.ics, RFC 5545) en America/Bogota.
 *
 * El sistema no entrega fechas de periodo: se asume que 2027-1 corre 16 semanas desde el
 * lunes 25 de enero de 2027 (constantes abajo, y parámetros de `generarIcs`). Cada bloque
 * semanal es un evento con RRULE semanal. Colombia no tiene horario de verano, así que el
 * VTIMEZONE es un único tramo fijo UTC-5.
 */
export const INICIO_PERIODO_DEFECTO = "2027-01-25"; // lunes
export const SEMANAS_DEFECTO = 16;

const OFFSET_DIA: Record<Dia, number> = { LUN: 0, MAR: 1, MIE: 2, JUE: 3, VIE: 4, SAB: 5 };
const BYDAY: Record<Dia, string> = {
  LUN: "MO",
  MAR: "TU",
  MIE: "WE",
  JUE: "TH",
  VIE: "FR",
  SAB: "SA",
};

export interface OpcionesIcs {
  periodo: string;
  /** Lunes de la primera semana, "AAAA-MM-DD". */
  inicio?: string;
  semanas?: number;
  /** Marca de generación (DTSTAMP); fija en pruebas. */
  ahora?: Date;
}

export function escaparTexto(t: string): string {
  return t.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Pliega a 75 octetos UTF-8 por línea (RFC 5545 §3.1) sin partir caracteres. */
export function plegar(linea: string): string {
  const enc = new TextEncoder();
  if (enc.encode(linea).length <= 75) return linea;
  const partes: string[] = [];
  let actual = "";
  let bytes = 0;
  let limite = 75;
  for (const ch of linea) {
    const n = enc.encode(ch).length;
    if (bytes + n > limite) {
      partes.push(actual);
      actual = "";
      bytes = 0;
      limite = 74; // la continuación empieza con un espacio
    }
    actual += ch;
    bytes += n;
  }
  partes.push(actual);
  return partes.join("\r\n ");
}

const dos = (n: number) => String(n).padStart(2, "0");

function fechaLocal(inicio: string, desplazarDias: number, hm: string): string {
  const [a = 0, m = 1, d = 1] = inicio.split("-").map(Number);
  const f = new Date(Date.UTC(a, m - 1, d + desplazarDias));
  const [h = "0", min = "0"] = hm.split(":");
  return `${f.getUTCFullYear()}${dos(f.getUTCMonth() + 1)}${dos(f.getUTCDate())}T${dos(Number(h))}${dos(Number(min))}00`;
}

function marcaUtc(d: Date): string {
  return `${d.getUTCFullYear()}${dos(d.getUTCMonth() + 1)}${dos(d.getUTCDate())}T${dos(d.getUTCHours())}${dos(d.getUTCMinutes())}${dos(d.getUTCSeconds())}Z`;
}

export function generarIcs(items: readonly HorarioItemOut[], op: OpcionesIcs): string {
  const inicio = op.inicio ?? INICIO_PERIODO_DEFECTO;
  const semanas = op.semanas ?? SEMANAS_DEFECTO;
  const sello = marcaUtc(op.ahora ?? new Date());

  const l: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//UNIMINUTO//Inscripcion de asignaturas (simulacion)//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escaparTexto(`Horario ${op.periodo}`)}`,
    "X-WR-TIMEZONE:America/Bogota",
    "BEGIN:VTIMEZONE",
    "TZID:America/Bogota",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:-0500",
    "TZOFFSETTO:-0500",
    "TZNAME:COT",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];

  for (const it of items) {
    it.bloques.forEach((b, i) => {
      const lugar = [it.sede, b.edificio, b.salon].filter(Boolean).join(", ");
      const desc = `NRC ${it.nrc}. Docente: ${it.docente}. ${it.creditos} créditos.`;
      l.push(
        "BEGIN:VEVENT",
        `UID:${op.periodo}-${it.nrc}-${b.dia}-${i}@inscripcion.uniminuto.local`,
        `DTSTAMP:${sello}`,
        `DTSTART;TZID=America/Bogota:${fechaLocal(inicio, OFFSET_DIA[b.dia], b.inicio)}`,
        `DTEND;TZID=America/Bogota:${fechaLocal(inicio, OFFSET_DIA[b.dia], b.fin)}`,
        `RRULE:FREQ=WEEKLY;COUNT=${semanas};BYDAY=${BYDAY[b.dia]}`,
        `SUMMARY:${escaparTexto(`${it.titulo} (NRC ${it.nrc})`)}`,
        ...(lugar ? [`LOCATION:${escaparTexto(lugar)}`] : []),
        `DESCRIPTION:${escaparTexto(desc)}`,
        "END:VEVENT",
      );
    });
  }
  l.push("END:VCALENDAR");
  return l.map(plegar).join("\r\n") + "\r\n";
}

/** Descarga el texto como archivo (solo navegador). */
export function descargarIcs(contenido: string, nombre: string): void {
  const url = URL.createObjectURL(new Blob([contenido], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
