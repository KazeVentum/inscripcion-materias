"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Reloj que avanza cada `intervaloMs` (cuantizado, así el snapshot es estable entre
 * renders). Con `fijo` devuelve siempre ese instante (stories y capturas deterministas).
 */
export function useAhora(intervaloMs = 1000, fijo?: number): number {
  const subscribe = useCallback(
    (avisar: () => void) => {
      if (fijo !== undefined) return () => {};
      const id = window.setInterval(avisar, intervaloMs);
      return () => window.clearInterval(id);
    },
    [intervaloMs, fijo],
  );
  const leer = () => fijo ?? Math.floor(Date.now() / intervaloMs) * intervaloMs;
  return useSyncExternalStore(subscribe, leer, leer);
}
