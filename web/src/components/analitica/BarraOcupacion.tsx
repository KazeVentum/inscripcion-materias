import { MAX_SILLAS } from "@/lib/cupos";
import { cn } from "@/lib/cn";

export interface BarraOcupacionProps {
  ocupados: number;
  total: number;
  className?: string;
}

/**
 * Sillas de la analítica: una por cupo, las ocupadas llenas (azul de datos) y las vacías
 * en gris. Un NRC lleno se pinta dorado con borde: es lo crítico. Sin aria-live: es una
 * foto del lago, no un dato en vivo. Con más de MAX_SILLAS cupos pasa a barra continua.
 */
export function BarraOcupacion({ ocupados, total, className }: BarraOcupacionProps) {
  const oc = Math.max(0, Math.min(ocupados, total));
  const lleno = total > 0 && oc >= total;
  const texto = `${oc} de ${total} cupos ocupados${lleno ? ", lleno" : ""}`;
  if (total > MAX_SILLAS) {
    return (
      <div
        role="img"
        aria-label={texto}
        className={cn("barra-ocupacion-continua h-2.5", className)}
        data-lleno={lleno}
      >
        <span style={{ width: `${(oc / total) * 100}%` }} />
      </div>
    );
  }
  return (
    <div role="img" aria-label={texto} className={cn("flex h-2.5 gap-0.5", className)}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className="silla-ocupacion" data-ocupada={i < oc} data-lleno={lleno} />
      ))}
    </div>
  );
}
