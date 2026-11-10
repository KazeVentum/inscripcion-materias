import { expect, test } from "@playwright/test";
import { ApiUsuario, abrirMateria, catalogoMongo, entrarPorUi } from "./ayudas";

const aMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3));

test.describe("HU3 · no ver cruces", () => {
  test("con clase MAR y JUE 20:30 inscrita, ningún NRC visible cruza", async ({
    page,
    request,
  }) => {
    const api = await ApiUsuario.entrar(request, "est-000002");
    const horario = await api.horario();
    const ocupados = horario.inscripciones.flatMap((i) => i.bloques);
    // el escenario de la historia: clase martes y jueves 20:30
    expect(ocupados.some((b) => b.dia === "MAR" && b.inicio === "20:30")).toBe(true);
    expect(ocupados.some((b) => b.dia === "JUE" && b.inicio === "20:30")).toBe(true);

    await entrarPorUi(page, "est-000002");
    await abrirMateria(page, /Sistemas Operativos/);
    // en el catálogo real hay NRC de esta materia que SÍ cruzan: no deben aparecer
    const cruzan = catalogoMongo("ISUMBG103").filter((n) =>
      n.bloques.some((b) =>
        ocupados.some(
          (o) => b.dia === o.dia && aMin(b.inicio) < aMin(o.fin) && aMin(o.inicio) < aMin(b.fin),
        ),
      ),
    );
    expect(cruzan.length, "el escenario necesita al menos un NRC que cruce").toBeGreaterThan(0);
    const permitidos = new Set((await api.nrcDe("ISUMBG103")).map((n) => n.nrc));
    const tarjetas = page.getByRole("article");
    await expect(tarjetas.first()).toBeVisible();

    const visibles = await tarjetas.evaluateAll((els) =>
      els.map((e) =>
        e.getAttribute("aria-labelledby")
          ? (e.querySelector("[id$='-nrc']")?.textContent ?? "")
          : "",
      ),
    );
    expect(visibles.length).toBeGreaterThan(0);
    for (const c of cruzan)
      expect(visibles, `NRC ${c.nrc} cruza y no debe verse`).not.toContain(c.nrc);
    const todos = await api.nrcDe("ISUMBG103");
    for (const codigo of visibles) {
      expect(permitidos.has(codigo), `NRC ${codigo} solo si la API lo ofrece`).toBe(true);
      const n = todos.find((x) => x.nrc === codigo)!;
      for (const b of n.bloques) {
        for (const o of ocupados) {
          const cruza =
            b.dia === o.dia && aMin(b.inicio) < aMin(o.fin) && aMin(o.inicio) < aMin(b.fin);
          expect(cruza, `NRC ${codigo} cruza con tu horario`).toBe(false);
        }
      }
    }
  });
});
