import { CircleCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/cn";
import type { TonoKpi } from "@/lib/analitica";

export interface TarjetaKpiProps {
  etiqueta: string;
  valor: string;
  detalle: string;
  tono?: TonoKpi;
}

/**
 * KPI sobrio: cifra grande tabular, etiqueta y detalle. El dorado (barra lateral) marca solo
 * lo crítico y siempre va con texto; el estado de la meta lleva icono además de color.
 */
export function TarjetaKpi({ etiqueta, valor, detalle, tono = "neutro" }: TarjetaKpiProps) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-card border border-border bg-surface p-3.5 lg:p-4",
        tono === "critico" && "shadow-[inset_3px_0_0_var(--accent)]",
        tono === "malo" && "shadow-[inset_3px_0_0_var(--danger)]",
      )}
    >
      <p className="m-0 text-meta font-semibold text-text-2">{etiqueta}</p>
      <p className="m-0 mt-1 font-head text-seats font-bold tabular">{valor}</p>
      <p
        className={cn(
          "m-0 mt-0.5 flex items-center gap-1 text-meta tabular",
          tono === "bueno" ? "text-success" : tono === "malo" ? "text-danger" : "text-text-2",
          tono === "critico" && "text-accent-ink",
        )}
      >
        {tono === "bueno" ? <CircleCheck aria-hidden="true" className="size-3.5 shrink-0" /> : null}
        {tono === "malo" || tono === "critico" ? (
          <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
        ) : null}
        {detalle}
      </p>
    </div>
  );
}
