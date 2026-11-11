import { useSyncExternalStore } from "react";
import type { Rol } from "@/lib/tipos";

/**
 * Sesión del estudiante. El JWT vive en sessionStorage, no en memoria ni en localStorage:
 *  - sobrevive a recargar la pestaña (en memoria, cada F5 pediría la clave de nuevo);
 *  - muere al cerrar la pestaña y no se comparte entre pestañas (localStorage lo dejaría
 *    en disco hasta expirar);
 *  - no es una cookie: no viaja solo en cada petición (sin CSRF) y nunca va en una URL.
 * Un XSS podría leerlo igual que leería una variable en memoria; la defensa es no inyectar
 * HTML (React escapa) y la expiración corta (JWT_TTL_MIN).
 */
export interface Sesion {
  token: string;
  /** Id del usuario: est-000123 o coord-0001 (el nombre viene de la API de estudiantes). */
  estudianteId: string;
  /** Rol del JWT. Una sesión guardada sin rol (anterior a la fase 6) es de estudiante. */
  rol: Rol;
  /** epoch ms en que vence el token. */
  expiraEn: number;
}

const CLAVE = "sesion";
const EVENTO = "sesion-cambio";

let crudo: string | null | undefined;
let cache: Sesion | null = null;

function parsear(raw: string | null): Sesion | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<Sesion>;
    if (typeof s.token !== "string" || typeof s.estudianteId !== "string") return null;
    if (typeof s.expiraEn !== "number" || s.expiraEn <= Date.now()) return null;
    const rol: Rol = s.rol === "coordinador" ? "coordinador" : "estudiante";
    return { token: s.token, estudianteId: s.estudianteId, rol, expiraEn: s.expiraEn };
  } catch {
    return null;
  }
}

export function leerSesion(): Sesion | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(CLAVE);
  } catch {
    return cache; // almacenamiento bloqueado: lo guardado en memoria vale esta visita
  }
  if (raw !== crudo) {
    crudo = raw;
    cache = parsear(raw);
  }
  return cache;
}

export function guardarSesion(s: Sesion): void {
  cache = s;
  crudo = JSON.stringify(s);
  try {
    window.sessionStorage.setItem(CLAVE, crudo);
  } catch {
    /* sin almacenamiento: sesión solo en memoria */
  }
  window.dispatchEvent(new Event(EVENTO));
}

export function cerrarSesion(): void {
  cache = null;
  crudo = null;
  try {
    window.sessionStorage.removeItem(CLAVE);
  } catch {
    /* nada que borrar */
  }
  window.dispatchEvent(new Event(EVENTO));
}

function suscribir(avisar: () => void): () => void {
  window.addEventListener(EVENTO, avisar);
  window.addEventListener("storage", avisar);
  return () => {
    window.removeEventListener(EVENTO, avisar);
    window.removeEventListener("storage", avisar);
  };
}

/** `undefined` mientras no hidrata (servidor), luego la sesión o `null`. */
export function useSesion(): Sesion | null | undefined {
  return useSyncExternalStore<Sesion | null | undefined>(suscribir, leerSesion, () => undefined);
}

/** Solo para pruebas. */
export function _reiniciarSesionParaPruebas(): void {
  crudo = undefined;
  cache = null;
}
