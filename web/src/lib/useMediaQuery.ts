"use client";

import { useCallback, useSyncExternalStore } from "react";

/** `false` en el servidor y en la primera pintura; luego sigue la media query. */
export function useMediaQuery(consulta: string): boolean {
  const subscribe = useCallback(
    (avisar: () => void) => {
      const m = window.matchMedia(consulta);
      m.addEventListener("change", avisar);
      return () => m.removeEventListener("change", avisar);
    },
    [consulta],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(consulta).matches,
    () => false,
  );
}
