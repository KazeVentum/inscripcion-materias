/** Formatos de la analítica: es-CO, deterministas (sin depender de los datos ICU del entorno). */

const NBSP = " ";

/** 5616 -> "5.616"; agrupa miles con punto y usa coma decimal. */
export function numero(n: number, decimales = 0): string {
  const [ent = "0", dec] = Math.abs(n).toFixed(decimales).split(".");
  const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 ? "-" : ""}${miles}${dec ? `,${dec}` : ""}`;
}

/** 0.836 -> "83,6 %". */
export function porcentaje(x: number | null | undefined, decimales = 1): string {
  if (x === null || x === undefined) return "—";
  const v = (x * 100).toFixed(decimales);
  return `${v.replace(".", ",").replace(/,0+$/, "")}${NBSP}%`;
}

/** Milisegundos: 0.4 -> "< 1 ms", 1 -> "1 ms", 6.6 -> "6,6 ms", 1200 -> "1,2 s". */
export function latencia(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms >= 1000) return `${numero(ms / 1000, 1).replace(/,0$/, "")}${NBSP}s`;
  if (ms > 0 && ms < 1) return `< 1${NBSP}ms`;
  const t = ms < 10 ? numero(ms, 1).replace(/,0$/, "") : numero(Math.round(ms));
  return `${t}${NBSP}ms`;
}

/** Segundos: 6.06 -> "6 s", 252 -> "4 min 12 s", 7300 -> "2 h 1 min". null -> "—". */
export function duracion(s: number | null | undefined): string {
  if (s === null || s === undefined) return "—";
  const t = Math.round(s);
  if (t < 60) return `${t}${NBSP}s`;
  if (t < 3600) {
    const m = Math.floor(t / 60);
    const r = t % 60;
    return r ? `${m}${NBSP}min ${r}${NBSP}s` : `${m}${NBSP}min`;
  }
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  return m ? `${h}${NBSP}h ${m}${NBSP}min` : `${h}${NBSP}h`;
}

/** "hace 3 min", "hace 2 h", "hace un momento". */
export function hace(iso: string, ahoraMs: number): string {
  const s = Math.max(0, Math.round((ahoraMs - Date.parse(iso)) / 1000));
  if (s < 45) return "hace un momento";
  if (s < 3600) return `hace ${Math.max(1, Math.round(s / 60))}${NBSP}min`;
  if (s < 86_400) return `hace ${Math.round(s / 3600)}${NBSP}h`;
  const d = Math.round(s / 86_400);
  return `hace ${d}${d === 1 ? " día" : " días"}`;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** ISO UTC -> "10 nov, 11:44 a. m." en hora de Bogotá (UTC-5, sin horario de verano). */
export function fechaHoraBogota(iso: string): string {
  const d = new Date(Date.parse(iso) - 5 * 3600_000);
  const h = d.getUTCHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}, ${h12}:${mm}${NBSP}${h < 12 ? "a. m." : "p. m."}`;
}
