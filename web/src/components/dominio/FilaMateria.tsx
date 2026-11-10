"use client";

import { Check, ChevronDown, Clock } from "lucide-react";
import { Accordion } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { MateriaHabilitadaOut } from "@/lib/tipos";
import { ContadorReserva } from "./ContadorReserva";

export interface ListaMateriasProps {
  /** Título del grupo ("3.er semestre"). */
  titulo: string;
  children: ReactNode;
  abiertas?: string[];
  abiertasInicial?: string[];
  onAbiertasChange?: (ids: string[]) => void;
  className?: string;
}

/** Grupo de materias de un semestre: filas (no tarjetas) en un acordeón Radix. */
export function ListaMaterias({
  titulo,
  children,
  abiertas,
  abiertasInicial,
  onAbiertasChange,
  className,
}: ListaMateriasProps) {
  return (
    <section className={className} aria-label={titulo}>
      <h3 className="mb-2 font-body text-compact font-semibold text-text-2">{titulo}</h3>
      <Accordion.Root
        type="multiple"
        {...(abiertas ? { value: abiertas } : {})}
        {...(abiertasInicial ? { defaultValue: abiertasInicial } : {})}
        {...(onAbiertasChange ? { onValueChange: onAbiertasChange } : {})}
        className="border-b border-border"
      >
        {children}
      </Accordion.Root>
    </section>
  );
}

export interface FilaMateriaProps {
  materia: MateriaHabilitadaOut;
  /** Inscrita: NRC elegido (se muestra bajo el nombre). */
  nrcInscrito?: string;
  /** Reservada: vencimiento de la reserva (muestra el contador en dorado). */
  reservaVence?: string;
  ahora?: number;
  /** Tarjetas de NRC (o EstadoVacio) que se revelan al expandir. */
  children?: ReactNode;
}

/** Fila de materia: nombre, código, créditos y grupos; expandir revela los NRC. */
export function FilaMateria({
  materia,
  nrcInscrito,
  reservaVence,
  ahora,
  children,
}: FilaMateriaProps) {
  const inscrita = materia.estado === "inscrita" && !reservaVence;
  const reservada = Boolean(reservaVence);

  let derecha: ReactNode;
  if (reservada && reservaVence) {
    derecha = (
      <span className="inline-flex items-center gap-1 text-accent-ink">
        <Clock aria-hidden="true" className="size-3.5" />
        Reservada{" "}
        <ContadorReserva vencimiento={reservaVence} {...(ahora !== undefined ? { ahora } : {})} />
      </span>
    );
  } else if (inscrita) {
    derecha = (
      <span className="inline-flex items-center gap-1 text-success">
        <Check aria-hidden="true" strokeWidth={2.6} className="size-3.5" />
        Inscrita
      </span>
    );
  } else {
    derecha =
      materia.nrcDisponibles === 0
        ? "Sin grupos"
        : `${materia.nrcDisponibles} ${materia.nrcDisponibles === 1 ? "grupo" : "grupos"}`;
  }

  return (
    <Accordion.Item value={materia.materiaId} className="border-t border-border">
      <Accordion.Header className="m-0">
        <Accordion.Trigger
          className={cn(
            "group grid min-h-15 w-full grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2.5 py-2 text-left",
            "rounded-control focus-visible:outline-offset-0",
          )}
        >
          <ChevronDown
            aria-hidden="true"
            className="size-[18px] -rotate-90 text-text-3 transition-transform duration-[var(--dur-base)] ease-out group-data-[state=open]:rotate-0"
          />
          <span className="min-w-0">
            <span className="block truncate font-head text-subject font-semibold">
              {materia.nombre}
            </span>
            <span className="block text-[13px] leading-[18px] text-text-3 tabular">
              {materia.materiaId}, {materia.creditos} créditos
              {nrcInscrito ? `, NRC ${nrcInscrito}` : ""}
            </span>
          </span>
          <span className="text-right text-meta font-semibold text-text-2 tabular">{derecha}</span>
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content className="overflow-hidden data-[state=closed]:animate-[acordeon-cierra_var(--dur-base)_var(--ease-in-out)] data-[state=open]:animate-[acordeon-abre_var(--dur-base)_var(--ease-out)]">
        <div className="grid gap-[var(--gap-cards)] pb-4 pl-[30px]">{children}</div>
      </Accordion.Content>
    </Accordion.Item>
  );
}
