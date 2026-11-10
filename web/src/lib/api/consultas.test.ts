import { describe, expect, it } from "vitest";
import { aplicarCupo, buscarNrc, claves, crearQueryClient } from "./consultas";
import type { HorarioOut, NrcOut } from "@/lib/tipos";

const n = (nrc: string, libres: number): NrcOut => ({
  nrc,
  materiaId: "M",
  titulo: "T",
  creditos: 3,
  sede: "S",
  modalidad: "virtual",
  docente: "D",
  franja: "noche",
  cupoTotal: 20,
  cuposLibres: libres,
  bloques: [],
});

describe("aplicarCupo", () => {
  it("reescribe solo el NRC del evento en todas las listas y en el horario", () => {
    const qc = crearQueryClient();
    const a = n("1", 5);
    const b = n("2", 7);
    qc.setQueryData(claves.nrcDe("est-1", "M"), [a, b]);
    qc.setQueryData(claves.nrcDe("est-1", "X"), [n("1", 5)]);
    const h: HorarioOut = {
      periodo: "2027-1",
      creditosTotales: 3,
      inscripciones: [{ ...n("1", 5), estado: "confirmada" }],
    };
    qc.setQueryData(claves.horario("est-1"), h);

    aplicarCupo(qc, "1", 0);

    const l1 = qc.getQueryData<NrcOut[]>(claves.nrcDe("est-1", "M"))!;
    expect(l1[0]?.cuposLibres).toBe(0);
    expect(l1[1]).toBe(b); // el otro objeto conserva identidad: no re-renderiza
    expect(qc.getQueryData<NrcOut[]>(claves.nrcDe("est-1", "X"))![0]?.cuposLibres).toBe(0);
    expect(
      qc.getQueryData<HorarioOut>(claves.horario("est-1"))!.inscripciones[0]?.cuposLibres,
    ).toBe(0);
  });

  it("sin cambio real no toca la caché", () => {
    const qc = crearQueryClient();
    const lista = [n("1", 5)];
    qc.setQueryData(claves.nrcDe("est-1", "M"), lista);
    aplicarCupo(qc, "1", 5);
    expect(qc.getQueryData(claves.nrcDe("est-1", "M"))).toBe(lista);
    aplicarCupo(qc, "999", 1);
    expect(qc.getQueryData(claves.nrcDe("est-1", "M"))).toBe(lista);
  });

  it("buscarNrc encuentra el NRC en cualquier lista", () => {
    const qc = crearQueryClient();
    qc.setQueryData(claves.nrcDe("est-1", "M"), [n("1", 5)]);
    expect(buscarNrc(qc, "1")?.cuposLibres).toBe(5);
    expect(buscarNrc(qc, "2")).toBeUndefined();
  });
});
