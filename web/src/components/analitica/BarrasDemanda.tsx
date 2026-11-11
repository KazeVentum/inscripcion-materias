import { Flag } from "lucide-react";
import type { BarraDemanda } from "@/lib/analitica";
import { numero } from "@/lib/formatos";

export interface BarrasDemandaProps {
  barras: readonly BarraDemanda[];
}

/**
 * Barras horizontales (SVG propio) ordenadas de mayor a menor. Etiqueta directa sobre cada
 * barra, sin leyenda ni ejes: la cifra va al final. Las primeras (donde abrir más grupos)
 * van en dorado con contorno de tinta, más el texto "Abrir más grupos".
 * Alternativa accesible: la lista (role=list) lleva los datos completos en cada elemento.
 */
export function BarrasDemanda({ barras }: BarrasDemandaProps) {
  return (
    <ul className="m-0 grid list-none gap-3.5 p-0" aria-label="Materias con más intentos sin cupo">
      {barras.map((b) => (
        <li key={b.materiaId} aria-label={b.textoAccesible} className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-compact font-semibold" title={b.etiqueta}>
              {b.etiqueta}
            </span>
            <span className="shrink-0 font-head text-subject font-bold tabular">
              {numero(b.valor)}
            </span>
          </div>
          <svg
            aria-hidden="true"
            focusable="false"
            className="mt-1 block h-3 w-full"
            preserveAspectRatio="none"
          >
            <rect width="100%" height="100%" rx="2" fill="var(--surface-2)" />
            <rect
              width={`${Math.max(b.proporcion * 100, b.valor > 0 ? 1.5 : 0)}%`}
              height="100%"
              rx="2"
              fill={b.critica ? "var(--accent)" : "var(--data-5)"}
              stroke={b.critica ? "var(--accent-ink)" : "none"}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <p className="m-0 mt-1 flex flex-wrap items-center gap-x-2 text-meta text-text-2 tabular">
            {b.critica ? (
              <span className="inline-flex items-center gap-1 font-semibold text-accent-ink">
                <Flag aria-hidden="true" className="size-3.5" />
                Abrir más grupos
              </span>
            ) : null}
            <span>{b.detalle}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}
