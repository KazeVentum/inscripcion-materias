/** Niveles de la barra de cupos (brief §5). */
export type NivelCupos = "holgado" | "pocos" | "ultimo" | "agotado";

export function nivelCupos(libres: number, total: number): NivelCupos {
  if (libres <= 0) return "agotado";
  if (libres === 1) return "ultimo";
  if (libres <= 3 || libres / total <= 0.25) return "pocos";
  return "holgado";
}

/** Texto principal: cambia de forma en cada umbral, no solo de color. */
export function textoCupos(libres: number, total: number): string {
  switch (nivelCupos(libres, total)) {
    case "agotado":
      return "Agotado";
    case "ultimo":
      return "Último cupo";
    case "pocos":
      return `Quedan ${libres} de ${total}`;
    case "holgado":
      return `${libres} de ${total} libres`;
  }
}

/**
 * Mensaje para el lector de pantalla: solo en los umbrales (quedan 3, último, agotado),
 * nunca en cada cambio. Devuelve null si el cambio no cruza un umbral.
 */
export function anuncioUmbral(
  antes: number | null,
  ahora: number,
  total: number,
  nrc: string,
): string | null {
  if (antes === null || antes === ahora) return null;
  if (ahora > antes) {
    // Un cupo que vuelve solo se anuncia si el NRC estaba agotado.
    return antes === 0 ? `Se liberó un cupo en ${nrc}.` : null;
  }
  const nivelAntes = nivelCupos(antes, total);
  const nivelAhora = nivelCupos(ahora, total);
  if (nivelAntes === nivelAhora) return null;
  if (nivelAhora === "agotado") return `${nrc} se agotó.`;
  if (nivelAhora === "ultimo") return `Queda el último cupo en ${nrc}.`;
  if (nivelAhora === "pocos") return `Quedan ${ahora} cupos en ${nrc}.`;
  return null;
}

/** Más de 40 cupos: barra continua con marcas cada 5. */
export const MAX_SILLAS = 40;
