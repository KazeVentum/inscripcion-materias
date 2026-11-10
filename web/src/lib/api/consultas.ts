import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { ApiError } from "./cliente";
import type { HorarioOut, MateriaHabilitadaOut, NrcOut } from "@/lib/tipos";

/**
 * Toda clave lleva al estudiante: aunque la caché sobreviviera a un cambio de sesión, los
 * datos de uno nunca se leerían como del otro. Los `*Todos` son prefijos para invalidar.
 */
export const claves = {
  perfil: (est: string | null) => ["perfil", est] as const,
  materias: (est: string | null) => ["materias", est] as const,
  horario: (est: string | null) => ["horario", est] as const,
  nrcDe: (est: string | null, materiaId: string) => ["nrc", est, materiaId] as const,
  materiasTodas: ["materias"] as const,
  horarioTodos: ["horario"] as const,
  nrcTodos: ["nrc"] as const,
};

export function crearQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (n, error) => {
          // Un 4xx no mejora reintentando; un corte de red sí.
          if (error instanceof ApiError && error.status < 500) return false;
          return n < 2;
        },
      },
    },
  });
}

/** Aplica un cambio de cupo a toda lista de NRC en caché, sin tocar los demás objetos. */
export function aplicarCupo(qc: QueryClient, nrc: string, libres: number): void {
  qc.setQueriesData<NrcOut[]>({ queryKey: claves.nrcTodos }, (lista) => {
    if (!lista?.some((n) => n.nrc === nrc && n.cuposLibres !== libres)) return lista;
    return lista.map((n) => (n.nrc === nrc ? { ...n, cuposLibres: libres } : n));
  });
  qc.setQueriesData<HorarioOut>({ queryKey: claves.horarioTodos }, (h) => {
    if (!h?.inscripciones.some((i) => i.nrc === nrc && i.cuposLibres !== libres)) return h;
    return {
      ...h,
      inscripciones: h.inscripciones.map((i) =>
        i.nrc === nrc ? { ...i, cuposLibres: libres } : i,
      ),
    };
  });
}

/** Busca un NRC entre todas las listas en caché. */
export function buscarNrc(qc: QueryClient, nrc: string): NrcOut | undefined {
  for (const [, lista] of qc.getQueriesData<NrcOut[]>({ queryKey: claves.nrcTodos })) {
    const n = lista?.find((x) => x.nrc === nrc);
    if (n) return n;
  }
  return undefined;
}

export function leerMaterias(qc: QueryClient): MateriaHabilitadaOut[] | undefined {
  return qc.getQueriesData<MateriaHabilitadaOut[]>({ queryKey: claves.materiasTodas })[0]?.[1];
}

export function leerHorario(qc: QueryClient): HorarioOut | undefined {
  return qc.getQueriesData<HorarioOut>({ queryKey: claves.horarioTodos })[0]?.[1];
}

export type ClaveConsulta = QueryKey;
