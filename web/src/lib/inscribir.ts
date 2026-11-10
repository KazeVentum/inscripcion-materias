import { ApiError, ErrorRed } from "@/lib/api/cliente";
import { cruzan, diaLargo } from "./horario";
import type { EstadoInscripcionOut, HorarioOut, NrcOut } from "./tipos";

export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(id);
        reject(new DOMException("Cancelado", "AbortError"));
      },
      { once: true },
    );
  });

export interface OpcionesEspera {
  consultar: (nrc: string, signal?: AbortSignal) => Promise<EstadoInscripcionOut>;
  intervaloMs?: number;
  /** Tope de espera: la reserva dura 5 min y la conciliación corre cada 30 s. */
  maxMs?: number;
  /** Fallos de red/5xx seguidos que se toleran antes de rendirse. */
  maxFallos?: number;
  signal?: AbortSignal;
  esperar?: (ms: number, signal?: AbortSignal) => Promise<void>;
  ahora?: () => number;
}

/**
 * Consulta GET /inscripciones/{nrc} hasta que la reserva deja de estarlo.
 * Devuelve el estado terminal (confirmada | rechazada | cancelada) o `null` si se agotó el
 * tiempo (la pantalla sigue con la caché de /horario).
 */
export async function esperarConfirmacion(
  nrc: string,
  {
    consultar,
    intervaloMs = 800,
    maxMs = 6 * 60_000,
    maxFallos = 4,
    signal,
    esperar = sleep,
    ahora = Date.now,
  }: OpcionesEspera,
): Promise<EstadoInscripcionOut | null> {
  const limite = ahora() + maxMs;
  let fallos = 0;
  while (ahora() < limite) {
    try {
      const e = await consultar(nrc, signal);
      fallos = 0;
      if (e.estado !== "reservada") return e;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      // 401: la sesión venció y el cliente ya la cerró. Lo demás se reintenta unas veces.
      if (err instanceof ApiError && err.status === 401) throw err;
      if (++fallos >= maxFallos) throw err;
    }
    await esperar(intervaloMs, signal);
  }
  return null;
}

const SIN_DESCUENTO = "No se descontó ningún cupo.";

/** Texto del brief (§7) para un intento que no prosperó. `sin_cupo` no pasa por aquí. */
export function mensajeIntentoFallido(
  err: unknown,
  nrc: NrcOut,
  horario: HorarioOut | undefined,
): string {
  if (err instanceof ErrorRed) {
    return `No pudimos inscribirte. ${SIN_DESCUENTO} Revisa tu conexión y vuelve a intentarlo.`;
  }
  if (err instanceof ApiError) {
    switch (err.codigo) {
      case "ya_inscrita":
        return `Ya tienes ${nrc.titulo} en tu horario.`;
      case "materia_aprobada":
        return `Ya aprobaste ${nrc.titulo}.`;
      case "prerrequisito":
        return err.message;
      case "cruce":
        return mensajeCruce(nrc, err.conflicto, horario) ?? err.message;
      case "nrc_inexistente":
        return `El NRC ${nrc.nrc} ya no existe en la oferta. ${SIN_DESCUENTO}`;
      case "servicio_no_disponible":
        return `No pudimos registrar tu intento. ${SIN_DESCUENTO} Inténtalo de nuevo en un momento.`;
    }
  }
  return `No pudimos inscribirte. ${SIN_DESCUENTO} Vuelve a intentarlo.`;
}

/** "Se cruza con Bases de Datos (NRC 81204) el martes a las 18:15." */
export function mensajeCruce(
  nrc: NrcOut,
  conflicto: string | null,
  horario: HorarioOut | undefined,
): string | null {
  const otro = horario?.inscripciones.find((i) => i.nrc === conflicto);
  if (!otro) return null;
  for (const b of otro.bloques) {
    if (nrc.bloques.some((c) => cruzan(c, b))) {
      return `Se cruza con ${otro.titulo} (NRC ${otro.nrc}) el ${diaLargo(b.dia)} a las ${b.inicio}.`;
    }
  }
  return `Se cruza con ${otro.titulo} (NRC ${otro.nrc}).`;
}

export const TEXTO_SIN_CONFIRMAR =
  "No pudimos confirmar tu inscripción a tiempo; revisa Mi horario.";

export const TEXTO_RECHAZADA = (nrc: string) =>
  `El sistema académico no confirmó ${nrc}. Liberamos el cupo; puedes intentarlo de nuevo.`;
