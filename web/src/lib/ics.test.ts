import { describe, expect, it } from "vitest";
import { escaparTexto, generarIcs, plegar } from "./ics";
import type { HorarioItemOut } from "./tipos";

const item: HorarioItemOut = {
  nrc: "64269",
  materiaId: "ISUMBG193",
  titulo: "Bases de Datos, avanzadas",
  creditos: 3,
  sede: "Calle 80",
  modalidad: "presencial",
  docente: "Docente Sintético",
  franja: "noche",
  cupoTotal: 35,
  cuposLibres: 5,
  estado: "confirmada",
  bloques: [
    { dia: "MAR", inicio: "20:30", fin: "21:59", edificio: "RGH", salon: "A406LS27" },
    { dia: "JUE", inicio: "20:30", fin: "21:59", edificio: "RGH", salon: "A402LS25" },
  ],
};

const AHORA = new Date("2026-11-10T15:00:00Z");

describe("generarIcs", () => {
  const ics = generarIcs([item], { periodo: "2027-1", ahora: AHORA });
  const lineas = ics.split("\r\n");

  it("es un calendario válido con CRLF y zona America/Bogota", () => {
    expect(lineas[0]).toBe("BEGIN:VCALENDAR");
    expect(lineas.at(-2)).toBe("END:VCALENDAR");
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics).toContain("BEGIN:VTIMEZONE\r\nTZID:America/Bogota");
    expect(ics).toContain("TZOFFSETTO:-0500");
  });

  it("un VEVENT por bloque, en su día de la primera semana, con repetición semanal", () => {
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    // 25-ene-2027 es lunes: martes 26, jueves 28.
    expect(ics).toContain("DTSTART;TZID=America/Bogota:20270126T203000");
    expect(ics).toContain("DTEND;TZID=America/Bogota:20270126T215900");
    expect(ics).toContain("DTSTART;TZID=America/Bogota:20270128T203000");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;COUNT=16;BYDAY=TU");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;COUNT=16;BYDAY=TH");
  });

  it("escapa comas y trae lugar, NRC y UID estable", () => {
    expect(ics).toContain("SUMMARY:Bases de Datos\\, avanzadas (NRC 64269)");
    expect(ics).toContain("LOCATION:Calle 80\\, RGH\\, A406LS27");
    expect(ics).toContain("UID:2027-1-64269-MAR-0@inscripcion.uniminuto.local");
    expect(ics).toContain("DTSTAMP:20261110T150000Z");
  });

  it("ninguna línea pasa de 75 octetos", () => {
    const largo = generarIcs([{ ...item, titulo: "Á".repeat(80) }], {
      periodo: "2027-1",
      ahora: AHORA,
    });
    for (const l of largo.split("\r\n"))
      expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
  });

  it("sin inscripciones genera solo el calendario", () => {
    expect(generarIcs([], { periodo: "2027-1", ahora: AHORA })).not.toContain("BEGIN:VEVENT");
  });

  it("respeta inicio y semanas", () => {
    const x = generarIcs([item], {
      periodo: "2027-1",
      inicio: "2027-02-01",
      semanas: 4,
      ahora: AHORA,
    });
    expect(x).toContain("20270202T203000");
    expect(x).toContain("COUNT=4");
  });
});

describe("utilidades", () => {
  it("escapa el punto y coma con barra invertida literal (RFC 5545)", () => {
    expect(escaparTexto("a;b")).toBe("a\\;b");
    expect(escaparTexto("a;b")).toHaveLength(4);
    const ics = generarIcs([{ ...item, titulo: "Cálculo; I" }], {
      periodo: "2027-1",
      ahora: AHORA,
    });
    expect(ics).toContain("SUMMARY:Cálculo\\; I (NRC 64269)");
  });
  it("escaparTexto", () => {
    expect(escaparTexto("a;b,c\\d\ne")).toBe("a\\;b\\,c\\\\d\\ne");
  });
  it("plegar no parte caracteres multibyte", () => {
    const p = plegar("X".repeat(74) + "ñ" + "Y".repeat(10));
    expect(p.split("\r\n ").join("")).toBe("X".repeat(74) + "ñ" + "Y".repeat(10));
  });
});
