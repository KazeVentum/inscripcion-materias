// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claves, crearQueryClient } from "@/lib/api/consultas";
import { _reiniciarSesionParaPruebas, cerrarSesion, guardarSesion } from "@/lib/api/sesion";
import { useLimpiarCachePorSesion } from "./Proveedores";

const sesion = (id: string) => ({ token: "t", estudianteId: id, expiraEn: Date.now() + 60_000 });

beforeEach(() => {
  window.sessionStorage.clear();
  _reiniciarSesionParaPruebas();
});
afterEach(cleanup);

function montar() {
  const qc = crearQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  renderHook(() => useLimpiarCachePorSesion(), { wrapper });
  return qc;
}

describe("caché y sesión", () => {
  it("cerrar sesión (401, vencimiento o botón) vacía la caché", () => {
    guardarSesion(sesion("est-1"));
    const qc = montar();
    qc.setQueryData(claves.horario("est-1"), { x: 1 });
    act(() => cerrarSesion());
    expect(qc.getQueryData(claves.horario("est-1"))).toBeUndefined();
  });

  it("otro estudiante en la misma pestaña no ve datos del anterior", () => {
    guardarSesion(sesion("est-1"));
    const qc = montar();
    qc.setQueryData(claves.nrcDe("est-1", "M"), [{ nrc: "1" }]);
    act(() => guardarSesion(sesion("est-2")));
    expect(qc.getQueryData(claves.nrcDe("est-1", "M"))).toBeUndefined();
    expect(qc.getQueryData(claves.nrcDe("est-2", "M"))).toBeUndefined();
  });

  it("las claves de un estudiante no se confunden con las de otro", () => {
    expect(claves.materias("a")).not.toEqual(claves.materias("b"));
    expect(claves.horario("a")).not.toEqual(claves.horario("b"));
    expect(claves.nrcDe("a", "M")).not.toEqual(claves.nrcDe("b", "M"));
  });
});
