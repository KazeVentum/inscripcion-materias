import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";

/** Skeleton con la forma real: semana, filas de materia y 2 tarjetas de NRC. */
export function EstadoCarga({ className }: { className?: string }) {
  return (
    <div className={cn("grid gap-6", className)} role="status" aria-label="Cargando tus materias">
      <div className="rounded-card border border-border bg-surface p-3">
        <Skeleton className="mb-3 h-4 w-28" />
        <div className="grid grid-cols-[22px_repeat(6,minmax(0,1fr))] gap-1">
          <span />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-40 rounded-[4px]" />
          ))}
        </div>
      </div>
      <div className="grid gap-3">
        <Skeleton className="h-3.5 w-24" />
        {[70, 55].map((w) => (
          <div key={w} className="grid gap-2 border-t border-border py-3">
            <Skeleton className="h-4" style={{ width: `${w}%` }} />
            <Skeleton className="h-3 w-32" />
          </div>
        ))}
        {[0, 1].map((i) => (
          <div
            key={i}
            className="ml-[30px] grid gap-2 rounded-card border border-border bg-surface p-3.5"
          >
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3.5 w-44" />
            <Skeleton className="h-3 w-36" />
            <Skeleton className="mt-1 h-2.5 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
