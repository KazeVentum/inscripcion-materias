"use client";

import { Eye, EyeOff, TriangleAlert } from "lucide-react";
import { forwardRef, useId, useState, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface CampoProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  etiqueta: string;
  /** Texto de ayuda bajo el campo. */
  ayuda?: string;
  /** Mensaje de error: texto + icono, nunca solo color. */
  error?: string;
  /** Para contraseñas: botón "Mostrar" con nombre accesible. */
  alternarVisibilidad?: boolean;
}

/**
 * Campo de texto: etiqueta visible arriba, 48 px, borde `--border-strong` (3:1), 16 px de
 * fuente para que iOS no haga zoom. Error y ayuda se enlazan con aria-describedby.
 */
export const Campo = forwardRef<HTMLInputElement, CampoProps>(function Campo(
  { etiqueta, ayuda, error, alternarVisibilidad = false, type = "text", className, ...rest },
  ref,
) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const descripciones = [ayuda ? `${id}-ayuda` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-compact font-semibold text-text">
        {etiqueta}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          type={alternarVisibilidad && visible ? "text" : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={descripciones || undefined}
          className={cn(
            "h-12 w-full rounded-control border bg-surface px-3.5 text-body text-text placeholder:text-text-3",
            error ? "border-2 border-danger px-[13px]" : "border-border-strong",
            alternarVisibilidad && "pr-12",
            "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-2",
          )}
          {...rest}
        />
        {alternarVisibilidad ? (
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-pressed={visible}
            aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
            className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-control text-text-2 hover:text-text [&_svg]:size-5"
          >
            {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </button>
        ) : null}
      </div>
      {ayuda ? (
        <p id={`${id}-ayuda`} className="m-0 mt-1.5 text-meta text-text-2">
          {ayuda}
        </p>
      ) : null}
      {error ? (
        <p
          id={`${id}-error`}
          className="m-0 mt-1.5 flex items-start gap-1.5 text-compact font-semibold text-danger"
        >
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
});
