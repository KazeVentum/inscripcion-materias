"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { ORDENES, ariaSort, etiquetaOrden, textoTiempoLlenado } from "@/lib/analitica";
import { cn } from "@/lib/cn";
import { numero, porcentaje } from "@/lib/formatos";
import type { DemandaNrcItem, OrdenDemanda } from "@/lib/tipos";
import { BarraOcupacion } from "./BarraOcupacion";

export interface TablaDemandaNrcProps {
  items: readonly DemandaNrcItem[];
  orden: OrdenDemanda;
  onOrden: (o: OrdenDemanda) => void;
}

const COLUMNAS: { orden: OrdenDemanda; titulo: string; alinear: "izq" | "der" }[] = [
  { orden: "demanda", titulo: "Intentos", alinear: "der" },
  { orden: "sin_cupo", titulo: "Sin cupo", alinear: "der" },
  { orden: "ocupacion", titulo: "Ocupación", alinear: "izq" },
  { orden: "vacios", titulo: "Vacíos", alinear: "der" },
  { orden: "tiempo_llenado", titulo: "Tiempo en llenarse", alinear: "der" },
];

function lugar(i: DemandaNrcItem): string {
  return [i.sede, i.franja].filter(Boolean).join(" · ");
}

/**
 * Demanda por NRC. Escritorio: tabla con encabezados ordenables (botones con aria-sort que
 * piden al endpoint el orden). Móvil: lista de filas. Ambas llevan los mismos datos.
 */
export function TablaDemandaNrc({ items, orden, onOrden }: TablaDemandaNrcProps) {
  return (
    <>
      <ul
        className="m-0 grid list-none grid-cols-[minmax(0,1fr)] gap-2 p-0 lg:hidden"
        aria-label="NRC por demanda"
      >
        {items.map((i) => (
          <li key={i.nrc} className="rounded-control border border-border p-3">
            <p className="m-0 text-compact font-semibold break-words">
              <span className="tabular">{i.nrc}</span> · {i.materia ?? "Sin catálogo"}
            </p>
            <p className="m-0 text-meta text-text-2">{lugar(i)}</p>
            {i.ocupacion !== null && i.cupoTotal ? (
              <div className="mt-2">
                <BarraOcupacion ocupados={i.ocupados} total={i.cupoTotal} critico={i.sinCupo > 0} />
                <p className="m-0 mt-1 text-meta text-text-2 tabular">
                  {numero(i.ocupados)} de {numero(i.cupoTotal)} ocupados (
                  {porcentaje(i.ocupacion, 0)})
                </p>
              </div>
            ) : null}
            <p className="m-0 mt-1.5 text-meta text-text-2 tabular">
              {numero(i.intentos)} intentos · {numero(i.sinCupo)} sin cupo ·{" "}
              {i.llenoEn
                ? `se llenó en ${textoTiempoLlenado(i.tiempoHastaLlenarseS)}`
                : "no se llenó"}
            </p>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full border-collapse text-compact tabular">
          <caption className="sr-only">
            Demanda y ocupación por NRC, ordenada por: {etiquetaOrden(orden)}
          </caption>
          <thead>
            <tr className="border-b border-border-strong text-left text-meta text-text-2">
              <th scope="col" className="py-2 pr-3 font-semibold">
                NRC
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold">
                Materia
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold">
                Sede y franja
              </th>
              {COLUMNAS.map((c) => {
                const activa = c.orden === orden;
                return (
                  <th
                    key={c.orden}
                    scope="col"
                    aria-sort={ariaSort(c.orden, orden)}
                    className={cn("py-0 pr-3 font-semibold", c.alinear === "der" && "text-right")}
                  >
                    <button
                      type="button"
                      onClick={() => onOrden(c.orden)}
                      className={cn(
                        "inline-flex h-11 items-center gap-1 rounded-chip px-1 font-semibold hover:text-text",
                        activa && "text-primary-ink",
                      )}
                    >
                      {c.titulo}
                      {activa ? (
                        c.orden === "tiempo_llenado" ? (
                          <ArrowUp aria-hidden="true" className="size-3.5" />
                        ) : (
                          <ArrowDown aria-hidden="true" className="size-3.5" />
                        )
                      ) : null}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.nrc} className="border-b border-border">
                <th scope="row" className="py-2 pr-3 text-left font-semibold">
                  {i.nrc}
                </th>
                <td className="max-w-[260px] truncate py-2 pr-3" title={i.materia ?? undefined}>
                  {i.materia ?? "Sin catálogo"}
                </td>
                <td className="py-2 pr-3 text-text-2">{lugar(i)}</td>
                <td className="py-2 pr-3 text-right">{numero(i.intentos)}</td>
                <td className="py-2 pr-3 text-right">{numero(i.sinCupo)}</td>
                <td className="min-w-[180px] py-2 pr-3">
                  {i.ocupacion !== null && i.cupoTotal ? (
                    <div className="flex items-center gap-2">
                      <BarraOcupacion
                        ocupados={i.ocupados}
                        total={i.cupoTotal}
                        critico={i.sinCupo > 0}
                        className="w-28 shrink-0"
                      />
                      <span className="text-meta text-text-2">
                        {numero(i.ocupados)}/{numero(i.cupoTotal)}
                      </span>
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-2 pr-3 text-right">
                  {i.cuposVacios === null ? "—" : numero(i.cuposVacios)}
                </td>
                <td className="py-2 pr-3 text-right">
                  {textoTiempoLlenado(i.tiempoHastaLlenarseS)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export { ORDENES };
