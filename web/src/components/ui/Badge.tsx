import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type TonoBadge = "neutro" | "primario" | "exito" | "aviso" | "peligro" | "reservado";

const TONOS: Record<TonoBadge, string> = {
  neutro: "bg-surface-2 text-text-2",
  primario: "bg-primary-soft text-primary-ink",
  exito: "bg-success-soft text-success",
  aviso: "bg-accent-soft text-warning",
  peligro: "bg-danger-soft text-danger",
  reservado: "bg-accent-soft text-accent-ink",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tono?: TonoBadge;
  icono?: ReactNode;
}

/** Insignia de estado (radio 999). El texto siempre dice el estado; el color refuerza. */
export function Badge({ tono = "neutro", icono, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-meta font-semibold whitespace-nowrap tabular [&_svg]:size-3.5",
        TONOS[tono],
        className,
      )}
      {...rest}
    >
      {icono ? (
        <span aria-hidden="true" className="contents">
          {icono}
        </span>
      ) : null}
      {children}
    </span>
  );
}
