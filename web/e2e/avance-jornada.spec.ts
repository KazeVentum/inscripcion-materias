import { expect, test } from "@playwright/test";
import { ApiUsuario, abrirMateria, cancelarMaterias, entrarPorUi } from "./ayudas";

const aMin = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

test.describe("Avance del semestre", () => {
  test("lo que dice /avance es lo que muestra la pantalla (est-000002)", async ({
    page,
    request,
  }) => {
    const api = await ApiUsuario.entrar(request, "est-000002");
    const av = await api.avance();

    await entrarPorUi(page, "est-000002");
    await expect(page.getByText(av.mensaje)).toBeVisible();
    await expect(page.getByText(`Faltan ${av.faltan} de ${av.totalPendientes}`)).toBeVisible();
    expect(av.faltan).toBe(av.totalPendientes - av.inscritas);

    // al tocarla: cada materia del semestre con su estado
    await page.getByRole("button", { name: av.mensaje }).click();
    const zona = page.getByRole("region", { name: `Materias del ${av.semestreActual}.º semestre` });
    const texto: Record<string, string> = {
      inscrita: "Inscrita",
      habilitada: "Puedes inscribirla",
      bloqueada_prerrequisito: "Falta un prerrequisito",
      sin_oferta: "Sin grupos por ahora",
    };
    for (const m of av.materias) {
      await expect(zona.getByRole("listitem").filter({ hasText: m.nombre })).toContainText(
        texto[m.estado]!,
      );
    }
    // las inscritas del avance figuran como Inscrita también en la lista de materias
    for (const m of av.materias.filter((x) => x.estado === "inscrita")) {
      await expect(
        page.getByRole("button", { name: new RegExp(`${m.materiaId}.*NRC`) }),
      ).toBeVisible();
    }
    // atrasadas: colapsadas
    if (av.atrasadas.length > 0) {
      await expect(zona.getByText(av.atrasadas[0]!.nombre)).toHaveCount(0);
      await page.getByRole("button", { name: /De semestres anteriores/ }).click();
      await expect(zona.getByText(av.atrasadas[0]!.nombre)).toBeVisible();
    }
  });

  test("inscribir una materia habilitada del semestre baja 'faltan' en uno", async ({
    page,
    request,
  }) => {
    const api = await ApiUsuario.entrar(request, "est-000002");
    const antes = await api.avance();
    const objetivo = antes.materias.find((m) => m.estado === "habilitada");
    test.skip(!objetivo, "no hay materia habilitada del semestre");
    const nrcs = await api.nrcDe(objetivo!.materiaId);
    test.skip(nrcs.length === 0, "sin grupos disponibles");

    try {
      await entrarPorUi(page, "est-000002");
      await expect(
        page.getByText(`Faltan ${antes.faltan} de ${antes.totalPendientes}`),
      ).toBeVisible();
      await abrirMateria(page, new RegExp(objetivo!.materiaId));
      await page
        .getByRole("button", { name: /^Inscribir \d+$/ })
        .first()
        .click();
      await expect(
        page.getByText(`Faltan ${antes.faltan - 1} de ${antes.totalPendientes}`),
      ).toBeVisible({
        timeout: 25_000,
      });
      expect((await api.avance()).faltan).toBe(antes.faltan - 1);
    } finally {
      await cancelarMaterias(api, [objetivo!.materiaId]);
    }
  });
});

test.describe("Jornada", () => {
  test("est-000006 (tarde): la cabecera lo dice y solo ve NRC de 12:00–18:00 o virtuales", async ({
    page,
    request,
  }) => {
    const api = await ApiUsuario.entrar(request, "est-000006");
    expect((await api.perfil()).jornada).toBe("tarde");

    await entrarPorUi(page, "est-000006");
    await expect(page.getByText("Jornada tarde · 12:00–18:00")).toBeVisible();

    const pendientes = (await api.materias()).filter(
      (m) => m.estado === "pendiente" && m.nrcDisponibles > 0,
    );
    expect(pendientes.length).toBeGreaterThan(0);
    for (const m of pendientes.slice(0, 3)) {
      await abrirMateria(page, new RegExp(m.materiaId));
      await expect(page.getByRole("article").first()).toBeVisible();
      const tarjetas = await page.getByRole("article").allInnerTexts();
      for (const t of tarjetas) {
        for (const [, ini, fin] of t.matchAll(/(\d{2}:\d{2})–(\d{2}:\d{2})/g)) {
          expect(aMin(ini!), t).toBeGreaterThanOrEqual(12 * 60);
          expect(aMin(fin!), t).toBeLessThanOrEqual(18 * 60);
        }
      }
      // cierra la fila para la siguiente
      await page
        .getByRole("button", { name: new RegExp(m.materiaId) })
        .first()
        .click();
    }
  });

  test("est-000002 (noche): la cabecera dice la jornada noche", async ({ page }) => {
    await entrarPorUi(page, "est-000002");
    await expect(page.getByText("Jornada noche · 18:00–22:00")).toBeVisible();
  });

  test("el login sugiere est-000006 con su jornada", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /est-000006.*jornada tarde/ })).toBeVisible();
  });
});
