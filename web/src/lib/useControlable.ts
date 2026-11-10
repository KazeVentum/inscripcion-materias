"use client";

import { useCallback, useState } from "react";

/** Estado controlado si llega `valor`, interno si no. */
export function useControlable<T>(
  valor: T | undefined,
  inicial: T,
  onCambio?: (v: T) => void,
): [T, (v: T) => void] {
  const [interno, setInterno] = useState(inicial);
  const controlado = valor !== undefined;
  const actual = controlado ? valor : interno;
  const set = useCallback(
    (v: T) => {
      if (!controlado) setInterno(v);
      onCambio?.(v);
    },
    [controlado, onCambio],
  );
  return [actual, set];
}
