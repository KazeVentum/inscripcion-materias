import { expect, test } from "@playwright/test";
import { ApiUsuario, abrirMateria, cancelarMaterias, entrarPorUi, redis } from "./ayudas";

test.describe("HU4 · inscribir en un clic", () => {
  test("con cupo: reserva, confirma, queda en el horario y se puede cancelar", async ({
    page,
    request,
  }) => {
    const api = await ApiUsuario.entrar(request, "est-000001");
    await cancelarMaterias(api, ["INFO1010"]);
    const lista = await api.nrcDe("INFO1010");
    const objetivo = [...lista].sort((a, b) => b.cuposLibres - a.cuposLibres)[0]!;

    try {
      await entrarPorUi(page, "est-000001");
      await abrirMateria(page, /INFO1010/);
      await page.getByRole("button", { name: `Inscribir ${objetivo.nrc}` }).click();

      // éxito: toast con el texto del brief y la materia pasa a "Inscrita" con su NRC
      await expect(
        page.getByText(`Inscrita: Gestión Básica de la Información, NRC ${objetivo.nrc}.`, {
          exact: true,
        }),
      ).toBeVisible({ timeout: 25_000 });
      await expect(
        page.getByRole("button", { name: new RegExp(`INFO1010.*NRC ${objetivo.nrc}`) }),
      ).toBeVisible();
      expect(await api.estado(objetivo.nrc)).toBe("confirmada");

      // el NRC ya no se ofrece y la semana lo muestra inscrito
      const h = await api.horario();
      expect(h.inscripciones.some((i) => i.nrc === objetivo.nrc && i.estado === "confirmada")).toBe(
        true,
      );

      // cancelar: confirma en el diálogo y el cupo vuelve
      const antes = redis.cupos(objetivo.nrc);
      await page.getByRole("button", { name: "Cancelar inscripción" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Cancelar inscripción" }).click();
      await expect(
        page.getByText(`Cancelaste Gestión Básica de la Información, NRC ${objetivo.nrc}.`),
      ).toBeVisible();
      await expect.poll(() => api.estado(objetivo.nrc)).toBe("cancelada");
      expect(redis.cupos(objetivo.nrc)).toBe(antes + 1);
    } finally {
      await cancelarMaterias(api, ["INFO1010"]);
    }
  });

  test("último cupo: si otro estudiante lo toma mientras miro, la tarjeta ofrece la alternativa al instante", async ({
    page,
    request,
  }) => {
    const MATERIA = "ISUMBG093";
    const ULTIMO = "92117";
    const ALTERNATIVA = "54994";
    const rival = await ApiUsuario.entrar(request, "est-000001");
    const yo = await ApiUsuario.entrar(request, "est-000002");
    await cancelarMaterias(rival, [MATERIA]);
    await cancelarMaterias(yo, [MATERIA]);
    const original = redis.cupos(ULTIMO);
    redis.fijarCupos(ULTIMO, 1);

    try {
      await entrarPorUi(page, "est-000002");
      await abrirMateria(page, new RegExp(MATERIA));
      const tarjeta = page.getByRole("article", { name: new RegExp(`^${ULTIMO}`) });
      await expect(tarjeta).toContainText("Último cupo");

      // el rival reserva el último cupo (por la API, como lo haría otro navegador)
      const r = await rival.inscribir(ULTIMO);
      expect(r.status()).toBe(202);

      const aviso = page.getByRole("status").filter({ hasText: `Se agotó ${ULTIMO}.` });
      await expect(aviso).toBeVisible();
      await expect(aviso).toContainText(`El ${ALTERNATIVA}`);
      await expect(aviso).toContainText("no cruza con tu horario");

      // y la alternativa se inscribe en un clic
      await aviso.getByRole("button", { name: `Inscribir ${ALTERNATIVA}` }).click();
      await expect(
        page.getByText("Inscrita: Electiva CP, NRC 54994.", { exact: true }),
      ).toBeVisible({
        timeout: 25_000,
      });
      expect(await yo.estado(ALTERNATIVA)).toBe("confirmada");
    } finally {
      await cancelarMaterias(rival, [MATERIA]);
      await cancelarMaterias(yo, [MATERIA]);
      redis.fijarCupos(ULTIMO, original);
    }
  });

  test("409 sin_cupo si el aviso en vivo no llegó: la respuesta de la API trae la alternativa", async ({
    page,
    request,
  }) => {
    const MATERIA = "ISUMBG093";
    const ULTIMO = "92117";
    const yo = await ApiUsuario.entrar(request, "est-000002");
    await cancelarMaterias(yo, [MATERIA]);
    const original = redis.cupos(ULTIMO);
    redis.fijarCupos(ULTIMO, 1);

    try {
      await entrarPorUi(page, "est-000002");
      await abrirMateria(page, new RegExp(MATERIA));
      const tarjeta = page.getByRole("article", { name: new RegExp(`^${ULTIMO}`) });
      await expect(tarjeta).toContainText("Último cupo");

      // el último cupo se va sin que el stream lo anuncie (evento perdido)
      redis.fijarCupos(ULTIMO, 0);
      await page.getByRole("button", { name: `Inscribir ${ULTIMO}` }).click();

      await expect(page.getByText(`Se agotó ${ULTIMO}.`)).toBeVisible();
      await expect(
        page
          .getByRole("status")
          .filter({ hasText: `Se agotó ${ULTIMO}.` })
          .getByRole("button", { name: "Inscribir 54994" }),
      ).toBeVisible();
      // no se reservó nada
      expect(await yo.estado(ULTIMO)).toBeNull();
    } finally {
      await cancelarMaterias(yo, [MATERIA]);
      redis.fijarCupos(ULTIMO, original);
    }
  });

  test("un NRC que cruza con lo reservado desaparece de las otras materias (regla central)", async ({
    page,
    request,
  }) => {
    const api = await ApiUsuario.entrar(request, "est-000002");
    await cancelarMaterias(api, ["ISUMBG103"]);
    // Sistemas Operativos 11585 y 75535 son LUN 15:15 y MIE 16:45: se cruzan entre sí
    const antes = await api.nrcDe("ISUMBG103");
    expect(antes.map((n) => n.nrc).sort()).toEqual(["11585", "75535"]);

    try {
      await entrarPorUi(page, "est-000002");
      await abrirMateria(page, /ISUMBG103/);
      await page.getByRole("button", { name: "Inscribir 11585" }).click();
      await expect(
        page.getByText("Inscrita: Sistemas Operativos, NRC 11585.", { exact: true }),
      ).toBeVisible({
        timeout: 25_000,
      });
      // la materia queda inscrita y los NRC que ahora cruzan ya no se ofrecen en la API
      const despues = await api.nrcDe("ISUMBG012");
      for (const n of despues) {
        for (const b of n.bloques) {
          const choca = b.dia === "LUN" && b.inicio < "16:44" && "15:15" < b.fin;
          expect(choca, `NRC ${n.nrc}`).toBe(false);
        }
      }
    } finally {
      await cancelarMaterias(api, ["ISUMBG103"]);
    }
  });
});
