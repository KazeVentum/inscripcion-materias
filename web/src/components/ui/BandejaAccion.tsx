"use client";

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { RESORTE_BANDEJA } from "@/lib/movimiento";

export interface BandejaAccionProps {
  visible?: boolean;
  /** Resumen a la izquierda (materia, NRC, horario). */
  children: ReactNode;
  /** Acción principal a la derecha (botón de 48 px). */
  accion: ReactNode;
  /** Fuerza el respaldo sólido (sin backdrop-filter). */
  solido?: boolean;
  /** "fixed" en la app; "absolute" dentro de un marco (stories). */
  posicion?: "fixed" | "absolute";
  etiqueta?: string;
  className?: string;
}

/**
 * Bandeja inferior de acción en móvil (no modal). Único uso del vidrio del manual:
 * deja ver la semana detrás mientras decides. Respaldo sólido sin soporte de
 * backdrop-filter o con prefers-reduced-transparency.
 */
export function BandejaAccion({
  visible = true,
  children,
  accion,
  solido = false,
  posicion = "fixed",
  etiqueta = "Acción seleccionada",
  className,
}: BandejaAccionProps) {
  return (
    <AnimatePresence>
      {visible ? (
        <motion.section
          aria-label={etiqueta}
          data-solido={solido}
          className={cn(
            "vidrio inset-x-0 bottom-0 z-30 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-t-sheet border-t border-border px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[var(--shadow-2),var(--edge)]",
            posicion === "fixed" ? "fixed" : "absolute",
            className,
          )}
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={RESORTE_BANDEJA}
        >
          <div className="min-w-0">{children}</div>
          {accion}
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}
