// Capturas de la fase 5 contra la app levantada (make up && make seed).
// Uso: DEMO_PASSWORD=... node scripts/capturas-fase5.mjs   (make screenshots-fase5 lo carga de .env)
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const base = process.env.WEB_URL ?? "http://localhost:3000";
const clave = process.env.DEMO_PASSWORD;
if (!clave) throw new Error("Falta DEMO_PASSWORD");
const salida = fileURLToPath(new URL("../tests/screenshots/fase5/", import.meta.url));
await mkdir(salida, { recursive: true });

const VISTAS = {
  movil: { width: 390, height: 844 },
  escritorio: { width: 1440, height: 900 },
};
const TEMAS = ["claro", "oscuro"];

async function token(usuario) {
  const r = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usuario, password: clave }),
  });
  const d = await r.json();
  return {
    token: d.accessToken,
    estudianteId: d.estudianteId,
    expiraEn: Date.now() + d.expiraEnS * 1000,
  };
}

const navegador = await chromium.launch();
const sesion = await token("est-000002");
try {
  for (const [vista, tam] of Object.entries(VISTAS)) {
    for (const tema of TEMAS) {
      const ctx = await navegador.newContext({
        viewport: tam,
        deviceScaleFactor: 2,
        isMobile: vista === "movil",
        hasTouch: vista === "movil",
        colorScheme: tema === "oscuro" ? "dark" : "light",
        reducedMotion: "reduce",
        locale: "es-CO",
        timezoneId: "America/Bogota",
      });
      await ctx.addInitScript((t) => localStorage.setItem("tema", t), tema);

      const tomar = async (pagina, nombre, { completa = false } = {}) => {
        await pagina.evaluate(() => document.fonts.ready);
        await pagina.waitForTimeout(500);
        const archivo = `${salida}${nombre}-${vista}-${tema}.png`;
        if (completa && vista === "movil") {
          await pagina.screenshot({ path: archivo.replace(".png", "-pliegue.png") });
          const alto = await pagina.evaluate(() => document.documentElement.scrollHeight);
          await pagina.setViewportSize({ width: tam.width, height: Math.min(alto, 2400) });
          await pagina.waitForTimeout(300);
        }
        await pagina.screenshot({ path: archivo });
        console.log("ok", archivo.replace(salida, "fase5/"));
        await pagina.setViewportSize(tam);
      };

      // login: sin sesión
      let p = await ctx.newPage();
      await p.goto(`${base}/login`, { waitUntil: "networkidle" });
      await tomar(p, "login", { completa: true });
      await p.close();

      // pantallas autenticadas: la sesión se siembra en sessionStorage
      await ctx.addInitScript((s) => sessionStorage.setItem("sesion", JSON.stringify(s)), sesion);

      p = await ctx.newPage();
      await p.goto(`${base}/inscripcion`, { waitUntil: "networkidle" });
      await p.getByRole("button", { name: /ISUMBG103/ }).click();
      const tarjeta = p.getByRole("button", { name: /^\d{5}/, pressed: false }).first();
      await tarjeta.click();
      await p.waitForTimeout(300);
      await tomar(p, "inscripcion", { completa: true });
      await p.close();

      p = await ctx.newPage();
      await p.goto(`${base}/horario`, { waitUntil: "networkidle" });
      await p.getByRole("heading", { name: "Tu semana" }).waitFor();
      await tomar(p, "horario", { completa: true });
      await p.close();

      p = await ctx.newPage();
      await p.goto(`${base}/coordinacion/analitica`, { waitUntil: "networkidle" });
      await p.getByRole("heading", { name: "Analítica de coordinación" }).waitFor();
      await tomar(p, "analitica");
      await p.close();

      await ctx.close();
    }
  }
} finally {
  await navegador.close();
}
