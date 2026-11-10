import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/cliente";
import { StreamCupos, parsearCupo, type FuenteEventos } from "./cuposEnVivo";

class FuenteFalsa implements FuenteEventos {
  static todas: FuenteFalsa[] = [];
  onopen: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  cerrada = false;
  private oyentes = new Map<string, ((e: MessageEvent<string>) => void)[]>();
  constructor(readonly url: string) {
    FuenteFalsa.todas.push(this);
  }
  addEventListener(tipo: string, fn: (e: MessageEvent<string>) => void) {
    this.oyentes.set(tipo, [...(this.oyentes.get(tipo) ?? []), fn]);
  }
  close() {
    this.cerrada = true;
  }
  abrir() {
    this.onopen?.(new Event("open"));
  }
  emitir(tipo: string, data: string) {
    for (const fn of this.oyentes.get(tipo) ?? []) fn({ data } as MessageEvent<string>);
  }
  fallar() {
    this.onerror?.(new Event("error"));
  }
}

async function vaciar() {
  await vi.advanceTimersByTimeAsync(0);
}

function armar(pedirTicket = vi.fn(async () => `tk-${FuenteFalsa.todas.length}`)) {
  const onCupo = vi.fn();
  const onEstado = vi.fn();
  const onResincronizar = vi.fn();
  const onSesionExpirada = vi.fn();
  const stream = new StreamCupos({
    pedirTicket,
    crearFuente: (u) => new FuenteFalsa(u),
    onCupo,
    onEstado,
    onResincronizar,
    onSesionExpirada,
    espera: (n) => 1000 * (n + 1),
    ahora: () => Date.now(),
  });
  return { stream, pedirTicket, onCupo, onEstado, onResincronizar, onSesionExpirada };
}

const ultimoEstado = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls.at(-1)?.[0];

describe("parsearCupo", () => {
  it("acepta {nrc, libres} y normaliza", () => {
    expect(parsearCupo('{"nrc":"80852","libres":3}')).toEqual({ nrc: "80852", libres: 3 });
    expect(parsearCupo('{"nrc":80852,"libres":-2}')).toEqual({ nrc: "80852", libres: 0 });
  });
  it("descarta lo malformado", () => {
    expect(parsearCupo("no json")).toBeNull();
    expect(parsearCupo('{"nrc":"1"}')).toBeNull();
    expect(parsearCupo('{"libres":2}')).toBeNull();
    expect(parsearCupo('{"nrc":"1","libres":"2"}')).toBeNull();
  });
});

