/**
 * Lectura de tokens.css y cálculo de contraste WCAG 2.x (luminancia relativa).
 * Lo usa la prueba automática; no se importa desde componentes.
 */

export type Rgba = { r: number; g: number; b: number; a: number };
export type Tema = Record<string, string>;
export type Par = {
  tipo: "texto" | "ui";
  frente: string;
  fondo: string;
  sobre: string | null;
};

const DECL = /(--[\w-]+)\s*:\s*([^;]+);/g;

function declaraciones(cuerpo: string): Tema {
  const out: Tema = {};
  for (const m of cuerpo.matchAll(DECL)) {
    const [, nombre, valor] = m;
    if (nombre && valor) out[nombre] = valor.trim();
  }
  return out;
}

/** Devuelve el cuerpo `{ … }` de la primera regla cuyo selector empieza en `inicio`. */
function cuerpoDe(css: string, inicio: number): string {
  const abre = css.indexOf("{", inicio);
  let nivel = 0;
  for (let i = abre; i < css.length; i++) {
    if (css[i] === "{") nivel++;
    else if (css[i] === "}") {
      nivel--;
      if (nivel === 0) return css.slice(abre + 1, i);
    }
  }
  throw new Error("Regla sin cerrar en tokens.css");
}

export function leerTemas(css: string): { claro: Tema; oscuro: Tema; oscuroPreferencia: Tema } {
  const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const iClaro = sinComentarios.indexOf(':root,\n[data-theme="light"]');
  const iPref = sinComentarios.indexOf(':root:not([data-theme="light"])');
  const iOscuro = sinComentarios.search(/^\[data-theme="dark"\]\s*\{/m);
  if (iClaro < 0 || iPref < 0 || iOscuro < 0) {
    throw new Error("tokens.css no tiene los tres bloques de tema esperados");
  }
  return {
    claro: declaraciones(cuerpoDe(sinComentarios, iClaro)),
    oscuroPreferencia: declaraciones(cuerpoDe(sinComentarios, iPref)),
    oscuro: declaraciones(cuerpoDe(sinComentarios, iOscuro)),
  };
}

export function leerPares(css: string): Par[] {
  const re = /@par\s+(texto|ui)\s+(--[\w-]+)\s*\/\s*(--[\w-]+)(?:\s+sobre\s+(--[\w-]+))?/g;
  return [...css.matchAll(re)].map((m) => ({
    tipo: m[1] as Par["tipo"],
    frente: m[2] ?? "",
    fondo: m[3] ?? "",
    sobre: m[4] ?? null,
  }));
}

export function parsearColor(valor: string): Rgba {
  const v = valor.trim().toLowerCase();
  const hex = /^#([0-9a-f]{6})$/.exec(v);
  if (hex?.[1]) {
    const n = parseInt(hex[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[/,]\s*([\d.]+)(%?))?\s*\)$/.exec(v);
  if (rgb) {
    const alfa = rgb[4] === undefined ? 1 : Number(rgb[4]) / (rgb[5] === "%" ? 100 : 1);
    return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]), a: alfa };
  }
  throw new Error(`Color no soportado en tokens.css: ${valor}`);
}

/** Resuelve un token (sigue `var(--x)`) a color. */
export function resolver(tema: Tema, token: string, pasos = 0): Rgba {
  const valor = tema[token];
  if (valor === undefined) throw new Error(`Token ${token} no existe en el tema`);
  const ref = /^var\((--[\w-]+)\)$/.exec(valor);
  if (ref?.[1]) {
    if (pasos > 5) throw new Error(`Referencia circular en ${token}`);
    return resolver(tema, ref[1], pasos + 1);
  }
  return parsearColor(valor);
}

export function componer(arriba: Rgba, abajo: Rgba): Rgba {
  const a = arriba.a;
  return {
    r: arriba.r * a + abajo.r * (1 - a),
    g: arriba.g * a + abajo.g * (1 - a),
    b: arriba.b * a + abajo.b * (1 - a),
    a: 1,
  };
}

function canal(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminancia({ r, g, b }: Rgba): number {
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

export function contraste(a: Rgba, b: Rgba): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function contrastePar(tema: Tema, par: Par): number {
  let fondo = resolver(tema, par.fondo);
  if (fondo.a < 1) {
    if (!par.sobre) throw new Error(`${par.fondo} es translúcido: declara "sobre <token>"`);
    fondo = componer(fondo, resolver(tema, par.sobre));
  }
  let frente = resolver(tema, par.frente);
  if (frente.a < 1) frente = componer(frente, fondo);
  return contraste(frente, fondo);
}

export const MINIMO = { texto: 4.5, ui: 3 } as const;
