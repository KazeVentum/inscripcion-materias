"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { EstadoConexion } from "@/components/dominio/IndicadorEnVivo";
import { api } from "@/lib/api/cliente";
import { aplicarCupo, claves } from "@/lib/api/consultas";
import { cerrarSesion } from "@/lib/api/sesion";
import { StreamCupos, type OpcionesStream } from "@/lib/stream/cuposEnVivo";

export interface ConexionVivo {
  estado: EstadoConexion;
  /** ISO del último dato bueno (para "Actualizado hace 40 s"). */
  ultimaActualizacion: string | undefined;
}

/**
 * Mantiene la caché de TanStack Query al día con GET /stream/cupos: cada evento
 * `{nrc, libres}` reescribe el NRC en todas las listas, sin recargar. Con `habilitado`
 * en false no abre nada.
 */
export function useCuposEnVivo(
  habilitado = true,
  inyectar: Partial<OpcionesStream> = {},
): ConexionVivo {
  const qc = useQueryClient();
  const [conexion, setConexion] = useState<ConexionVivo>({
    estado: "reconectando",
    ultimaActualizacion: undefined,
  });

  useEffect(() => {
    if (!habilitado) return;
    const stream = new StreamCupos({
      pedirTicket: async () => (await api.ticketStream()).ticket,
      onCupo: ({ nrc, libres }) => aplicarCupo(qc, nrc, libres),
      onEstado: (estado, { ultimaActualizacion }) =>
        setConexion({
          estado,
          ultimaActualizacion:
            ultimaActualizacion !== null ? new Date(ultimaActualizacion).toISOString() : undefined,
        }),
      onResincronizar: () => {
        void qc.invalidateQueries({ queryKey: claves.nrcTodos });
        void qc.invalidateQueries({ queryKey: claves.horarioTodos });
        void qc.invalidateQueries({ queryKey: claves.materiasTodas });
      },
      onSesionExpirada: cerrarSesion,
      ...inyectar,
    });
    const alVolverRed = () => stream.reintentarYa();
    const alPerderRed = () => stream.marcarSinRed();
    window.addEventListener("online", alVolverRed);
    window.addEventListener("offline", alPerderRed);
    // Pub/Sub descarta eventos si la cola de un cliente se llena: con la pestaña visible,
    // cada 60 s se piden de nuevo los cupos reales.
    const repaso = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void qc.invalidateQueries({ queryKey: claves.nrcTodos });
      }
    }, 60_000);
    stream.iniciar();
    if (!navigator.onLine) stream.marcarSinRed();
    return () => {
      window.removeEventListener("online", alVolverRed);
      window.removeEventListener("offline", alPerderRed);
      window.clearInterval(repaso);
      stream.detener();
    };
    // `inyectar` solo lo usan las pruebas y no cambia entre renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [habilitado, qc]);

  return conexion;
}
