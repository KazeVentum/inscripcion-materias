import { expect, test } from "@playwright/test";
import { ApiUsuario, abrirMateria, entrarPorUi, redis } from "./ayudas";

test.describe("HU2 · cupos y horarios reales, en vivo", () => {
  test("cada NRC muestra cupos, días y horas; un cambio llega sin recargar", async ({
    page,
    request,
  }) => {
    const api = await ApiUsuario.entrar(request, "est-000001");
    const lista = await api.nrcDe("INFO1010");
    const objetivo = lista.find((n) => n.cupoTotal >= 6) ?? lista[0]!;
    const original = redis.cupos(objetivo.nrc);

    try {
      redis.fijarCupos(objetivo.nrc, 5);
      await entrarPorUi(page, "est-000001");
      await expect(page.getByText("Cupos en vivo").first()).toBeVisible();
      await abrirMateria(page, /Gestión Básica de la Información/);

      const tarjeta = page.getByRole("article", { name: new RegExp(`^${objetivo.nrc}`) });
      await expect(tarjeta).toBeVisible();
      // cupos, días y horas visibles en la tarjeta
      await expect(tarjeta).toContainText(new RegExp(`(Quedan )?5 de ${objetivo.cupoTotal}`));
      await expect(tarjeta).toContainText(/\d{2}:\d{2}–\d{2}:\d{2}|sin horario fijo/);

      // otro estudiante toma cupos: la barra cambia sin recargar
      redis.fijarCupos(objetivo.nrc, 2);
      redis.publicar(objetivo.nrc, 2);
      await expect(tarjeta).toContainText(`Quedan 2 de ${objetivo.cupoTotal}`);

      redis.fijarCupos(objetivo.nrc, 1);
      redis.publicar(objetivo.nrc, 1);
      await expect(tarjeta).toContainText("Último cupo");

      // se agota: la tarjeta da paso al aviso con su alternativa, sin recargar
      redis.fijarCupos(objetivo.nrc, 0);
      redis.publicar(objetivo.nrc, 0);
      await expect(page.getByText(`Se agotó ${objetivo.nrc}.`)).toBeVisible();
    } finally {
      redis.fijarCupos(objetivo.nrc, original);
    }
  });

  test("sin conexión: franja visible, cupos atenuados y Inscribir deshabilitado con motivo", async ({
    page,
    context,
  }) => {
    await entrarPorUi(page, "est-000001");
    await expect(page.getByText("Cupos en vivo").first()).toBeVisible();
    await abrirMateria(page, /Gestión Básica de la Información/);
    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event("offline")));
    await expect(page.getByText(/Sin conexión\. Los cupos pueden haber cambiado/)).toBeVisible();
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.getByText(/Sin conexión\. Los cupos pueden haber cambiado/)).toHaveCount(0, {
      timeout: 20_000,
    });
    await expect(page.getByText("Cupos en vivo").first()).toBeVisible();
  });
});
