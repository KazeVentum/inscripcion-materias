"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { OrdenDemanda } from "@/lib/tipos";
import { api } from "./cliente";
import { claves } from "./consultas";
import { useSesion } from "./sesion";

/**
 * Las consultas de estudiante solo corren con sesión de estudiante: la clave incluye al
 * estudiante (sin mezclar cachés) y un coordinador nunca dispara endpoints que den 403.
 */
function useEstudiante(): string | null {
  const s = useSesion();
  return s?.rol === "estudiante" ? s.estudianteId : null;
}

/** Id del coordinador en sesión; null para estudiantes o sin sesión. */
function useCoordinador(): string | null {
  const s = useSesion();
  return s?.rol === "coordinador" ? s.estudianteId : null;
}

export function usePerfilCoordinador() {
  const u = useCoordinador();
  return useQuery({
    queryKey: claves.coordinador(u),
    queryFn: ({ signal }) => api.coordinador(signal),
    enabled: u !== null,
    staleTime: 5 * 60_000,
  });
}

export function useResumen() {
  const u = useCoordinador();
  return useQuery({
    queryKey: claves.resumen(u),
    queryFn: ({ signal }) => api.resumen(signal),
    enabled: u !== null,
    refetchInterval: 60_000,
  });
}

export interface FiltroDemanda {
  orden: OrdenDemanda;
  limite: number;
  materiaId: string | null;
  soloConIntentos: boolean;
}

export function useDemandaNrc(f: FiltroDemanda, habilitado = true) {
  const u = useCoordinador();
  return useQuery({
    queryKey: claves.demandaNrc(u, f),
    queryFn: ({ signal }) =>
      api.demandaNrc(
        {
          orden: f.orden,
          limite: f.limite,
          soloConIntentos: f.soloConIntentos,
          ...(f.materiaId ? { materiaId: f.materiaId } : {}),
        },
        signal,
      ),
    enabled: u !== null && habilitado,
    placeholderData: keepPreviousData,
  });
}

/** Materias del catálogo (para el filtro): se derivan de la demanda completa, una sola vez. */
export function useMateriasDeDemanda(habilitado = true) {
  const u = useCoordinador();
  return useQuery({
    queryKey: claves.materiasDemanda(u),
    queryFn: ({ signal }) => api.demandaNrc({ limite: 1000 }, signal),
    enabled: u !== null && habilitado,
    staleTime: 10 * 60_000,
    select: (d) => {
      const m = new Map<string, string>();
      for (const i of d.items) if (i.materiaId) m.set(i.materiaId, i.materia ?? i.materiaId);
      return [...m]
        .map(([id, nombre]) => ({ id, nombre }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    },
  });
}

export function useOcupacionFranja() {
  const u = useCoordinador();
  return useQuery({
    queryKey: claves.ocupacionFranja(u),
    queryFn: ({ signal }) => api.ocupacionFranja(signal),
    enabled: u !== null,
  });
}

export function useCombinaciones(semestre: number | null) {
  const u = useCoordinador();
  return useQuery({
    queryKey: claves.combinaciones(u, semestre),
    queryFn: ({ signal }) =>
      api.combinaciones({ limite: 10, ...(semestre ? { semestre } : {}) }, signal),
    enabled: u !== null,
    placeholderData: keepPreviousData,
  });
}

export function useAuditoria() {
  const u = useCoordinador();
  return useQuery({
    queryKey: claves.auditoria(u),
    queryFn: ({ signal }) => api.auditoria(signal),
    enabled: u !== null,
  });
}

export function useDemandaInsatisfecha() {
  const u = useCoordinador();
  return useQuery({
    queryKey: claves.demandaInsatisfecha(u),
    queryFn: ({ signal }) => api.demandaInsatisfecha(10, signal),
    enabled: u !== null,
  });
}

export function usePerfil() {
  const est = useEstudiante();
  return useQuery({
    queryKey: claves.perfil(est),
    queryFn: ({ signal }) => api.perfil(signal),
    enabled: est !== null,
    staleTime: 5 * 60_000,
  });
}

export function useMaterias() {
  const est = useEstudiante();
  return useQuery({
    queryKey: claves.materias(est),
    queryFn: ({ signal }) => api.materias(signal),
    enabled: est !== null,
  });
}

export function useAvance() {
  const est = useEstudiante();
  return useQuery({
    queryKey: claves.avance(est),
    queryFn: ({ signal }) => api.avance(signal),
    enabled: est !== null,
  });
}

export function useHorario() {
  const est = useEstudiante();
  return useQuery({
    queryKey: claves.horario(est),
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
    queryKey: claves.nrcDe(est, materiaId),
    queryFn: ({ signal }) => api.nrcDe(materiaId, signal),
    enabled: est !== null && habilitado,
    // Un NRC que se agota queda en pantalla (con su alternativa) en vez de desaparecer
    // en un refetch; la lista solo se pide de nuevo al cambiar el horario del estudiante.
    staleTime: Infinity,
  });
}
