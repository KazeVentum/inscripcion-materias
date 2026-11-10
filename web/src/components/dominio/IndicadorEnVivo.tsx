"use client";

import { cn } from "@/lib/cn";
import { useAhora } from "@/lib/useAhora";

export type EstadoConexion = "en-vivo" | "reconectando" | "sin-conexion";

export interface IndicadorEnVivoProps {
  estado: EstadoConexion;
  /** ISO del último evento de cupos recibido. */
  ultimaActualizacion?: string;
  ahora?: number;
  className?: string;
}

function hace(segundos: number): string {
  if (segundos < 60) return `hace ${segundos} s`;
  const m = Math.floor(segundos / 60);
  return `hace ${m} min`;
}

/**
 * "Cupos en vivo" con punto verde; sin señal, "Actualizado hace 40 s". El texto cambia,
 * no solo el color. El lector de pantalla oye el cambio de estado, no cada segundo.
 */
export function IndicadorEnVivo({
  estado,
  ultimaActualizacion,
  ahora,
  className,
}: IndicadorEnVivoProps) {
  const t = useAhora(1000, ahora);
  const s = ultimaActualizacion
    ? Math.max(0, Math.round((t - Date.parse(ultimaActualizacion)) / 1000))
    : null;
  const enVivo = estado === "en-vivo";
  const texto = enVivo
    ? "Cupos en vivo"
    : s !== null
      ? `Actualizado ${hace(s)}`
      : estado === "reconectando"
        ? "Reconectando…"
        : "Sin conexión";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-meta font-semibold text-text-2 tabular",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-2 shrink-0 rounded-pill",
          enVivo
            ? "bg-success shadow-[0_0_0_3px_var(--success-soft)]"
            : "bg-transparent shadow-[inset_0_0_0_1.5px_var(--text-3)]",
        )}
      />
      <span aria-hidden="true">{texto}</span>
      <span className="sr-only" role="status">
        {enVivo
          ? "Cupos en vivo"
          : estado === "reconectando"
            ? "Reconectando con los cupos en vivo"
            : "Sin conexión con los cupos en vivo"}
      </span>
    </span>
  );
}
