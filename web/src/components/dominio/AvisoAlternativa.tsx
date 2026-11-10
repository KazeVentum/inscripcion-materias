"use client";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { MODALIDAD, horarioLegible } from "@/lib/horario";
import type { NrcOut } from "@/lib/tipos";

export interface AvisoAlternativaProps {
  /** NRC que se agotó. */
  agotado: string;
  /** NRC alternativo más cercano (ErrorOut.alternativa). Sin él: "Ver otros grupos". */
  alternativa: NrcOut | null;
  onInscribir?: (nrc: string) => void;
  onVerOtros?: () => void;
  /** Deshabilita "Inscribir" (sin conexión) con su motivo. */
  motivoDeshabilitado?: string;
  className?: string;
}

/**
 * Reemplaza en su lugar a la tarjeta agotada: no es modal ni toast que se va (brief §5).
 */
export function AvisoAlternativa({
  agotado,
  alternativa,
  onInscribir,
  onVerOtros,
  motivoDeshabilitado,
  className,
}: AvisoAlternativaProps) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-card bg-accent-soft py-3.5 pr-3.5 pl-[17px] shadow-[inset_3px_0_0_var(--accent)]",
        className,
      )}
    >
      <p className="m-0 text-compact text-text">
        <strong className="font-semibold tabular">Se agotó {agotado}.</strong>{" "}
        {alternativa ? (
          <span className="tabular">
            El {alternativa.nrc} tiene {alternativa.cuposLibres}{" "}
            {alternativa.cuposLibres === 1 ? "cupo" : "cupos"} y no cruza con tu horario.
          </span>
        ) : (
          <span>Ningún otro grupo de esta materia encaja hoy con tu semana.</span>
        )}
      </p>

      {alternativa ? (
        <div className="mt-2.5 rounded-control border border-border bg-surface px-3 py-2.5 text-[13px] leading-[18px] text-text-2 tabular">
          <strong className="font-bold text-text">{alternativa.nrc}</strong>{" "}
          {MODALIDAD[alternativa.modalidad]}, {horarioLegible(alternativa.bloques)}
          <br />
          {alternativa.docente}
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        {alternativa ? (
          <Button
            tamano="sm"
            onClick={() => onInscribir?.(alternativa.nrc)}
            disabled={Boolean(motivoDeshabilitado)}
            {...(motivoDeshabilitado ? { motivo: motivoDeshabilitado } : {})}
          >
            Inscribir {alternativa.nrc}
          </Button>
        ) : null}
        <button
          type="button"
          onClick={onVerOtros}
          className="min-h-11 rounded-chip text-compact font-semibold text-info underline underline-offset-[3px]"
        >
          Ver otros grupos
        </button>
      </div>
    </div>
  );
}
