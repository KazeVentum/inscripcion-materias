"use client";

import { Check, ChevronDown, Circle, Lock, CalendarX } from "lucide-react";
import { Collapsible } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { AvanceOut, EstadoMateriaAvance, MateriaAvanceOut } from "@/lib/tipos";

const ESTADOS: Record<EstadoMateriaAvance, { texto: string; icono: ReactNode; clase: string }> = {
  inscrita: {
    texto: "Inscrita",
    icono: <Check aria-hidden="true" strokeWidth={2.6} />,
    clase: "text-success",
  },
  habilitada: {
    texto: "Puedes inscribirla",
    icono: <Circle aria-hidden="true" />,
    clase: "text-primary-ink",
  },
  bloqueada_prerrequisito: {
    texto: "Falta un prerrequisito",
    icono: <Lock aria-hidden="true" />,
    clase: "text-text-2",
  },
  sin_oferta: {
    texto: "Sin grupos por ahora",
    icono: <CalendarX aria-hidden="true" />,
    clase: "text-text-2",
  },
};

function Fila({ m }: { m: MateriaAvanceOut }) {
  const e = ESTADOS[m.estado];
  return (
    <li className="flex items-baseline justify-between gap-3 py-2">
      <span className="min-w-0 text-compact text-text">{m.nombre}</span>
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 text-meta font-semibold [&_svg]:size-3.5",
          e.clase,
        )}
      >
        {e.icono}
        {e.texto}
      </span>
    </li>
  );
}

export interface AvanceSemestreProps {
  avance: AvanceOut;
  abierto?: boolean;
  onAbiertoChange?: (abierto: boolean) => void;
  className?: string;
}

/**
 * Cuántas materias del semestre actual faltan por inscribir. Una línea (no una tarjeta): el
 * mensaje de la API, "faltan de total" en cifras tabulares y una barra de segmentos finos
 * (uno por materia). Al tocarla se abre la lista con el estado de cada materia; las atrasadas
 * van aparte, colapsadas, como dato secundario.
 */
export function AvanceSemestre({
  avance,
  abierto,
  onAbiertoChange,
  className,
}: AvanceSemestreProps) {
  const { totalPendientes: total, inscritas, faltan, atrasadas } = avance;
  return (
    <Collapsible.Root
      {...(abierto !== undefined ? { open: abierto } : {})}
      {...(onAbiertoChange ? { onOpenChange: onAbiertoChange } : {})}
      className={cn("border-y border-border", className)}
    >
      <Collapsible.Trigger className="group flex min-h-14 w-full items-center gap-3 py-2 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-compact font-semibold text-text">{avance.mensaje}</span>
          {total > 0 ? (
            <span
              aria-hidden="true"
              className="mt-1.5 flex max-w-[220px] gap-0.5"
              data-testid="avance-segmentos"
            >
              {Array.from({ length: total }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 flex-1 rounded-seat",
                    i < inscritas ? "bg-seat-free" : "bg-seat-taken",
                  )}
                />
              ))}
            </span>
          ) : null}
        </span>
        {total > 0 ? (
          <span className="shrink-0 text-right text-meta font-semibold text-text-2 tabular">
            Faltan {faltan} de {total}
          </span>
        ) : null}
        <ChevronDown
          aria-hidden="true"
          className="size-[18px] shrink-0 text-text-3 transition-transform duration-[var(--dur-base)] ease-out group-data-[state=open]:rotate-180"
        />
      </Collapsible.Trigger>

      <Collapsible.Content className="overflow-hidden">
        <section aria-label={`Materias del ${avance.semestreActual}.º semestre`} className="pb-3">
          {avance.materias.length === 0 ? (
            <p className="m-0 py-2 text-compact text-text-2">
              No hay materias obligatorias pendientes en tu semestre.
            </p>
          ) : (
            <ul className="m-0 list-none divide-y divide-border p-0">
              {avance.materias.map((m) => (
                <Fila key={m.materiaId} m={m} />
              ))}
            </ul>
          )}
          {atrasadas.length > 0 ? (
            <Collapsible.Root className="mt-2">
              <Collapsible.Trigger className="group flex min-h-11 items-center gap-1.5 text-meta font-semibold text-text-2">
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 -rotate-90 transition-transform duration-[var(--dur-base)] ease-out group-data-[state=open]:rotate-0"
                />
                De semestres anteriores ({atrasadas.length})
              </Collapsible.Trigger>
              <Collapsible.Content className="overflow-hidden">
                <ul className="m-0 list-none divide-y divide-border p-0 pl-5">
                  {atrasadas.map((m) => (
                    <Fila key={m.materiaId} m={m} />
                  ))}
                </ul>
              </Collapsible.Content>
            </Collapsible.Root>
          ) : null}
        </section>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
