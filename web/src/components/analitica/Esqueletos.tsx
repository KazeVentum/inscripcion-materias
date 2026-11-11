import { Skeleton } from "@/components/ui/Skeleton";

export function EsqueletoKpis() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="rounded-card border border-border bg-surface p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-6 w-16" />
          <Skeleton className="mt-2 h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

export function EsqueletoBarras({ filas = 5 }: { filas?: number }) {
  return (
    <div className="grid gap-4" aria-hidden="true">
      {Array.from({ length: filas }, (_, i) => (
        <div key={i}>
          <Skeleton className="h-3.5" style={{ width: `${70 - i * 8}%` }} />
          <Skeleton className="mt-2 h-3 w-full" />
        </div>
      ))}
    </div>
  );
}

export function EsqueletoFilas({ filas = 6 }: { filas?: number }) {
  return (
    <div className="grid gap-3" aria-hidden="true">
      {Array.from({ length: filas }, (_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
