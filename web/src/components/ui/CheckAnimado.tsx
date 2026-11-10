"use client";

import { motion, useReducedMotion } from "motion/react";
import { DUR, EASE_OUT } from "@/lib/movimiento";

/** Check de confirmación con trazo animado (brief §4). Decorativo. */
export function CheckAnimado({ className, tamano = 20 }: { className?: string; tamano?: number }) {
  const reducido = useReducedMotion();
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={tamano}
      height={tamano}
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <motion.path
        d="M8 12.5l3 3 5-6"
        initial={reducido ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: DUR.count, ease: EASE_OUT, delay: 0.08 }}
      />
    </svg>
  );
}
