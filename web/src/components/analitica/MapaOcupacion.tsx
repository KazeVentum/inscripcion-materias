import { Flame } from "lucide-react";
import {
  UMBRAL_OCUPACION_ALTA,
  etiquetaFranja,
  matrizOcupacion,
  pasoEscala,
} from "@/lib/analitica";
import { numero, porcentaje } from "@/lib/formatos";
import type { OcupacionFranjaItem } from "@/lib/tipos";

const FONDO = ["bg-data-1", "bg-data-2", "bg-data-3", "bg-data-4", "bg-data-5"] as const;
const TEXTO = [
  "text-on-data-1",
  "text-on-data-2",
  "text-on-data-3",
  "text-on-data-4",
  "text-on-data-5",
] as const;

/**
 * Matriz franja × sede: el valor siempre está escrito en la celda y el color solo lo
 * refuerza (una escala secuencial azul). Una ocupación alta lleva contorno dorado y un
 * icono, y la nota al pie lo explica. Es una <table>: ya es su propia alternativa accesible.
 */
export function MapaOcupacion({ items }: { items: readonly OcupacionFranjaItem[] }) {
  const m = matrizOcupacion(items);
  return (
    <div>
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full border-separate border-spacing-1 text-center tabular">
          <caption className="sr-only">Ocupación de cupos por franja y sede</caption>
          <thead>
            <tr>
              <td />
              {m.sedes.map((s) => (
                <th key={s} scope="col" className="px-1 pb-1 text-meta font-semibold text-text-2">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.franjas.map((f) => (
              <tr key={f}>
                <th
                  scope="row"
                  className="pr-2 text-left text-compact font-semibold whitespace-nowrap"
                >
                  {etiquetaFranja(f)}
                </th>
                {m.sedes.map((s) => {
                  const c = m.celda(f, s);
                  if (!c || c.ocupacion === null) {
                    return (
                      <td key={s} className="rounded-chip bg-surface-2 py-3 text-text-2">
                        <span aria-hidden="true">—</span>
                        <span className="sr-only">sin NRC</span>
                      </td>
                    );
                  }
                  const paso = pasoEscala(c.ocupacion);
                  const alta = c.ocupacion >= UMBRAL_OCUPACION_ALTA;
                  return (
                    <td
                      key={s}
                      className={`rounded-chip px-1 py-2.5 ${FONDO[paso - 1]} ${TEXTO[paso - 1]} ${
                        alta ? "shadow-[inset_0_0_0_2px_var(--accent)]" : ""
                      }`}
                    >
                      <span className="flex items-center justify-center gap-1 font-head text-subject font-bold">
                        {alta ? <Flame aria-hidden="true" className="size-3.5" /> : null}
                        {porcentaje(c.ocupacion, 0)}
                      </span>
                      <span className="block text-meta">
                        {numero(c.ocupados)} de {numero(c.cupoTotal)}
                      </span>
                      <span className="sr-only">
                        {`, ${numero(c.nrcs)} NRC, ${numero(c.nrcLlenos)} llenos${alta ? ", ocupación alta" : ""}`}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 mt-3 flex items-center gap-1.5 text-meta text-text-2">
        <Flame aria-hidden="true" className="size-3.5 shrink-0 text-accent-ink" />
        Contorno dorado: {porcentaje(UMBRAL_OCUPACION_ALTA, 0)} de ocupación o más. Cupos ocupados
        de cupos totales.
      </p>
    </div>
  );
}
