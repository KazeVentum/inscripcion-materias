"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";
import { buscarNrc } from "@/lib/api/consultas";
import type { NrcOut } from "@/lib/tipos";

/**
 * Versión viva de un NRC (con los cupos que llegan por SSE) leída de la caché. Devuelve
 * `undefined` si ninguna lista lo tiene. El objeto es estable mientras no cambie.
 */
export function useNrcEnCache(nrc: string | null): NrcOut | undefined {
  const qc = useQueryClient();
  const suscribir = useCallback((avisar: () => void) => qc.getQueryCache().subscribe(avisar), [qc]);
  return useSyncExternalStore(
    suscribir,
    () => (nrc ? buscarNrc(qc, nrc) : undefined),
    () => undefined,
  );
}
