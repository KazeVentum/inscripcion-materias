import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MINIMO, contraste, contrastePar, leerPares, leerTemas, parsearColor } from "./contraste";

const css = readFileSync(fileURLToPath(new URL("./tokens.css", import.meta.url)), "utf8");
const temas = leerTemas(css);
const pares = leerPares(css);

describe("fórmula de contraste", () => {
  it("coincide con valores de referencia WCAG", () => {
    expect(contraste(parsearColor("#000000"), parsearColor("#ffffff"))).toBeCloseTo(21, 5);
    // Ratios medidos en el brief
    expect(contraste(parsearColor("#ffffff"), parsearColor("#1E6BFF"))).toBeCloseTo(4.56, 2);
    expect(contraste(parsearColor("#F2A900"), parsearColor("#ffffff"))).toBeCloseTo(2.01, 2);
  });
});

describe("tokens.css", () => {
  it("declara pares de contraste", () => {
    expect(pares.length).toBeGreaterThanOrEqual(30);
  });

  it("los dos bloques oscuros (preferencia y data-theme) son idénticos", () => {
    expect(temas.oscuroPreferencia).toEqual(temas.oscuro);
  });

  it("claro y oscuro definen los mismos tokens", () => {
    expect(Object.keys(temas.oscuro).sort()).toEqual(Object.keys(temas.claro).sort());
  });

  it("conserva los colores del manual de marca", () => {
    expect(temas.claro["--primary"]).toBe("#003366");
    expect(temas.claro["--accent"]).toBe("#f2a900");
    expect(temas.claro["--text-2"]).toBe("#555555");
    expect(temas.oscuro["--bg"]).toBe("#0a0f1d");
    expect(temas.oscuro["--surface"]).toBe("#121a2d");
    expect(temas.oscuro["--primary"]).toBe("#1e6bff");
    expect(temas.oscuro["--accent"]).toBe("#f5b014");
    expect(temas.oscuro["--text"]).toBe("#e2e8f0");
    expect(temas.oscuro["--text-2"]).toBe("#94a3b8");
  });
});

for (const [nombre, tema] of [
  ["claro", temas.claro],
  ["oscuro", temas.oscuro],
] as const) {
  describe(`contraste AA, tema ${nombre}`, () => {
    it.each(
      pares.map(
        (p) =>
          [`${p.frente} / ${p.fondo}${p.sobre ? ` sobre ${p.sobre}` : ""} (${p.tipo})`, p] as const,
      ),
    )("%s", (_, par) => {
      const ratio = contrastePar(tema, par);
      expect(
        ratio,
        `${par.frente} sobre ${par.fondo} = ${ratio.toFixed(2)}:1, mínimo ${MINIMO[par.tipo]}`,
      ).toBeGreaterThanOrEqual(MINIMO[par.tipo]);
    });
  });
}
