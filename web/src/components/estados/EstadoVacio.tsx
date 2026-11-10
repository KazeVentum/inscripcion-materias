import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface EstadoVacioProps {
  titulo: string;
  texto?: string;
  /** Una sola acción (botón o enlace). */
  accion?: ReactNode;
  /** Un ícono Lucide opcional; sin ilustraciones (brief §5). */
  icono?: ReactNode;
  className?: string;
}

/** Vacío: una frase y una acción. Invita a actuar, no a lamentarse. */
export function EstadoVacio({ titulo, texto, accion, icono, className }: EstadoVacioProps) {
  return (
    <div className={cn("py-2", className)}>
      {icono ? (
        <span aria-hidden="true" className="mb-2 block text-text-3 [&_svg]:size-5">
          {icono}
        </span>
      ) : null}
      <p className="m-0 font-semibold text-text measure">{titulo}</p>
      {texto ? <p className="m-0 mt-1 text-compact text-text-2 measure">{texto}</p> : null}
      {accion ? <div className="mt-3">{accion}</div> : null}
    </div>
  );
}
