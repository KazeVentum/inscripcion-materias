// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "@/lib/api/cliente";
import { claves, crearQueryClient } from "@/lib/api/consultas";
import type { NrcOut } from "@/lib/tipos";
import { useInscripcion } from "./useInscripcion";

const avisos = { inscrita: vi.fn(), info: vi.fn(), error: vi.fn() };
vi.mock("@/components/pantallas/Avisos", () => ({ useAvisos: () => avisos }));

const nrc: NrcOut = {
  nrc: "80852",
  materiaId: "ISUMBG103",
  titulo: "Sistemas Operativos",
  creditos: 3,
  sede: "Calle 80",
  modalidad: "presencial",
  docente: "D",
  franja: "noche",
  cupoTotal: 18,
  cuposLibres: 1,
  bloques: [{ dia: "MAR", inicio: "18:15", fin: "19:44" }],
};

function montar() {
  const qc = crearQueryClient();
  qc.setQueryData(claves.nrcDe("est-1", "ISUMBG103"), [nrc]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, ...renderHook(() => useInscripcion(), { wrapper }) };
}

describe("useInscripcion", () => {
  beforeEach(() => {
    Object.values(avisos).forEach((f) => f.mockClear());
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("reservada → confirmada: pasa por 'reservada' y avisa el éxito", async () => {
    vi.spyOn(api, "inscribir").mockResolvedValue({
      estado: "reservada",
      nrc: "80852",
      materiaId: "ISUMBG103",
      cuposLibres: 0,
      vencimiento: "2026-11-10T15:05:00Z",
    });
    vi.spyOn(api, "horario").mockResolvedValue({
      periodo: "2027-1",
      creditosTotales: 0,
      inscripciones: [],
    });
    vi.spyOn(api, "materias").mockResolvedValue([]);
    const estados = [
      { nrc: "80852", estado: "reservada" as const },
      { nrc: "80852", estado: "confirmada" as const },
    ];
    vi.spyOn(api, "estadoInscripcion").mockImplementation(async () => estados.shift()!);

    const { result, qc } = montar();
    act(() => void result.current.inscribir(nrc));
    await waitFor(() => expect(result.current.fases["80852"]?.fase).toBe("reservada"));
    // el cupo de la respuesta 202 ya está en la caché
    expect(qc.getQueryData<NrcOut[]>(claves.nrcDe("est-1", "ISUMBG103"))?.[0]?.cuposLibres).toBe(0);

    await waitFor(
      () => expect(avisos.inscrita).toHaveBeenCalledWith("Sistemas Operativos", "80852"),
      {
        timeout: 4000,
      },
    );
    expect(result.current.fases).toEqual({});
  });

  it("rechazada: avisa que se liberó el cupo", async () => {
    vi.spyOn(api, "inscribir").mockResolvedValue({
      estado: "reservada",
      nrc: "80852",
      materiaId: "ISUMBG103",
      cuposLibres: 0,
      vencimiento: "2026-11-10T15:05:00Z",
    });
    vi.spyOn(api, "horario").mockResolvedValue({
      periodo: "2027-1",
      creditosTotales: 0,
      inscripciones: [],
    });
    vi.spyOn(api, "materias").mockResolvedValue([]);
    vi.spyOn(api, "estadoInscripcion").mockResolvedValue({ nrc: "80852", estado: "rechazada" });
    const { result } = montar();
    act(() => void result.current.inscribir(nrc));
    await waitFor(() => expect(avisos.error).toHaveBeenCalled(), { timeout: 4000 });
    expect(avisos.error.mock.calls[0]?.[0]).toContain("Liberamos el cupo");
    expect(avisos.inscrita).not.toHaveBeenCalled();
  });

  it("409 sin_cupo: guarda la alternativa de la API, deja el NRC en 0 y no muestra toast", async () => {
    const alternativa = { ...nrc, nrc: "40930", cuposLibres: 6 };
    vi.spyOn(api, "inscribir").mockRejectedValue(
      new ApiError(409, { codigo: "sin_cupo", mensaje: "se llenó", alternativa }),
    );
    const { result, qc } = montar();
    await act(async () => {
      await result.current.inscribir(nrc);
    });
    expect(result.current.alternativas["80852"]).toEqual(alternativa);
    expect(result.current.fases).toEqual({});
    expect(qc.getQueryData<NrcOut[]>(claves.nrcDe("est-1", "ISUMBG103"))?.[0]?.cuposLibres).toBe(0);
    expect(avisos.error).not.toHaveBeenCalled();
  });

  it("409 sin alternativa guarda null (la tarjeta dirá 'ningún otro grupo')", async () => {
    vi.spyOn(api, "inscribir").mockRejectedValue(new ApiError(409, { codigo: "sin_cupo" }));
    const { result } = montar();
    await act(async () => {
      await result.current.inscribir(nrc);
    });
    expect(result.current.alternativas["80852"]).toBeNull();
  });

  it("un cruce muestra el aviso en su lugar y devuelve el botón a reposo", async () => {
    vi.spyOn(api, "inscribir").mockRejectedValue(
      new ApiError(409, { codigo: "cruce", mensaje: "Se cruza con el NRC 9" }),
    );
    vi.spyOn(api, "horario").mockResolvedValue({
      periodo: "2027-1",
      creditosTotales: 0,
      inscripciones: [],
    });
    vi.spyOn(api, "materias").mockResolvedValue([]);
    const { result } = montar();
    await act(async () => {
      await result.current.inscribir(nrc);
    });
    expect(avisos.error).toHaveBeenCalledWith("Se cruza con el NRC 9");
    expect(result.current.fases).toEqual({});
  });

  it("ignora un segundo clic mientras la inscripción sigue en curso", async () => {
    let resolver: (v: never) => void = () => {};
    const inscribir = vi
      .spyOn(api, "inscribir")
      .mockImplementation(() => new Promise((r) => (resolver = r as (v: never) => void)));
    const { result } = montar();
    act(() => void result.current.inscribir(nrc));
    act(() => void result.current.inscribir(nrc));
    expect(inscribir).toHaveBeenCalledTimes(1);
    expect(result.current.fases["80852"]?.fase).toBe("inscribiendo");
    inscribir.mockRestore();
    resolver(undefined as never);
  });
});
