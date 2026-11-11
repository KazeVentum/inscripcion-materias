import { expect, test } from "@playwright/test";
import { entrarPorUi } from "./ayudas";
import { readFile } from "node:fs/promises";

test.describe("Mi horario", () => {
  test("semana con lo inscrito y exportación .ics en America/Bogota", async ({ page }) => {
    await entrarPorUi(page, "est-000002");
    await page.getByRole("link", { name: "Mi horario" }).click();
    await expect(page).toHaveURL(/\/horario/);
    await expect(page.getByRole("heading", { name: "Mi horario" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tu semana" })).toBeVisible();
    // Bases de Datos: martes y jueves 20:30 (escenario de HU3)
    await expect(page.getByRole("article", { name: /Bases de Datos/ })).toContainText(
      "Mar y Jue 20:30–21:59",
    );

    const descarga = page.waitForEvent("download");
    await page.getByRole("button", { name: "Exportar .ics" }).click();
    const d = await descarga;
    expect(d.suggestedFilename()).toBe("horario-2027-1.ics");
    const ics = await readFile((await d.path())!, "utf8");
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("TZID:America/Bogota");
    expect(ics).toContain("SUMMARY:Bases de Datos (NRC 64269)");
    expect(ics).toContain("DTSTART;TZID=America/Bogota:20270126T203000");
    expect(ics).toContain("BYDAY=TU");
    expect(ics).toContain("BYDAY=TH");
  });
});
