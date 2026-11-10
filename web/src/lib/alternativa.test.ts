import { describe, expect, it } from "vitest";
import { alternativaLocal } from "./alternativa";
import type { BloqueOut, NrcOut } from "./tipos";

const nrc = (
  n: string,
  inicio: string,
  fin: string,
  libres: number,
  franja: NrcOut["franja"] = "noche",
  dia: BloqueOut["dia"] = "MAR",
): NrcOut => ({
  nrc: n,
  materiaId: "ISUMBG103",
  titulo: "Sistemas Operativos",
  creditos: 3,
  sede: "Calle 80",
  modalidad: "presencial",
  docente: "D",
  franja,
  cupoTotal: 20,
  cuposLibres: libres,
  bloques: [{ dia, inicio, fin }],
});

describe("alternativaLocal", () => {
  const agotado = nrc("80852", "18:15", "19:44", 0);

  it("elige el grupo con cupo más cercano en horario", () => {
    const grupos = [agotado, nrc("A", "20:30", "21:59", 5), nrc("B", "19:00", "20:29", 2)];
    expect(alternativaLocal(agotado, grupos, [])?.nrc).toBe("B");
  });

  it("prefiere la misma franja aunque esté más lejos", () => {
    const grupos = [agotado, nrc("T", "17:00", "18:29", 9, "tarde"), nrc("N", "21:00", "22:29", 2)];
    expect(alternativaLocal(agotado, grupos, [])?.nrc).toBe("N");
  });

  it("descarta los que cruzan con lo inscrito o no tienen cupo", () => {
    const grupos = [agotado, nrc("C", "20:30", "21:59", 5), nrc("Z", "19:00", "20:29", 0)];
    const ocupado: BloqueOut[] = [{ dia: "MAR", inicio: "21:00", fin: "22:00" }];
    expect(alternativaLocal(agotado, grupos, ocupado)).toBeNull();
  });

  it("no se ofrece a sí mismo ni a otra materia", () => {
    const otra = { ...nrc("O", "18:15", "19:44", 9), materiaId: "OTRA" };
    expect(alternativaLocal(agotado, [agotado, otra], [])).toBeNull();
  });

  it("desempata por más cupos y luego por NRC", () => {
    const grupos = [agotado, nrc("B", "19:00", "20:29", 2), nrc("A", "19:00", "20:29", 7)];
    expect(alternativaLocal(agotado, grupos, [])?.nrc).toBe("A");
  });
});
