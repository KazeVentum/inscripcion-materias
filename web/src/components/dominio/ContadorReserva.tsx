"use client";

import { mmss, segundosHasta } from "@/lib/horario";
import { useAhora } from "@/lib/useAhora";

export interface ContadorReservaProps {
  /** ISO-8601 UTC de vencimiento (ReservaOut.vencimiento). */
  vencimiento: string;
  /** Instante fijo (stories). */
  ahora?: number;
}

/**
 * "4:32" tabular. Pequeño y en dorado, nunca rojo pulsante (brief §9).
 * El lector de pantalla no recibe cada segundo: el texto completo va en aria-label.
 */
export function ContadorReserva({ vencimiento, ahora }: ContadorReservaProps) {
  const t = useAhora(1000, ahora);
  const s = segundosHasta(vencimiento, t);
  const min = Math.ceil(s / 60);
  return (
    <span
      className="tabular"
      role="timer"
      aria-label={`Reserva: ${min <= 1 ? "menos de 1 minuto" : `${min} minutos`}`}
    >
      <span aria-hidden="true">{mmss(s)}</span>
    </span>
  );
}
