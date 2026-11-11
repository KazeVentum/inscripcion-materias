import { describe, expect, it } from "vitest";
import {
  agruparAuditoria,
  ariaSort,
  barrasDemanda,
  kpisDe,
  matrizOcupacion,
  pasoEscala,
} from "./analitica";
import type { AuditoriaFila, OcupacionFranjaItem, ResumenOut } from "./tipos";

const resumen: ResumenOut = {
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
  validacion: null,
};

describe("kpisDe", () => {
  it("devuelve seis KPIs formateados", () => {
    const k = kpisDe(resumen);
    expect(k.map((x) => x.id)).toEqual([
      "intentos",
      "exito",
      "sin_cupo",
      "ocupacion",
      "latencia",
      "llenos",
    ]);
    expect(k[0]?.valor).toBe("1.454");
    expect(k[2]?.tono).toBe("critico");
  });
  it("la latencia p95 se compara con la meta de 1 s", () => {
    expect(kpisDe(resumen)[4]).toMatchObject({ tono: "bueno", detalle: "cumple la meta de < 1 s" });
    const lenta = kpisDe({ ...resumen, latenciaIntentoP95Ms: 1500 })[4];
    expect(lenta).toMatchObject({ tono: "malo" });
    expect(kpisDe({ ...resumen, latenciaIntentoP95Ms: null })[4]?.tono).toBe("neutro");
  });
});

describe("pasoEscala", () => {
  it.each([
    [null, 1],
    [0, 1],
    [0.2, 2],
    [0.45, 3],
    [0.7, 4],
    [0.8, 5],
    [1, 5],
  ] as const)("%s -> %s", (v, p) => expect(pasoEscala(v)).toBe(p));
});

describe("barrasDemanda", () => {
  const item = (materiaId: string, sinCupo: number) => ({
    materiaId,
    materia: `Materia ${materiaId}`,
    semestreMateria: 1,
    area: null,
    sinCupo,
    estudiantesAfectados: sinCupo,
    nrcAfectados: 1,
    intentos: 10,
    tasaSinCupo: sinCupo / 10,
  });
  it("ordena de mayor a menor y resalta las primeras", () => {
    const b = barrasDemanda([item("B", 2), item("A", 5), item("C", 1), item("D", 3)], 2);
    expect(b.map((x) => x.materiaId)).toEqual(["A", "D", "B", "C"]);
    expect(b.map((x) => x.critica)).toEqual([true, true, false, false]);
    expect(b[0]?.proporcion).toBe(1);
    expect(b[3]?.proporcion).toBeCloseTo(0.2);
    expect(b[0]?.textoAccesible).toContain("5 intentos sin cupo");
  });
  it("lista vacía y valores en cero no rompen", () => {
    expect(barrasDemanda([])).toEqual([]);
    expect(barrasDemanda([item("A", 0)])[0]).toMatchObject({ critica: false, proporcion: 0 });
  });
});

describe("matrizOcupacion", () => {
  const f = (franja: OcupacionFranjaItem["franja"], sede: string): OcupacionFranjaItem => ({
    franja,
    sede,
    nrcs: 1,
    cupoTotal: 10,
    ocupados: 5,
    cuposVacios: 5,
    ocupacion: 0.5,
    nrcLlenos: 0,
    intentos: 0,
    exitos: 0,
    sinCupo: 0,
  });
  it("ordena franjas mañana, tarde, noche y sedes alfabéticas", () => {
    const m = matrizOcupacion([
      f("noche", "Perdomo"),
      f("mañana", "Calle 80"),
      f("tarde", "Calle 80"),
    ]);
    expect(m.franjas).toEqual(["mañana", "tarde", "noche"]);
    expect(m.sedes).toEqual(["Calle 80", "Perdomo"]);
    expect(m.celda("noche", "Perdomo")?.sede).toBe("Perdomo");
    expect(m.celda("noche", "Calle 80")).toBeUndefined();
  });
});

describe("ariaSort", () => {
  it("marca solo la columna activa", () => {
    expect(ariaSort("demanda", "demanda")).toBe("descending");
    expect(ariaSort("tiempo_llenado", "tiempo_llenado")).toBe("ascending");
    expect(ariaSort("vacios", "demanda")).toBe("none");
  });
});

describe("agruparAuditoria", () => {
  const fila = (tipo: AuditoriaFila["tipo"], resultado: string, n: number): AuditoriaFila => ({
    fecha: null,
    tipo,
    resultado,
    n,
    latenciaP50Ms: 0,
    latenciaP95Ms: 1,
    latenciaMaxMs: 2,
  });
  it("agrupa por tipo en orden fijo con totales", () => {
    const g = agruparAuditoria([
      fila("busqueda", "exito", 10),
      fila("intento", "sin_cupo", 3),
      fila("intento", "exito", 20),
    ]);
    expect(g.map((x) => x.tipo)).toEqual(["intento", "busqueda"]);
    expect(g[0]?.total).toBe(23);
    expect(g[0]?.filas.map((x) => x.resultado)).toEqual(["exito", "sin_cupo"]);
  });
});
