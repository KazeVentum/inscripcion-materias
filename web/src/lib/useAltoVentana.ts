"use client";

import { useSyncExternalStore } from "react";

function suscribir(avisar: () => void) {
  window.addEventListener("resize", avisar);
  return () => window.removeEventListener("resize", avisar);
}

/** Alto de la ventana (px); 900 en el servidor. */
export function useAltoVentana(): number {
  return useSyncExternalStore(
    suscribir,
    () => window.innerHeight,
    () => 900,
  );
}
