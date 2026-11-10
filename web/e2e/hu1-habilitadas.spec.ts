import { expect, test } from "@playwright/test";
import { ApiUsuario, entrarPorUi } from "./ayudas";

test.describe("HU1 · ver solo lo que puedo inscribir", () => {
  test("la lista es exactamente la que habilita la API (1.er semestre)", async ({
    page,
    request,
  }) => {
    const api = await ApiUsuario.entrar(request, "est-000001");
    const habilitadas = await api.materias();

    await entrarPorUi(page, "est-000001");
    await expect(page.getByRole("button", { name: /Lógica Matemática/ })).toBeVisible();

    // cada materia habilitada aparece; el contador de la UI coincide con el de la API
    for (const m of habilitadas) {
      await expect(
        page
          .getByRole("button", {
            name: new RegExp(m.nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
          })
          .first(),
      ).toBeVisible();
    }
    await expect(page.getByRole("button", { name: /\d+ créditos/ })).toHaveCount(
      habilitadas.length,
    );

    // Práctica Profesional exige créditos que un estudiante de 1.er semestre no tiene
    await expect(page.getByRole("button", { name: /Práctica Profesional/ })).toHaveCount(0);
  });

  test("quien sí cumple los requisitos (9.º semestre) ve Práctica Profesional", async ({
    page,
  }) => {
    await entrarPorUi(page, "est-000004");
    await expect(page.getByRole("button", { name: /Práctica Profesional/ })).toBeVisible();
  });

  test("sin sesión, /inscripcion manda al login", async ({ page }) => {
    await page.goto("/inscripcion");
    await expect(page).toHaveURL(/\/login\?siguiente=%2Finscripcion/);
  });
});
