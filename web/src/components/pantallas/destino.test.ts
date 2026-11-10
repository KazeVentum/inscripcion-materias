import { describe, expect, it } from "vitest";
import { destinoSeguro } from "./PantallaLogin";

describe("destinoSeguro (?siguiente=)", () => {
  it("acepta rutas internas", () => {
    expect(destinoSeguro("/horario")).toBe("/horario");
  });
  it.each(["//evil.com", "/\\evil.com", "https://evil.com", "evil", "", null])("rechaza %s", (v) =>
    expect(destinoSeguro(v)).toBe("/inscripcion"),
  );
});
