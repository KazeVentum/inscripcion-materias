import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface SeccionProps {
  titulo: string;
  descripcion?: string;
  /** Acciones o filtros a la derecha del título. */
  acciones?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Bloque de la página de analítica: título de sección, una frase y el contenido. */
export function Seccion({ titulo, descripcion, acciones, children, className }: SeccionProps) {
  return (
    <section
      aria-label={titulo}
      className={cn("rounded-card border border-border bg-surface p-4 lg:p-5", className)}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-section font-semibold">{titulo}</h2>
          {descripcion ? (
            <p className="m-0 mt-1 text-compact text-text-2 measure">{descripcion}</p>
          ) : null}
        </div>
        {acciones}
      </div>
      {children}
    </section>
  );
}
