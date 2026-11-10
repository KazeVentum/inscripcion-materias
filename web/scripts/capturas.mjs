// Capturas de verificación visual de la fase 4 desde storybook-static (sin servidor de SB).
// Uso: npm run build-storybook && npm run screenshots
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const raiz = fileURLToPath(new URL("../storybook-static/", import.meta.url));
const salida = fileURLToPath(new URL("../tests/screenshots/fase4/", import.meta.url));
const tipos = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".png": "image/png",
};

const servidor = createServer(async (req, res) => {
  const ruta = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  const archivo = normalize(join(raiz, ruta === "/" ? "index.html" : ruta));
  if (!archivo.startsWith(raiz)) return res.writeHead(403).end();
  try {
    const datos = await readFile(archivo);
    res.writeHead(200, { "content-type": tipos[extname(archivo)] ?? "application/octet-stream" });
    res.end(datos);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
const { port } = servidor.address();

const VIEW = { movil: { width: 390, height: 844 }, escritorio: { width: 1440, height: 900 } };
const TEMAS = ["claro", "oscuro"];
const objetivos = [
  { nombre: "composicion", id: "composición-inscripción--movil-claro", pantalla: true },
  { nombre: "barra-cupos", id: "dominio-barracupos--niveles" },
  { nombre: "tarjeta-nrc", id: "dominio-tarjetanrc--galeria" },
  { nombre: "bloque-calendario", id: "dominio-bloquecalendario--estados" },
  { nombre: "calendario-semanal", id: "dominio-calendariosemanal--compacta" },
];

await mkdir(salida, { recursive: true });
const navegador = await chromium.launch();
try {
  for (const o of objetivos) {
    for (const [vista, tam] of Object.entries(VIEW)) {
      for (const tema of TEMAS) {
        const id = o.pantalla ? `composición-inscripción--${vista}-${tema}` : o.id;
        const pagina = await navegador.newPage({ viewport: tam, deviceScaleFactor: 2 });
        await pagina.emulateMedia({ reducedMotion: "reduce" });
        const url = `http://127.0.0.1:${port}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story&globals=theme:${tema}`;
        await pagina.goto(url, { waitUntil: "networkidle" });
        await pagina.waitForSelector("#storybook-root > *");
        await pagina.evaluate(() => document.fonts.ready);
        await pagina.waitForTimeout(400);
        const archivo = join(salida, `${o.nombre}-${vista}-${tema}.png`);
        if (o.pantalla && vista === "movil") {
          // Lo que se ve al abrir (390 × 844) y la página completa. Para la completa se
          // estira el viewport: así la bandeja fija queda abajo y no a media página.
          await pagina.screenshot({ path: archivo.replace(".png", "-pliegue.png") });
          const alto = await pagina.evaluate(() => document.documentElement.scrollHeight);
          await pagina.setViewportSize({ width: tam.width, height: alto });
          await pagina.waitForTimeout(300);
          await pagina.screenshot({ path: archivo });
        } else if (o.pantalla) {
          await pagina.screenshot({ path: archivo });
        } else {
          await pagina.locator("#storybook-root").screenshot({ path: archivo });
        }
        await pagina.close();
        console.log("✓", archivo.replace(salida, "tests/screenshots/fase4/"));
      }
    }
  }
} finally {
  await navegador.close();
  servidor.close();
}
