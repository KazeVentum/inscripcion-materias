import { numero, porcentaje } from "@/lib/formatos";
import type { CombinacionItem } from "@/lib/tipos";

/** Pares de NRC que los estudiantes de un semestre inscriben juntos; lista compacta. */
export function ListaCombinaciones({ items }: { items: readonly CombinacionItem[] }) {
  return (
    <ol className="m-0 grid list-none gap-0 p-0" aria-label="Pares de NRC más frecuentes">
      {items.map((c) => (
        <li
          key={`${c.programa}-${c.nrcA}-${c.nrcB}`}
          className="border-b border-border py-2.5 first:pt-0 last:border-b-0 last:pb-0"
        >
          <p className="m-0 text-compact font-semibold">
            {c.tituloA ?? c.materiaA ?? "Sin catálogo"} <span className="tabular">({c.nrcA})</span>
            <span className="font-normal text-text-2"> con </span>
            {c.tituloB ?? c.materiaB ?? "Sin catálogo"} <span className="tabular">({c.nrcB})</span>
          </p>
          <p className="m-0 mt-0.5 text-meta text-text-2 tabular">
            {numero(c.estudiantes)} estudiantes · {porcentaje(c.soporte)} del semestre {c.semestre}
          </p>
        </li>
      ))}
    </ol>
  );
}
