"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./cliente";
import { claves } from "./consultas";
import { useSesion } from "./sesion";

/** Las consultas solo corren con sesión: la clave incluye al estudiante (sin mezclar cachés). */
function useEstudiante(): string | null {
  return useSesion()?.estudianteId ?? null;
}

export function usePerfil() {
  const est = useEstudiante();
  return useQuery({
    queryKey: [...claves.perfil, est],
    queryFn: ({ signal }) => api.perfil(signal),
    enabled: est !== null,
    staleTime: 5 * 60_000,
  });
}

export function useMaterias() {
  const est = useEstudiante();
  return useQuery({
    queryKey: claves.materias,
    queryFn: ({ signal }) => api.materias(signal),
    enabled: est !== null,
  });
}

export function useHorario() {
  const est = useEstudiante();
  return useQuery({
    queryKey: claves.horario,
    queryFn: ({ signal }) => api.horario(signal),
    enabled: est !== null,
    // Con una reserva viva, el horario se refresca solo hasta que el worker confirme.
    refetchInterval: (q) =>
      q.state.data?.inscripciones.some((i) => i.estado === "reservada") ? 3000 : false,
  });
}

export function useNrcDe(materiaId: string, habilitado = true) {
  const est = useEstudiante();
  return useQuery({
    queryKey: claves.nrcDe(materiaId),
    queryFn: ({ signal }) => api.nrcDe(materiaId, signal),
    enabled: est !== null && habilitado,
    // Un NRC que se agota queda en pantalla (con su alternativa) en vez de desaparecer
    // en un refetch; la lista solo se pide de nuevo al cambiar el horario del estudiante.
    staleTime: Infinity,
  });
}
