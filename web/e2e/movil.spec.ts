import { expect, test } from "@playwright/test";
import {
  ApiUsuario,
  abrirMateria,
  cancelarMaterias,
  entrarCoordinadorPorUi,
  entrarPorUi,
} from "./ayudas";

test.describe("Móvil 390 px", () => {
  test("tocar un NRC lo prueba en la semana y la bandeja inscribe", async ({ page, request }) => {
    const api = await ApiUsuario.entrar(request, "est-000001");
    await cancelarMaterias(api, ["INFO1010"]);
    const lista = await api.nrcDe("INFO1010");
    const objetivo = [...lista].sort((a, b) => b.cuposLibres - a.cuposLibres)[0]!;

    try {
      await entrarPorUi(page, "est-000001");
      await abrirMateria(page, /INFO1010/);
      // sin selección no hay bandeja
      await expect(page.getByRole("region", { name: "NRC seleccionado" })).toHaveCount(0);

      await page.getByRole("button", { name: new RegExp(`^${objetivo.nrc}`) }).click();
      const bandeja = page.getByRole("region", { name: "NRC seleccionado" });
      await expect(bandeja).toBeVisible();
      await expect(bandeja).toContainText("Gestión Básica de la Información");
      await expect(page.getByText("Vista previa").first()).toBeVisible();

      await bandeja.getByRole("button", { name: /^Inscribir/ }).click();
      await expect(
        page.getByText(/^Inscrita: Gestión Básica de la Información, NRC \d+\.$/),
      ).toBeVisible({
        timeout: 25_000,
      });
      await expect(bandeja).toHaveCount(0);

      // pestaña Semana: la semana completa con lo inscrito
      await page.getByRole("tab", { name: "Semana" }).click();
      await expect(
        page.getByRole("region", { name: "Semana completa, desplazable" }),
      ).toBeVisible();
    } finally {
      await cancelarMaterias(api, ["INFO1010"]);
    }
  });

  test("sin desbordamiento horizontal en login e inscripción", async ({ page }) => {
    await page.goto("/login");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await entrarPorUi(page, "est-000001");
    await expect(page.getByRole("button", { name: /Lógica Matemática/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
  });
});

test.describe("Analítica en móvil 390 px", () => {
  test("se usa sin desborde horizontal y la tabla pasa a lista", async ({ page }) => {
    await entrarCoordinadorPorUi(page);
    await expect(page.getByRole("heading", { name: "Dónde abrir más grupos" })).toBeVisible();
    await expect(page.getByRole("list", { name: "NRC por demanda" })).toBeVisible();
    await expect(page.getByRole("table", { name: /Demanda y ocupación por NRC/ })).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
  });
});
