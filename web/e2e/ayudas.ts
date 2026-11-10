import { execFileSync } from "node:child_process";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const PERIODO = process.env.PERIODO ?? "2027-1";
const RAIZ = new URL("../../", import.meta.url).pathname;

/** La clave de demo viene del entorno (make e2e carga .env); nunca va escrita en el repo. */
export function clave(): string {
  const c = process.env.DEMO_PASSWORD;
  if (!c) throw new Error("Falta DEMO_PASSWORD en el entorno (make e2e la carga desde .env).");
  return c;
}

export interface NrcApi {
  nrc: string;
  materiaId: string;
  titulo: string;
  cupoTotal: number;
  cuposLibres: number;
  franja: string;
  bloques: { dia: string; inicio: string; fin: string }[];
}

/** Cliente directo de la API (mismo origen que la web: pasa por el rewrite de Next). */
export class ApiUsuario {
  private constructor(
    private readonly req: APIRequestContext,
    readonly id: string,
    readonly token: string,
  ) {}

  static async entrar(req: APIRequestContext, id: string) {
    const r = await req.post("/api/v1/auth/login", { data: { usuario: id, password: clave() } });
    expect(r.ok(), `login de ${id}`).toBeTruthy();
    return new ApiUsuario(req, id, ((await r.json()) as { accessToken: string }).accessToken);
  }

  private h() {
    return { Authorization: `Bearer ${this.token}` };
  }
  async materias() {
    const r = await this.req.get("/api/v1/materias/habilitadas", { headers: this.h() });
    return (await r.json()) as {
      materiaId: string;
      nombre: string;
      estado: string;
      nrcDisponibles: number;
    }[];
  }
  async nrcDe(materiaId: string) {
    const r = await this.req.get(`/api/v1/materias/${materiaId}/nrc`, { headers: this.h() });
    return (await r.json()) as NrcApi[];
  }
  async avance() {
    const r = await this.req.get("/api/v1/avance", { headers: this.h() });
    return (await r.json()) as {
      semestreActual: number;
      totalPendientes: number;
      inscritas: number;
      faltan: number;
      mensaje: string;
      materias: { materiaId: string; nombre: string; estado: string }[];
      atrasadas: { materiaId: string; nombre: string; estado: string }[];
    };
  }
  async perfil() {
    const r = await this.req.get("/api/v1/me", { headers: this.h() });
    return (await r.json()) as { jornada: "noche" | "tarde" };
  }
  async horario() {
    const r = await this.req.get("/api/v1/horario", { headers: this.h() });
    return (await r.json()) as {
      inscripciones: (NrcApi & { estado: string })[];
    };
  }
  async inscribir(nrc: string) {
    return this.req.post("/api/v1/inscripciones", { headers: this.h(), data: { nrc } });
  }
  async cancelar(nrc: string) {
    return this.req.delete(`/api/v1/inscripciones/${nrc}`, { headers: this.h() });
  }
  async estado(nrc: string) {
    const r = await this.req.get(`/api/v1/inscripciones/${nrc}`, { headers: this.h() });
    return r.ok() ? ((await r.json()) as { estado: string }).estado : null;
  }
  /** Espera a que el worker confirme (o rechace) la reserva. */
  async esperarConfirmada(nrc: string) {
    await expect.poll(() => this.estado(nrc), { timeout: 20_000 }).toBe("confirmada");
  }
}

const redisCli = (...args: string[]) =>
  execFileSync("docker", ["compose", "exec", "-T", "redis", "redis-cli", ...args], {
    cwd: RAIZ,
    encoding: "utf8",
  }).trim();

/** Manipula cupos como lo haría otro estudiante (E2E contra el stack real, sin tocar código). */
export const redis = {
  cupos: (nrc: string) => Number(redisCli("GET", `cupos:${PERIODO}:${nrc}`)),
  fijarCupos: (nrc: string, n: number) => redisCli("SET", `cupos:${PERIODO}:${nrc}`, String(n)),
  /** Mismo mensaje que publican los Lua: la API lo reenvía por SSE. */
  publicar: (nrc: string, libres: number) =>
    redisCli("PUBLISH", `cupos:${PERIODO}`, JSON.stringify({ nrc, libres })),
};

export async function entrarPorUi(page: Page, usuario: string) {
  await page.goto("/login");
  await page.getByLabel("Estudiante o correo").fill(usuario);
  await page.getByLabel("Contraseña", { exact: true }).fill(clave());
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/inscripcion/);
}

/** Abre una materia de la lista (acordeón) por su nombre. */
export async function abrirMateria(page: Page, nombre: string | RegExp) {
  const fila = page.getByRole("button", { name: nombre });
  await fila.first().click();
  await expect(fila.first()).toHaveAttribute("aria-expanded", "true");
}

/** Cancela por API todo lo que el estudiante tenga en estas materias (limpieza). */
export async function cancelarMaterias(u: ApiUsuario, materiaIds: string[]) {
  const h = await u.horario();
  for (const i of h.inscripciones) if (materiaIds.includes(i.materiaId)) await u.cancelar(i.nrc);
}

/** NRC de una materia tal como están en el sistema académico (Mongo), sin ningún filtro. */
export function catalogoMongo(materiaId: string): NrcApi[] {
  const salida = execFileSync(
    "docker",
    [
      "compose",
      "exec",
      "-T",
      "mongo",
      "mongosh",
      "inscripcion",
      "--quiet",
      "--eval",
      `print(JSON.stringify(db.nrc.find({materiaId: ${JSON.stringify(materiaId)}}).toArray()))`,
    ],
    { cwd: RAIZ, encoding: "utf8" },
  );
  return JSON.parse(salida) as NrcApi[];
}

/**
 * Elige de la API un NRC que ambos estudiantes pueden inscribir (el "último cupo") en una
 * materia donde `yo` tiene además otro grupo disponible (la alternativa). Nada quemado.
 */
export async function elegirMateriaDuelo(rival: ApiUsuario, yo: ApiUsuario, preferida: string) {
  const [a, b] = await Promise.all([rival.materias(), yo.materias()]);
  const comunes = a
    .filter(
      (m) =>
        m.estado === "pendiente" &&
        b.some((x) => x.materiaId === m.materiaId && x.estado === "pendiente"),
    )
    .map((m) => m.materiaId)
    .sort((x, y) => Number(y === preferida) - Number(x === preferida));
  for (const materiaId of comunes) {
    try {
      return { materiaId, ...(await elegirDuelo(rival, yo, materiaId)) };
    } catch {
      // esa materia no tiene un NRC común con alternativa en ambas jornadas/horarios: probar otra
    }
  }
  throw new Error("Sin materia con NRC común y alternativa para el duelo: ¿make seed?");
}

export async function elegirDuelo(rival: ApiUsuario, yo: ApiUsuario, materiaId: string) {
  const [delRival, mios] = await Promise.all([rival.nrcDe(materiaId), yo.nrcDe(materiaId)]);
  const comunes = mios.filter((n) => delRival.some((r) => r.nrc === n.nrc));
  const ultimo = comunes.find((n) => mios.some((m) => m.nrc !== n.nrc && m.cuposLibres > 0));
  if (!ultimo) throw new Error(`Sin NRC común con alternativa en ${materiaId}: ¿make seed?`);
  return { ultimo: ultimo.nrc, titulo: ultimo.titulo };
}
