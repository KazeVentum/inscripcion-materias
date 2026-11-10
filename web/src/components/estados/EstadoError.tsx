"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export interface EstadoErrorProps {
  /** Qué pasó. */
  titulo: string;
  /** Qué no se perdió / qué hacer. */
  texto?: string;
  onReintentar?: () => void;
  reintentando?: boolean;
  className?: string;
}

/** Error: qué pasó, qué no se perdió, qué hacer. Sin disculpas ni culpas. */
export function EstadoError({
  titulo,
  texto,
  onReintentar,
  reintentando = false,
  className,
}: EstadoErrorProps) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-card border border-border bg-surface p-4 shadow-edge",
        "shadow-[inset_3px_0_0_var(--danger),var(--edge)]",
        className,
      )}
    >
      <div className="flex gap-2.5">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-danger" />
        <div className="min-w-0">
          <p className="m-0 font-semibold text-text measure">{titulo}</p>
          {texto ? <p className="m-0 mt-1 text-compact text-text-2 measure">{texto}</p> : null}
          {onReintentar ? (
            <Button
              className="mt-3"
              tamano="sm"
              variante="secundario"
              icono={<RotateCcw aria-hidden="true" />}
              cargando={reintentando}
              onClick={onReintentar}
            >
              {reintentando ? "Reintentando…" : "Reintentar"}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
