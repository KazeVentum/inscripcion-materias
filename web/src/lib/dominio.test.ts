import { describe, expect, it } from "vitest";
import { anuncioUmbral, nivelCupos, textoCupos } from "./cupos";
import { cruzan, franjaDe, horarioLegible, mmss, salonesLegibles } from "./horario";
import { nrc40930Alternativa, nrc80852, nrcVirtual } from "./fixtures";

describe("cupos", () => {
  it.each([
    [18, 18, "holgado", "18 de 18 libres"],
    [12, 18, "holgado", "12 de 18 libres"],
    [3, 18, "pocos", "Quedan 3 de 18"],
    [4, 18, "pocos", "Quedan 4 de 18"],
    [1, 18, "ultimo", "Último cupo"],
    [0, 18, "agotado", "Agotado"],
  ] as const)("%i de %i → %s", (libres, total, nivel, texto) => {
    expect(nivelCupos(libres, total)).toBe(nivel);
    expect(textoCupos(libres, total)).toBe(texto);
  });

  it("anuncia solo umbrales", () => {
    expect(anuncioUmbral(12, 11, 18, "80852")).toBeNull();
    expect(anuncioUmbral(5, 4, 18, "80852")).toBe("Quedan 4 cupos en 80852.");
    expect(anuncioUmbral(4, 3, 18, "80852")).toBeNull();
    expect(anuncioUmbral(2, 1, 18, "80852")).toBe("Queda el último cupo en 80852.");
    expect(anuncioUmbral(1, 0, 18, "80852")).toBe("80852 se agotó.");
    expect(anuncioUmbral(0, 1, 18, "80852")).toBe("Se liberó un cupo en 80852.");
    expect(anuncioUmbral(null, 3, 18, "80852")).toBeNull();
  });
});

describe("horario", () => {
  it("formatea bloques", () => {
    expect(horarioLegible(nrc80852.bloques)).toBe("Mar y Jue 18:15–19:44");
    expect(horarioLegible(nrc40930Alternativa.bloques)).toBe("Lun 20:30–21:59");
    expect(horarioLegible(nrcVirtual.bloques)).toBe("Virtual, sin horario fijo");
    expect(salonesLegibles(nrc80852.bloques)).toBe("RGH A406LS27");
  });

  it("detecta cruces y franjas", () => {
    const a = { dia: "MAR", inicio: "18:15", fin: "19:44" } as const;
    expect(cruzan(a, { dia: "MAR", inicio: "19:30", fin: "21:00" })).toBe(true);
    expect(cruzan(a, { dia: "MAR", inicio: "19:44", fin: "21:00" })).toBe(false);
    expect(cruzan(a, { dia: "JUE", inicio: "18:15", fin: "19:44" })).toBe(false);
    expect(franjaDe("11:59")).toBe("mañana");
    expect(franjaDe("12:00")).toBe("tarde");
    expect(franjaDe("18:00")).toBe("noche");
  });

  it("formatea contador", () => {
    expect(mmss(300)).toBe("5:00");
    expect(mmss(272)).toBe("4:32");
    expect(mmss(9)).toBe("0:09");
  });
});
