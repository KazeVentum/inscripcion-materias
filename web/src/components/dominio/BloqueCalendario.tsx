"use client";

import { Clock } from "lucide-react";
import { motion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { diaLargo, mmss, segundosHasta, tituloCorto } from "@/lib/horario";
import { DUR, EASE_OUT } from "@/lib/movimiento";
import type { BloqueCalendarioDatos, EstadoBloque } from "@/lib/tipos";
import { useAhora } from "@/lib/useAhora";

export interface BloqueCalendarioProps {
  bloque: BloqueCalendarioDatos;
  /** "compacto": semana móvil (solo NRC o contador). "completo": título, hora y salón. */
  variante?: "compacto" | "completo";
  /** Posición absoluta calculada por CalendarioSemanal; sin ella ocupa su contenedor. */
  style?: CSSProperties;
  ahora?: number;
  className?: string;
}

const ESTILO: Record<EstadoBloque, string> = {
  inscrito:
    "bg-[var(--block-enrolled-bg)] text-[var(--block-enrolled-fg)] shadow-[inset_3px_0_0_var(--block-enrolled-edge)]",
  "vista-previa":
    "border-[1.5px] border-dashed border-primary-ink bg-primary-soft text-primary-ink",
  reservado: "bg-accent-soft text-text shadow-[inset_3px_0_0_var(--accent)]",
  conflicto: "bloque-conflicto border-[1.5px] border-danger text-danger",
};

const ESTADO_HABLADO: Record<EstadoBloque, string> = {
  inscrito: "inscrita",
  "vista-previa": "vista previa",
  reservado: "reservada",
  conflicto: "en conflicto",
};

/** Bloque del calendario, posicionado al minuto por CalendarioSemanal. */
export function BloqueCalendario({
  bloque,
  variante = "completo",
  style,
  ahora,
  className,
}: BloqueCalendarioProps) {
  const t = useAhora(1000, ahora);
  const restante =
    bloque.estado === "reservado" && bloque.vencimiento
      ? mmss(segundosHasta(bloque.vencimiento, t))
      : null;
  const compacto = variante === "compacto";
  const lugar = [bloque.edificio, bloque.salon].filter(Boolean).join(" ");

  const descripcion = [
    `${bloque.titulo}, NRC ${bloque.nrc}, ${ESTADO_HABLADO[bloque.estado]}`,
    `${diaLargo(bloque.dia)} de ${bloque.inicio} a ${bloque.fin}`,
    lugar || null,
    bloque.estado === "conflicto" && bloque.cruzaCon ? `cruza con ${bloque.cruzaCon}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  let visible: ReactNode;
  if (compacto) {
    visible =
      bloque.estado === "reservado" && restante
        ? restante
        : bloque.estado === "conflicto"
          ? "Cruce"
          : bloque.nrc;
  } else if (bloque.estado === "conflicto") {
    visible = (
      <>
        <span className="block">Cruza con</span>
        <span className="block font-bold">{bloque.cruzaCon ?? "otro NRC"}</span>
      </>
    );
  } else {
    visible = (
      <>
        <span className="block truncate font-bold">
          {bloque.estado === "vista-previa" ? "Vista previa" : tituloCorto(bloque.titulo)}
        </span>
        {bloque.estado === "reservado" && restante ? (
          <span className="flex items-center gap-1">
            <Clock aria-hidden="true" className="size-3 shrink-0" />
            Reservado {restante}
          </span>
        ) : bloque.estado === "vista-previa" ? (
          <span className="block">{bloque.nrc}</span>
        ) : null}
        <span className="block">
          {bloque.inicio}–{bloque.fin}
        </span>
        {lugar && bloque.estado !== "vista-previa" ? (
          <span className="block truncate opacity-90">{lugar}</span>
        ) : null}
      </>
    );
  }

  return (
    <motion.li
      initial={bloque.estado === "vista-previa" ? { opacity: 0, scale: 0.98 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: DUR.fast, ease: EASE_OUT }}
      style={style}
      className={cn(
        "list-none overflow-hidden rounded-chip text-block font-semibold stretch-calendar tabular",
        compacto ? "px-1 py-0.5 whitespace-nowrap" : "px-1.5 py-1",
        ESTILO[bloque.estado],
        className,
      )}
    >
      <span className="sr-only">{descripcion}</span>
      <span aria-hidden="true">{visible}</span>
    </motion.li>
  );
}
