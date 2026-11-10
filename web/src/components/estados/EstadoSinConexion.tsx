import { WifiOff } from "lucide-react";
import { cn } from "@/lib/cn";

export interface EstadoSinConexionProps {
  texto?: string;
  className?: string;
}

/** Franja fija bajo el encabezado cuando se cae el stream de cupos. */
export function EstadoSinConexion({
  texto = "Sin conexión. Los cupos pueden haber cambiado. Reconectando…",
  className,
}: EstadoSinConexionProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-2 border-y border-border bg-surface-2 px-4 py-2 text-compact text-text-2",
        className,
      )}
    >
      <WifiOff aria-hidden="true" className="size-4 shrink-0" />
      <span>{texto}</span>
    </div>
  );
}
