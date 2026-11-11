import { agruparAuditoria, etiquetaResultado } from "@/lib/analitica";
import { latencia, numero } from "@/lib/formatos";
import type { AuditoriaFila } from "@/lib/tipos";

/** Resultado × n × p50/p95 agrupado por tipo de evento (cada intento trazado, RNF). */
export function TablaAuditoria({ filas }: { filas: readonly AuditoriaFila[] }) {
  const grupos = agruparAuditoria(filas);
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full border-collapse text-compact tabular">
        <caption className="sr-only">Eventos por tipo y resultado, con latencia p50 y p95</caption>
        <thead>
          <tr className="border-b border-border-strong text-left text-meta text-text-2">
            <th scope="col" className="py-2 pr-2 font-semibold">
              Resultado
            </th>
            <th scope="col" className="py-2 pr-2 text-right font-semibold">
              n
            </th>
            <th scope="col" className="py-2 pr-2 text-right font-semibold">
              p50
            </th>
            <th scope="col" className="py-2 text-right font-semibold">
              p95
            </th>
          </tr>
        </thead>
        {grupos.map((g) => (
          <tbody key={g.tipo}>
            <tr>
              <th
                scope="rowgroup"
                colSpan={4}
                className="bg-surface-2 px-2 py-1.5 text-left text-meta font-semibold"
              >
                {g.etiqueta} · {numero(g.total)}
              </th>
            </tr>
            {g.filas.map((f) => (
              <tr key={f.resultado} className="border-b border-border">
                <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                  {etiquetaResultado(f.resultado)}
                </th>
                <td className="py-1.5 pr-2 text-right">{numero(f.n)}</td>
                <td className="py-1.5 pr-2 text-right">{latencia(f.latenciaP50Ms)}</td>
                <td className="py-1.5 text-right">{latencia(f.latenciaP95Ms)}</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
