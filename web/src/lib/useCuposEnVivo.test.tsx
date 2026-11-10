// @vitest-environment jsdom
import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { claves, crearQueryClient } from "@/lib/api/consultas";
import type { NrcOut } from "@/lib/tipos";
import type { FuenteEventos } from "./stream/cuposEnVivo";
import { useCuposEnVivo } from "./useCuposEnVivo";

class Fuente implements FuenteEventos {
  static ultima: Fuente | null = null;
  onopen: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  cerrada = false;
  oyentes: Record<string, (e: MessageEvent<string>) => void> = {};
  constructor() {
    Fuente.ultima = this;
  }
  addEventListener(t: string, fn: (e: MessageEvent<string>) => void) {
    this.oyentes[t] = fn;
  }
  close() {
    this.cerrada = true;
  }
}

const nrc = (n: string, libres: number): NrcOut => ({
  nrc: n,
  materiaId: "M",
  titulo: "T",
  creditos: 3,
  sede: "S",
  modalidad: "virtual",
  docente: "D",
  franja: "noche",
  cupoTotal: 18,
  cuposLibres: libres,
  bloques: [],
});

function montar(habilitado = true) {
  const qc = crearQueryClient();
  qc.setQueryData(claves.nrcDe("est-1", "M"), [nrc("1", 3), nrc("2", 9)]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const pedirTicket = vi.fn(async () => "tk");
  const r = renderHook(
    () =>
      useCuposEnVivo(habilitado, {
        pedirTicket,
        crearFuente: () => new Fuente(),
        espera: () => 10,
      }),
    { wrapper },
  );
  return { qc, pedirTicket, ...r };
}

afterEach(() => {
  cleanup();
  Fuente.ultima = null;
});

describe("useCuposEnVivo", () => {
  it("un evento del stream actualiza la caché sin recargar y un NRC puede llegar a 0", async () => {
    const { qc, result } = montar();
    await vi.waitFor(() => expect(Fuente.ultima).not.toBeNull());
    act(() => Fuente.ultima!.onopen?.(new Event("open")));
    expect(result.current.estado).toBe("en-vivo");

    act(() =>
      Fuente.ultima!.oyentes.cupo?.({ data: '{"nrc":"1","libres":0}' } as MessageEvent<string>),
    );
    const lista = qc.getQueryData<NrcOut[]>(claves.nrcDe("est-1", "M"))!;
    expect(lista[0]?.cuposLibres).toBe(0);
    expect(lista[1]?.cuposLibres).toBe(9);
  });

  it("al caer, refleja 'reconectando' y 'Actualizado hace…' con el último dato bueno", async () => {
    const { result } = montar();
    await vi.waitFor(() => expect(Fuente.ultima).not.toBeNull());
    act(() => Fuente.ultima!.onopen?.(new Event("open")));
    const primera = Fuente.ultima!;
    act(() => primera.onerror?.(new Event("error")));
    expect(primera.cerrada).toBe(true);
    expect(result.current.estado).toBe("reconectando");
    expect(result.current.ultimaActualizacion).toBeTypeOf("string");
  });

  it("tras reconectar vuelve a pedir ticket y a abrir otra fuente", async () => {
    const { pedirTicket } = montar();
    await vi.waitFor(() => expect(Fuente.ultima).not.toBeNull());
    const primera = Fuente.ultima!;
    act(() => primera.onerror?.(new Event("error")));
    await vi.waitFor(() => expect(pedirTicket).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(Fuente.ultima).not.toBe(primera));
  });

  it("deshabilitado no abre nada; al desmontar cierra la fuente", async () => {
    const off = montar(false);
    await new Promise((r) => setTimeout(r, 20));
    expect(off.pedirTicket).not.toHaveBeenCalled();

    const { unmount } = montar();
    await vi.waitFor(() => expect(Fuente.ultima).not.toBeNull());
    const f = Fuente.ultima!;
    unmount();
    expect(f.cerrada).toBe(true);
  });
});
