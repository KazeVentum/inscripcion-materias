// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { _reiniciarSesionParaPruebas, cerrarSesion, guardarSesion, leerSesion } from "./sesion";

beforeEach(() => {
  window.sessionStorage.clear();
  _reiniciarSesionParaPruebas();
});

describe("sesión", () => {
  it("guarda en sessionStorage (no en localStorage) y se lee de vuelta", () => {
    guardarSesion({ token: "t", estudianteId: "est-000001", expiraEn: Date.now() + 60_000 });
    expect(window.sessionStorage.getItem("sesion")).toContain("est-000001");
    expect(window.localStorage.getItem("sesion")).toBeNull();
    expect(leerSesion()?.estudianteId).toBe("est-000001");
  });

  it("una sesión vencida cuenta como ausente", () => {
    window.sessionStorage.setItem(
      "sesion",
      JSON.stringify({ token: "t", estudianteId: "e", expiraEn: Date.now() - 1 }),
    );
    expect(leerSesion()).toBeNull();
  });

  it("ignora basura y cerrar la borra", () => {
    window.sessionStorage.setItem("sesion", "{no json");
    expect(leerSesion()).toBeNull();
    guardarSesion({ token: "t", estudianteId: "e", expiraEn: Date.now() + 1000 });
    cerrarSesion();
    expect(leerSesion()).toBeNull();
    expect(window.sessionStorage.getItem("sesion")).toBeNull();
  });

  it("devuelve el mismo objeto mientras no cambie (requisito de useSyncExternalStore)", () => {
    guardarSesion({ token: "t", estudianteId: "e", expiraEn: Date.now() + 60_000 });
    expect(leerSesion()).toBe(leerSesion());
  });
});
