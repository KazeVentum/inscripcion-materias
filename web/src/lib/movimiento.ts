/** Espejo en JS de los tokens de movimiento (Motion trabaja en segundos). */
export const DUR = { press: 0.1, fast: 0.16, base: 0.24, count: 0.42 } as const;
export const EASE_OUT = [0.2, 0.8, 0.2, 1] as const;
export const EASE_IN_OUT = [0.4, 0, 0.2, 1] as const;
/** Bandeja: sin rebote visible. */
export const RESORTE_BANDEJA = { type: "spring", stiffness: 420, damping: 38 } as const;
