import { expect, test } from "@playwright/test";
import { clave, entrarPorUi } from "./ayudas";

test.describe("Login institucional simulado", () => {
  test("credenciales incorrectas: mensaje claro y el foco no se pierde", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Estudiante o correo").fill("est-000001");
    await page.getByLabel("Contraseña", { exact: true }).fill("clave-equivocada");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("Usuario o contraseña incorrectos.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("las cuentas de demo rellenan el usuario; la clave no está en la pantalla", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /est-000003/ }).click();
    await expect(page.getByLabel("Estudiante o correo")).toHaveValue("est-000003");
    expect(await page.content()).not.toContain(clave());
  });

  test("entra con el código, cierra sesión y las rutas protegidas vuelven al login", async ({
    page,
  }) => {
    await entrarPorUi(page, "est-000001");
    await page.getByRole("button", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/horario");
    await expect(page).toHaveURL(/\/login/);
  });

  test("el JWT queda en sessionStorage y nunca en una URL", async ({ page }) => {
    const urls: string[] = [];
    page.on("request", (r) => urls.push(r.url()));
    await entrarPorUi(page, "est-000001");
    await expect(page.getByRole("button", { name: /Lógica Matemática/ })).toBeVisible();
    const token = await page.evaluate(
      () => JSON.parse(sessionStorage.getItem("sesion") ?? "{}").token as string,
    );
    expect(token.split(".")).toHaveLength(3);
    expect(await page.evaluate(() => localStorage.getItem("sesion"))).toBeNull();
    expect(urls.filter((u) => u.includes(token))).toEqual([]);
    // el stream usa ticket, no el JWT
    await expect
      .poll(() => urls.some((u) => /\/api\/v1\/stream\/cupos\?ticket=/.test(u)))
      .toBe(true);
  });

  test("10 intentos fallidos seguidos: 429 con espera visible", async ({ page }) => {
    await page.goto("/login");
    // usuario propio del test para no bloquear a los demás
    await page.getByLabel("Estudiante o correo").fill("est-000005-limite");
    for (let i = 0; i < 11; i++) {
      await page.getByLabel("Contraseña", { exact: true }).fill(`mala-${i}`);
      const boton = page.getByRole("button", { name: "Entrar" });
      if (await boton.isDisabled()) break;
      await boton.click();
      await expect(page.getByText(/incorrectos|Demasiados intentos/)).toBeVisible();
    }
    await expect(page.getByText(/Demasiados intentos fallidos/)).toBeVisible();
    await expect(page.getByText(/Podrás intentarlo en \d+ s/)).toBeVisible();
  });
});
