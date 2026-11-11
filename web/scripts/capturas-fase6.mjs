// Capturas de la fase 6 contra la app levantada (make up, datos simulados y gold calculado).
// Uso: DEMO_PASSWORD=... node scripts/capturas-fase6.mjs   (make screenshots-fase6 lo carga de .env)
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const base = process.env.WEB_URL ?? "http://localhost:3000";
const clave = process.env.DEMO_PASSWORD;
if (!clave) throw new Error("Falta DEMO_PASSWORD");
const salida = fileURLToPath(new URL("../tests/screenshots/fase6/", import.meta.url));
await mkdir(salida, { recursive: true });

const VISTAS = {
  movil: { width: 390, height: 844 },
  escritorio: { width: 1440, height: 900 },
};

async function sesion(usuario) {
  const r = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ usuario, password: clave }),
  });
  const d = await r.json();
  return {
    token: d.accessToken,
    estudianteId: d.estudianteId,
    rol: d.rol,
    expiraEn: Date.now() + d.expiraEnS * 1000,
  };
}

const navegador = await chromium.launch();
const coord = await sesion("coord-0001");
try {
  for (const [vista, tam] of Object.entries(VISTAS)) {
    for (const tema of ["claro", "oscuro"]) {
      const ctx = await navegador.newContext({
        viewport: tam,
        deviceScaleFactor: vista === "movil" ? 2 : 1,
        isMobile: vista === "movil",
        hasTouch: vista === "movil",
        colorScheme: tema === "oscuro" ? "dark" : "light",
        reducedMotion: "reduce",
        locale: "es-CO",
        timezoneId: "America/Bogota",
      });
      await ctx.addInitScript((t) => localStorage.setItem("tema", t), tema);
      const tomar = async (p, nombre) => {
        await p.evaluate(() => document.fonts.ready);
        await p.waitForTimeout(500);
        const alto = await p.evaluate(() => document.documentElement.scrollHeight);
        await p.setViewportSize({ width: tam.width, height: Math.min(alto, 4200) });
        await p.waitForTimeout(300);
        const archivo = `${salida}${nombre}-${vista}-${tema}.png`;
        await p.screenshot({ path: archivo });
        console.log("ok", archivo.replace(salida, "fase6/"));
        await p.setViewportSize(tam);
      };

      let p = await ctx.newPage();
      await p.goto(`${base}/login`, { waitUntil: "networkidle" });
      await p.getByLabel("Estudiante o correo").fill("coord-0001");
      await tomar(p, "login-coordinador");
      await p.close();

      await ctx.addInitScript((s) => sessionStorage.setItem("sesion", JSON.stringify(s)), coord);
      p = await ctx.newPage();
      await p.goto(`${base}/coordinacion/analitica`, { waitUntil: "networkidle" });
      await p.getByText("Conteos bronce → plata → oro cuadran").waitFor();
      await p.getByRole("heading", { name: "Dónde abrir más grupos" }).waitFor();
      await p.getByText(/Mostrando \d+ de/).waitFor();
      await tomar(p, "analitica");
      await p.close();
      await ctx.close();
    }
  }
} finally {
  await navegador.close();
}
