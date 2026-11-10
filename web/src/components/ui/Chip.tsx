"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  activo?: boolean;
}

/** Filtro conmutable (p. ej. franja "Noche"). Radio 6, alto 36 visible + área táctil 44. */
export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { activo = false, className, children, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      aria-pressed={activo}
      className={cn(
        "relative inline-flex h-9 items-center gap-1.5 rounded-chip px-3 text-compact font-semibold",
        "before:absolute before:-inset-y-1 before:inset-x-0 before:content-['']",
        "transition-colors duration-[var(--dur-fast)] [&_svg]:size-4",
        activo
          ? "bg-primary-soft text-primary-ink shadow-[inset_0_0_0_1.5px_var(--primary-ink)]"
          : "bg-surface text-text-2 shadow-[inset_0_0_0_1px_var(--border-strong)] hover:text-text",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});
