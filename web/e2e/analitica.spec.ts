import { expect, test } from "@playwright/test";
import { ApiUsuario, clave, entrarCoordinadorPorUi, entrarPorUi } from "./ayudas";

/** Rutas que un coordinador no puede llamar (responderían 403) y las de coordinación. */
const DE_ESTUDIANTE = /\/api\/v1\/(me|materias|avance|horario|inscripciones|stream)\b/;
const DE_COORDINACION = /\/api\/v1\/coordinacion\//;

test.describe("Analítica de coordinación (HU5)", () => {
  test("coord-0001 entra, ve los KPIs y la insignia de validación del linaje", async ({ page }) => {
    await entrarCoordinadorPorUi(page);
    await expect(page.getByRole("heading", { name: "Analítica de coordinación" })).toBeVisible();
    for (const kpi of [
      "Intentos",
      "Tasa de éxito",
      "Sin cupo",
      "Ocupación global",
      "Latencia p95 del intento",
      "NRC llenos",
    ]) {
      await expect(page.getByText(kpi, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByText(/Datos de la capa oro · actualizado/)).toBeVisible();

    const insignia = page.getByRole("button", { name: /Conteos bronce → plata → oro cuadran/ });
    await expect(insignia).toBeVisible();
    await insignia.click();
    const dialogo = page.getByRole("dialog", { name: "Los conteos cuadran" });
    await expect(dialogo).toContainText("bronce = plata + duplicados + invalidos");
    await page.keyboard.press("Escape");
    await expect(dialogo).toHaveCount(0);

    // secciones que responden a la decisión de la oferta
    await expect(page.getByRole("heading", { name: "Dónde abrir más grupos" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ocupación por franja y sede" })).toBeVisible();
    await expect(page.getByRole("table", { name: /Demanda y ocupación por NRC/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Auditoría" })).toBeVisible();
  });

  test("la cabecera del coordinador no trae cupos en vivo ni enlaces de estudiante", async ({
    page,
  }) => {
    const peticiones: string[] = [];
    page.on("request", (r) => peticiones.push(r.url()));
    await entrarCoordinadorPorUi(page);
    await expect(page.getByText("Coordinación · Ingeniería de Sistemas")).toBeVisible();
    await expect(page.getByRole("link", { name: "Analítica" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Inscripción" })).toHaveCount(0);
    await expect(page.getByText(/En vivo|Cupos en vivo/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Cerrar sesión" })).toBeVisible();
    expect(peticiones.filter((u) => DE_ESTUDIANTE.test(u))).toEqual([]);
  });

  test("ordenar por un encabezado pide el orden al endpoint y marca aria-sort", async ({
    page,
  }) => {
    await entrarCoordinadorPorUi(page);
    const tabla = page.getByRole("table", { name: /Demanda y ocupación por NRC/ });
    await expect(tabla).toBeVisible();
    const pedida = page.waitForRequest((r) => /demanda-nrc\?.*orden=sin_cupo/.test(r.url()));
    await tabla.getByRole("button", { name: "Sin cupo" }).click();
    await pedida;
    await expect(tabla.getByRole("columnheader", { name: /Sin cupo/ })).toHaveAttribute(
      "aria-sort",
      "descending",
    );
  });

  test("estado vacío: sin gold explica cómo generar datos", async ({ page }) => {
    await page.route("**/api/v1/coordinacion/analitica/resumen", (ruta) =>
      ruta.fulfill({
        json: {
          generadoEn: null,
          periodo: null,
          eventos: 0,
          intentos: 0,
          exitos: 0,
          sinCupo: 0,
          tasaExito: null,
          estudiantesUnicos: 0,
          nrcTotales: 0,
          nrcLlenos: 0,
          ocupacionGlobal: null,
          latenciaIntentoP50Ms: null,
          latenciaIntentoP95Ms: null,
          validacion: null,
        },
      }),
    );
    await entrarCoordinadorPorUi(page);
    await expect(page.getByText("Aún no hay datos en la capa oro.")).toBeVisible();
    await expect(page.getByText("make simular")).toBeVisible();
    await expect(page.getByText("make lake")).toBeVisible();
    await expect(page.getByText("Tasa de éxito")).toHaveCount(0);
  });

  test("error de la API: mensaje y reintento", async ({ page }) => {
    await page.route("**/api/v1/coordinacion/analitica/auditoria", (ruta) =>
      ruta.fulfill({ status: 500, json: { codigo: "error", mensaje: "falló" } }),
    );
    await entrarCoordinadorPorUi(page);
    const seccion = page.getByRole("region", { name: "Auditoría" });
    await expect(seccion.getByText("No pudimos cargar esta sección.")).toBeVisible();
    await expect(seccion.getByRole("button", { name: "Reintentar" })).toBeVisible();
  });
});

test.describe("Separación de roles", () => {
  test("el estudiante no entra a /coordinacion/analitica y no se llama a coordinación", async ({
    page,
  }) => {
    const peticiones: string[] = [];
    page.on("request", (r) => peticiones.push(r.url()));
    await entrarPorUi(page, "est-000001");
    await page.goto("/coordinacion/analitica");
    await expect(page).toHaveURL(/\/inscripcion/);
    await expect(page.getByRole("heading", { name: "Analítica de coordinación" })).toHaveCount(0);
    expect(peticiones.filter((u) => DE_COORDINACION.test(u))).toEqual([]);
    // y su cabecera no ofrece el enlace
    await expect(page.getByRole("link", { name: "Analítica" })).toHaveCount(0);
  });

  test("el coordinador no ve /inscripcion ni /horario y no llama endpoints de estudiante", async ({
    page,
  }) => {
    await entrarCoordinadorPorUi(page);
    const peticiones: string[] = [];
    page.on("request", (r) => peticiones.push(r.url()));
    for (const ruta of ["/inscripcion", "/horario"]) {
      await page.goto(ruta);
      await expect(page).toHaveURL(/\/coordinacion\/analitica/);
      await expect(page.getByRole("heading", { name: "Analítica de coordinación" })).toBeVisible();
    }
    expect(peticiones.filter((u) => DE_ESTUDIANTE.test(u))).toEqual([]);
  });

  test("la API devuelve 403 rol_no_permitido al estudiante en coordinación", async ({
    request,
  }) => {
    const est = await ApiUsuario.entrar(request, "est-000001");
    const r = await request.get("/api/v1/coordinacion/me", {
      headers: { Authorization: `Bearer ${est.token}` },
    });
    expect(r.status()).toBe(403);
    expect(((await r.json()) as { codigo: string }).codigo).toBe("rol_no_permitido");
  });

  test("la clave de demo no aparece en la pantalla del coordinador", async ({ page }) => {
    await entrarCoordinadorPorUi(page);
    expect(await page.content()).not.toContain(clave());
  });
});
