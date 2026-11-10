"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Tooltip } from "./Tooltip";

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Nombre accesible obligatorio; también es el texto del tooltip. */
  etiqueta: string;
  icono: ReactNode;
  variante?: "fantasma" | "secundario";
  /** Muestra la etiqueta en un tooltip al pasar o enfocar (escritorio). */
  conTooltip?: boolean;
}

/** Botón de solo ícono, 44 × 44 px (objetivo táctil mínimo del brief). */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { etiqueta, icono, variante = "fantasma", conTooltip = false, className, type, ...rest },
  ref,
) {
  const boton = (
    <button
      ref={ref}
      type={type ?? "button"}
      aria-label={etiqueta}
      className={cn(
        "inline-grid size-11 shrink-0 place-items-center rounded-control text-text-2 [&_svg]:size-5",
        "transition-[transform,background-color] duration-[var(--dur-press)] ease-out active:scale-[.96]",
        "hover:bg-surface-2 hover:text-text disabled:cursor-not-allowed disabled:opacity-60",
        variante === "secundario" && "bg-surface shadow-[inset_0_0_0_1px_var(--border-strong)]",
        className,
      )}
      {...rest}
    >
      <span aria-hidden="true" className="contents">
        {icono}
      </span>
    </button>
  );
  return conTooltip ? <Tooltip contenido={etiqueta}>{boton}</Tooltip> : boton;
});
