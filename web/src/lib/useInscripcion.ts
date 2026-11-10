"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAvisos } from "@/components/pantallas/Avisos";
import { ApiError, api } from "@/lib/api/cliente";
import { aplicarCupo, claves, leerHorario } from "@/lib/api/consultas";
import {
  esperarConfirmacion,
  mensajeIntentoFallido,
  TEXTO_RECHAZADA,
  TEXTO_SIN_CONFIRMAR,
} from "@/lib/inscribir";
import type { NrcOut } from "@/lib/tipos";

function sinClave<V>(mapa: Record<string, V>, clave: string): Record<string, V> {
  return Object.fromEntries(Object.entries(mapa).filter(([k]) => k !== clave));
}

export type FaseInscripcion = { fase: "inscribiendo" } | { fase: "reservada"; vencimiento: string };

/** Invalida lo que cambia al inscribir o cancelar (horario, materias y listas de NRC). */
export function useRefrescar() {
  const qc = useQueryClient();
  return useCallback(() => {
    void qc.invalidateQueries({ queryKey: claves.horarioTodos });
    void qc.invalidateQueries({ queryKey: claves.materiasTodas });
    void qc.invalidateQueries({ queryKey: claves.nrcTodos });
  }, [qc]);
}

/** Cancela una inscripción o reserva (DELETE) y devuelve si quedó cancelada. */
export function useCancelar() {
  const avisos = useAvisos();
  const refrescar = useRefrescar();
  return useCallback(
    async (nrc: string, titulo: string): Promise<boolean> => {
      try {
        await api.cancelar(nrc);
        avisos.info(`Cancelaste ${titulo}, NRC ${nrc}. El cupo quedó libre.`);
      } catch (err) {
        // 404 sin_inscripcion: ya no estaba; basta con mostrar el estado real.
        if (!(err instanceof ApiError && err.codigo === "sin_inscripcion")) {
          avisos.error(
            `No pudimos cancelar ${nrc}. Tu inscripción sigue igual. Vuelve a intentarlo.`,
          );
          return false;
        }
      }
      refrescar();
      return true;
    },
    [avisos, refrescar],
  );
}

/**
 * Inscribir en un clic (HU4): POST → reservada (202) → polling de GET /inscripciones/{nrc}
 * hasta confirmada o rechazada. Un 409 sin_cupo guarda la alternativa de la API para que la
 * tarjeta la ofrezca en su lugar.
 */
export function useInscripcion() {
  const qc = useQueryClient();
  const avisos = useAvisos();
  const [fases, setFases] = useState<Record<string, FaseInscripcion>>({});
  const [alternativas, setAlternativas] = useState<Record<string, NrcOut | null>>({});
  const activas = useRef(new Map<string, AbortController>());

  useEffect(() => {
    const mapa = activas.current;
    return () => mapa.forEach((c) => c.abort());
  }, []);

  const poner = useCallback(
    (nrc: string, f: FaseInscripcion | null) =>
      setFases((m) => {
        const resto = sinClave(m, nrc);
        return f ? { ...resto, [nrc]: f } : resto;
      }),
    [],
  );

  const refrescar = useRefrescar();

  const inscribir = useCallback(
    async (nrc: NrcOut) => {
      if (activas.current.has(nrc.nrc)) return;
      const control = new AbortController();
      activas.current.set(nrc.nrc, control);
      poner(nrc.nrc, { fase: "inscribiendo" });
      setAlternativas((m) => sinClave(m, nrc.nrc));
      try {
        const reserva = await api.inscribir({ nrc: nrc.nrc });
        aplicarCupo(qc, nrc.nrc, reserva.cuposLibres);
        poner(nrc.nrc, { fase: "reservada", vencimiento: reserva.vencimiento });
        void qc.invalidateQueries({ queryKey: claves.horarioTodos });

        const final = await esperarConfirmacion(nrc.nrc, {
          consultar: (n, signal) => api.estadoInscripcion(n, signal),
          signal: control.signal,
        });
        poner(nrc.nrc, null);
        if (final?.estado === "confirmada") {
          avisos.inscrita(nrc.titulo, nrc.nrc);
        } else if (final?.estado === "rechazada") {
          avisos.error(TEXTO_RECHAZADA(nrc.nrc));
        } else {
          // sin respuesta a tiempo (null) o cancelada por otra vía: nunca en silencio
          avisos.error(TEXTO_SIN_CONFIRMAR);
        }
        refrescar();
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        poner(nrc.nrc, null);
        if (err instanceof ApiError && err.codigo === "sin_cupo") {
          aplicarCupo(qc, nrc.nrc, 0);
          setAlternativas((m) => ({ ...m, [nrc.nrc]: err.alternativa }));
          return;
        }
        const horario = leerHorario(qc);
        avisos.error(mensajeIntentoFallido(err, nrc, horario));
        // Si falló tras reservar (p. ej. el seguimiento), el estado real está en el servidor.
        refrescar();
      } finally {
        activas.current.delete(nrc.nrc);
      }
    },
    [qc, avisos, refrescar, poner],
  );

  return { fases, alternativas, inscribir };
}
