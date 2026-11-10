import { ApiError } from "@/lib/api/cliente";
import type { EventoCupo } from "@/lib/tipos";
import type { EstadoConexion } from "@/components/dominio/IndicadorEnVivo";

/** Lo mínimo de EventSource que usamos (y que las pruebas reemplazan). */
export interface FuenteEventos {
  onopen: ((e: Event) => void) | null;
  onerror: ((e: Event) => void) | null;
  addEventListener(tipo: string, fn: (e: MessageEvent<string>) => void): void;
  close(): void;
}

export interface OpcionesStream {
  /** POST /stream/ticket. El JWT nunca va en la URL: solo este ticket de 60 s. */
  pedirTicket: () => Promise<string>;
  crearFuente?: (url: string) => FuenteEventos;
  url?: string;
  onCupo: (e: EventoCupo) => void;
  onEstado: (estado: EstadoConexion, info: { ultimaActualizacion: number | null }) => void;
  /** Se conectó de nuevo tras una caída: pueden haberse perdido eventos. */
  onResincronizar?: () => void;
  /** El ticket respondió 401: la sesión venció. */
  onSesionExpirada?: () => void;
  /** Espera (ms) antes del intento n (0, 1, 2…). */
  espera?: (intento: number) => number;
  /** Intentos fallidos seguidos tras los que se declara "sin conexión". */
  intentosParaSinConexion?: number;
  ahora?: () => number;
}

export function esperaExponencial(intento: number): number {
  return Math.min(1000 * 2 ** intento, 15_000);
}

/** Valida el cuerpo de `event: cupo`; descarta lo que no sea {nrc, libres}. */
export function parsearCupo(datos: string): EventoCupo | null {
  try {
    const v = JSON.parse(datos) as Partial<EventoCupo>;
    if (typeof v.nrc !== "string" && typeof v.nrc !== "number") return null;
    if (typeof v.libres !== "number" || !Number.isFinite(v.libres)) return null;
    return { nrc: String(v.nrc), libres: Math.max(0, Math.trunc(v.libres)) };
  } catch {
    return null;
  }
}

/**
 * Cupos en vivo por SSE con reconexión propia. EventSource reintenta solo, pero con la
 * misma URL, y el ticket (60 s, un solo uso de sesión) ya no sirve: cada intento pide uno
 * nuevo. Tras una caída pide resincronizar la caché, porque Pub/Sub no reenvía lo perdido.
 */
export class StreamCupos {
  private fuente: FuenteEventos | null = null;
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private intentos = 0;
  private activo = false;
  /** Hubo conexión previa o intentos fallidos: al volver, la caché puede estar vieja. */
  private necesitaResync = false;
  private ultima: number | null = null;
  private estado: EstadoConexion = "reconectando";
  private generacion = 0;
  private readonly o: Required<
    Pick<OpcionesStream, "url" | "espera" | "intentosParaSinConexion" | "ahora">
  > &
    OpcionesStream;

  constructor(opciones: OpcionesStream) {
    this.o = {
      url: "/api/v1/stream/cupos",
      espera: esperaExponencial,
      intentosParaSinConexion: 2,
      ahora: () => Date.now(),
      ...opciones,
    };
  }

  iniciar(): void {
    if (this.activo) return;
    this.activo = true;
    this.cambiar("reconectando");
    void this.conectar();
  }

  detener(): void {
    this.activo = false;
    this.generacion++;
    this.limpiar();
  }

  /** Reconecta ya (volvió la red); no espera el temporizador. */
  reintentarYa(): void {
    if (!this.activo || this.estado === "en-vivo") return;
    this.limpiar();
    this.intentos = 0;
    this.cambiar("reconectando");
    void this.conectar();
  }

  /** La red se cayó según el navegador. */
  marcarSinRed(): void {
    if (!this.activo) return;
    this.limpiar();
    this.perdida();
    this.cambiar("sin-conexion");
  }

  private limpiar(): void {
    if (this.temporizador !== null) clearTimeout(this.temporizador);
    this.temporizador = null;
    this.fuente?.close();
    this.fuente = null;
  }

  private cambiar(e: EstadoConexion): void {
    this.estado = e;
    this.o.onEstado(e, { ultimaActualizacion: this.ultima });
  }

  private perdida(): void {
    // El último dato bueno es el de justo antes de caer.
    if (this.estado === "en-vivo") this.ultima = this.o.ahora();
  }

  private async conectar(): Promise<void> {
    const gen = ++this.generacion;
    let ticket: string;
    try {
      ticket = await this.o.pedirTicket();
    } catch (e) {
      if (gen !== this.generacion || !this.activo) return;
      if (e instanceof ApiError && e.status === 401) {
        this.activo = false;
        this.o.onSesionExpirada?.();
        return;
      }
      this.fallo();
      return;
    }
    if (gen !== this.generacion || !this.activo) return;

    const crear = this.o.crearFuente ?? ((u: string) => new EventSource(u) as FuenteEventos);
    const fuente = crear(`${this.o.url}?ticket=${encodeURIComponent(ticket)}`);
    this.fuente = fuente;
    fuente.onopen = () => {
      if (gen !== this.generacion) return;
      const recuperada = this.necesitaResync;
      this.necesitaResync = false;
      this.intentos = 0;
      this.ultima = this.o.ahora();
      this.cambiar("en-vivo");
      if (recuperada) this.o.onResincronizar?.();
    };
    fuente.addEventListener("cupo", (m) => {
      if (gen !== this.generacion) return;
      const cupo = parsearCupo(m.data);
      if (!cupo) return;
      this.ultima = this.o.ahora();
      this.o.onCupo(cupo);
    });
    fuente.addEventListener("sesion_expirada", () => {
      if (gen !== this.generacion) return;
      // El servidor cierra al vencer la sesión: un ticket nuevo dirá si sigue vigente.
      this.limpiar();
      this.necesitaResync = true;
      this.perdida();
      void this.conectar();
    });
    fuente.onerror = () => {
      if (gen !== this.generacion) return;
      // Se cierra para que el navegador no reintente con el ticket vencido.
      this.limpiar();
      this.perdida();
      this.fallo();
    };
  }

  private fallo(): void {
    if (!this.activo) return;
    this.necesitaResync = true;
    const sinRed = typeof navigator !== "undefined" && navigator.onLine === false;
    this.cambiar(
      sinRed || this.intentos + 1 >= this.o.intentosParaSinConexion
        ? "sin-conexion"
        : "reconectando",
    );
    const espera = this.o.espera(this.intentos++);
    this.temporizador = setTimeout(() => {
      this.temporizador = null;
      void this.conectar();
    }, espera);
  }
}