describe("StreamCupos", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FuenteFalsa.todas = [];
  });
  afterEach(() => vi.useRealTimers());

  it("pide ticket y abre EventSource con ?ticket=, sin JWT", async () => {
    const { stream, pedirTicket, onEstado } = armar(vi.fn(async () => "ticket 1/2"));
    stream.iniciar();
    await vaciar();
    expect(pedirTicket).toHaveBeenCalledTimes(1);
    expect(FuenteFalsa.todas[0]?.url).toBe("/api/v1/stream/cupos?ticket=ticket%201%2F2");
    expect(ultimoEstado(onEstado)).toBe("reconectando");
    FuenteFalsa.todas[0]?.abrir();
    expect(ultimoEstado(onEstado)).toBe("en-vivo");
  });

  it("entrega cada evento cupo y descarta los malformados", async () => {
    const { stream, onCupo } = armar();
    stream.iniciar();
    await vaciar();
    const f = FuenteFalsa.todas[0]!;
    f.abrir();
    f.emitir("cupo", '{"nrc":"80852","libres":0}');
    f.emitir("cupo", "basura");
    expect(onCupo).toHaveBeenCalledTimes(1);
    expect(onCupo).toHaveBeenCalledWith({ nrc: "80852", libres: 0 });
  });

  it("al caer cierra la fuente, pide ticket NUEVO y reconecta con espera; luego resincroniza", async () => {
    let n = 0;
    const { stream, pedirTicket, onEstado, onResincronizar } = armar(vi.fn(async () => `t${++n}`));
    stream.iniciar();
    await vaciar();
    FuenteFalsa.todas[0]!.abrir();
    FuenteFalsa.todas[0]!.fallar();
    expect(FuenteFalsa.todas[0]?.cerrada).toBe(true);
    expect(ultimoEstado(onEstado)).toBe("reconectando");

    await vi.advanceTimersByTimeAsync(999);
    expect(pedirTicket).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(pedirTicket).toHaveBeenCalledTimes(2);
    expect(FuenteFalsa.todas[1]?.url).toContain("ticket=t2");

    FuenteFalsa.todas[1]!.abrir();
    expect(ultimoEstado(onEstado)).toBe("en-vivo");
    expect(onResincronizar).toHaveBeenCalledTimes(1);
  });

  it("tras dos fallos seguidos declara sin conexión y sigue intentando", async () => {
    const { stream, onEstado } = armar();
    stream.iniciar();
    await vaciar();
    FuenteFalsa.todas[0]!.fallar();
    expect(ultimoEstado(onEstado)).toBe("reconectando");
    await vi.advanceTimersByTimeAsync(1000);
    FuenteFalsa.todas[1]!.fallar();
    expect(ultimoEstado(onEstado)).toBe("sin-conexion");
    await vi.advanceTimersByTimeAsync(2000);
    expect(FuenteFalsa.todas).toHaveLength(3);
  });

  it("recuerda el último dato bueno al caer", async () => {
    vi.setSystemTime(new Date("2026-11-10T15:00:00Z"));
    const { stream, onEstado } = armar();
    stream.iniciar();
    await vaciar();
    FuenteFalsa.todas[0]!.abrir();
    vi.setSystemTime(new Date("2026-11-10T15:00:40Z"));
    FuenteFalsa.todas[0]!.fallar();
    expect(onEstado.mock.calls.at(-1)?.[1]).toEqual({
      ultimaActualizacion: Date.parse("2026-11-10T15:00:40Z"),
    });
  });

  it("401 al pedir ticket: avisa que la sesión venció y no reintenta", async () => {
    const pedir = vi.fn(async () => {
      throw new ApiError(401, { codigo: "token_expirado", mensaje: "vencido" });
    });
    const { stream, onSesionExpirada } = armar(pedir);
    stream.iniciar();
    await vaciar();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onSesionExpirada).toHaveBeenCalledTimes(1);
    expect(pedir).toHaveBeenCalledTimes(1);
    expect(FuenteFalsa.todas).toHaveLength(0);
  });

  it("el evento sesion_expirada del servidor renueva con un ticket nuevo", async () => {
    const { stream, pedirTicket } = armar();
    stream.iniciar();
    await vaciar();
    FuenteFalsa.todas[0]!.abrir();
    FuenteFalsa.todas[0]!.emitir("sesion_expirada", "{}");
    await vaciar();
    expect(pedirTicket).toHaveBeenCalledTimes(2);
    expect(FuenteFalsa.todas[0]?.cerrada).toBe(true);
  });

  it("marcarSinRed cierra y reintentarYa reconecta sin esperar", async () => {
    const { stream, pedirTicket, onEstado } = armar();
    stream.iniciar();
    await vaciar();
    FuenteFalsa.todas[0]!.abrir();
    stream.marcarSinRed();
    expect(ultimoEstado(onEstado)).toBe("sin-conexion");
    expect(FuenteFalsa.todas[0]?.cerrada).toBe(true);
    stream.reintentarYa();
    await vaciar();
    expect(pedirTicket).toHaveBeenCalledTimes(2);
    FuenteFalsa.todas[1]!.abrir();
    expect(ultimoEstado(onEstado)).toBe("en-vivo");
  });

  it("detener cierra la fuente y cancela reintentos pendientes", async () => {
    const { stream, pedirTicket } = armar();
    stream.iniciar();
    await vaciar();
    FuenteFalsa.todas[0]!.fallar();
    stream.detener();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(pedirTicket).toHaveBeenCalledTimes(1);
    expect(FuenteFalsa.todas[0]?.cerrada).toBe(true);
  });

  it("ignora eventos de una fuente anterior", async () => {
    const { stream, onCupo } = armar();
    stream.iniciar();
    await vaciar();
    const vieja = FuenteFalsa.todas[0]!;
    vieja.fallar();
    await vi.advanceTimersByTimeAsync(1000);
    vieja.emitir("cupo", '{"nrc":"1","libres":1}');
    expect(onCupo).not.toHaveBeenCalled();
  });

  it("watchdog: sin eventos en 35 s cierra y reconecta con ticket nuevo; un ping lo reinicia", async () => {
    const { stream, pedirTicket, onEstado } = armar();
    stream.iniciar();
    await vaciar();
    const f = FuenteFalsa.todas[0]!;
    f.abrir();
    await vi.advanceTimersByTimeAsync(30_000);
    f.emitir("ping", "{}");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f.cerrada).toBe(false); // el ping reinició la cuenta
    await vi.advanceTimersByTimeAsync(5_001);
    expect(f.cerrada).toBe(true);
    expect(ultimoEstado(onEstado)).toBe("reconectando");
    await vi.advanceTimersByTimeAsync(1000);
    expect(pedirTicket).toHaveBeenCalledTimes(2);
  });
});
