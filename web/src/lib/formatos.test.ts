import { describe, expect, it } from "vitest";
import { duracion, fechaHoraBogota, hace, latencia, numero, porcentaje } from "./formatos";

const N = " ";

describe("formatos es-CO", () => {
  it("numero agrupa miles con punto y decimales con coma", () => {
    expect(numero(5616)).toBe("5.616");
    expect(numero(12)).toBe("12");
    expect(numero(1234567)).toBe("1.234.567");
    expect(numero(3.456, 1)).toBe("3,5");
  });
  it("porcentaje", () => {
    expect(porcentaje(0.8356)).toBe(`83,6${N}%`);
    expect(porcentaje(0.5)).toBe(`50${N}%`);
    expect(porcentaje(null)).toBe("—");
  });
  it("latencia en ms y s", () => {
    expect(latencia(1)).toBe(`1${N}ms`);
    expect(latencia(0.4)).toBe(`< 1${N}ms`);
    expect(latencia(6.6)).toBe(`6,6${N}ms`);
    expect(latencia(196)).toBe(`196${N}ms`);
    expect(latencia(1200)).toBe(`1,2${N}s`);
    expect(latencia(null)).toBe("—");
  });
  it("duracion", () => {
    expect(duracion(6.06)).toBe(`6${N}s`);
    expect(duracion(252)).toBe(`4${N}min 12${N}s`);
    expect(duracion(7300)).toBe(`2${N}h 1${N}min`);
    expect(duracion(null)).toBe("—");
  });
  it("hace", () => {
    const base = Date.parse("2026-11-10T16:44:10Z");
    expect(hace("2026-11-10T16:44:10Z", base + 10_000)).toBe("hace un momento");
    expect(hace("2026-11-10T16:44:10Z", base + 180_000)).toBe(`hace 3${N}min`);
    expect(hace("2026-11-10T16:44:10Z", base + 2 * 3600_000)).toBe(`hace 2${N}h`);
  });
  it("hora de Bogotá (UTC-5)", () => {
    expect(fechaHoraBogota("2026-11-10T16:44:10Z")).toBe(`10 nov, 11:44${N}a. m.`);
    expect(fechaHoraBogota("2026-11-11T02:05:00Z")).toBe(`10 nov, 9:05${N}p. m.`);
  });
});
