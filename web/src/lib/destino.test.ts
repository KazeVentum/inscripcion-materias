import { describe, expect, it } from "vitest";
import { destinoTrasLogin, rolDeRuta, rutaInicial } from "./destino";

describe("destino por rol", () => {
  it("cada rol tiene su inicio", () => {
    expect(rutaInicial("estudiante")).toBe("/inscripcion");
    expect(rutaInicial("coordinador")).toBe("/coordinacion/analitica");
  });
  it("/coordinacion/* es del coordinador", () => {
    expect(rolDeRuta("/coordinacion/analitica")).toBe("coordinador");
    expect(rolDeRuta("/horario")).toBe("estudiante");
    expect(rolDeRuta("/coordinacionx")).toBe("estudiante");
  });
  it("respeta ?siguiente= solo si es interna y del rol", () => {
    expect(destinoTrasLogin("/horario", "estudiante")).toBe("/horario");
    expect(destinoTrasLogin("/horario", "coordinador")).toBe("/coordinacion/analitica");
    expect(destinoTrasLogin("/coordinacion/analitica", "estudiante")).toBe("/inscripcion");
    expect(destinoTrasLogin("/coordinacion/analitica", "coordinador")).toBe(
      "/coordinacion/analitica",
    );
  });
  it.each(["//evil.com", "/\\evil.com", "https://evil.com", "evil", "", null])(
    "rechaza %s",
    (v) => {
      expect(destinoTrasLogin(v, "estudiante")).toBe("/inscripcion");
      expect(destinoTrasLogin(v, "coordinador")).toBe("/coordinacion/analitica");
    },
  );
});
