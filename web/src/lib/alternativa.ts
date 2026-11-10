import { cruzan, minutos } from "./horario";
import type { BloqueOut, NrcOut } from "./tipos";

/**
 * Alternativa local cuando un NRC se agota mientras se mira (SSE), antes de que el estudiante
 * pulse nada: otro grupo de la misma materia con cupo, sin cruce con lo ya inscrito o
 * reservado, el más cercano en horario (misma franja primero; luego, menor distancia entre
 * la hora de inicio; luego, más cupos). Si el intento llega a la API y recibe 409, manda
 * la alternativa de la API (`ErrorOut.alternativa`).
 */
export function alternativaLocal(
  agotado: NrcOut,
  grupos: readonly NrcOut[],
  ocupados: readonly BloqueOut[],
): NrcOut | null {
  const inicio = (n: NrcOut) => (n.bloques[0] ? minutos(n.bloques[0].inicio) : 0);
  const candidatos = grupos.filter(
    (n) =>
      n.nrc !== agotado.nrc &&
      n.materiaId === agotado.materiaId &&
      n.cuposLibres > 0 &&
      !n.bloques.some((b) => ocupados.some((o) => cruzan(b, o))),
  );
  candidatos.sort(
    (a, b) =>
      Number(b.franja === agotado.franja) - Number(a.franja === agotado.franja) ||
      Math.abs(inicio(a) - inicio(agotado)) - Math.abs(inicio(b) - inicio(agotado)) ||
      b.cuposLibres - a.cuposLibres ||
      a.nrc.localeCompare(b.nrc),
  );
  return candidatos[0] ?? null;
}
