"use client";

import { AnimatePresence, motion } from "motion/react";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { MODALIDAD, horarioLegible, salonesLegibles } from "@/lib/horario";
import { DUR, EASE_IN_OUT } from "@/lib/movimiento";
import type { NrcOut } from "@/lib/tipos";
import { AvisoAlternativa } from "./AvisoAlternativa";
import { BarraCupos } from "./BarraCupos";

export interface TarjetaNrcProps {
  nrc: NrcOut;
  /** Vista previa activa: sus bloques están dibujados en la semana. */
  seleccionada?: boolean;
  /** Clic/toque: fija la selección (y la vista previa). */
  onSeleccionar?: (nrc: NrcOut) => void;
  /** Escritorio: hover/foco = vista previa temporal. */
  onVistaPrevia?: (nrc: NrcOut | null) => void;
  /** Acción visible en la tarjeta (escritorio). En móvil la acción vive en la bandeja. */
  accion?: ReactNode;
  /** Si el NRC se agota y la API dio alternativa, el aviso ocupa el lugar de la tarjeta. */
  alternativa?: NrcOut | null;
  onInscribirAlternativa?: (nrc: string) => void;
  onVerOtros?: () => void;
  /** Sin conexión: cupos atenuados. */
  sinConexion?: boolean;
  className?: string;
}

/**
 * Tarjeta de NRC. La zona de contenido es un botón conmutable (aria-pressed) que prueba el
 * NRC en la semana; la acción "Inscribir" va fuera de ese botón (no hay interactivos anidados).
 */
export function TarjetaNrc({
  nrc,
  seleccionada = false,
  onSeleccionar,
  onVistaPrevia,
  accion,
  alternativa,
  onInscribirAlternativa,
  onVerOtros,
  sinConexion = false,
  className,
}: TarjetaNrcProps) {
  const id = useId();
  const agotado = nrc.cuposLibres <= 0;
  const virtual = nrc.bloques.length === 0;
  const mostrarAviso = agotado && alternativa !== undefined;

  return (
    <AnimatePresence mode="wait" initial={false}>
      {mostrarAviso ? (
        <motion.div
          key="aviso"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: DUR.base, ease: EASE_IN_OUT }}
          className={className}
        >
          <AvisoAlternativa
            agotado={nrc.nrc}
            alternativa={alternativa}
            {...(onInscribirAlternativa ? { onInscribir: onInscribirAlternativa } : {})}
            {...(onVerOtros ? { onVerOtros } : {})}
            {...(sinConexion ? { motivoDeshabilitado: "Sin conexión" } : {})}
          />
        </motion.div>
      ) : (
        <motion.article
          key="tarjeta"
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: DUR.base, ease: EASE_IN_OUT }}
          aria-labelledby={`${id}-nrc`}
          className={cn(
            "relative grid grid-cols-[minmax(0,1fr)_auto] rounded-card border bg-surface shadow-edge",
            "transition-[background-color,border-color] duration-[var(--dur-fast)] ease-out",
            accion && "gap-x-4",
            seleccionada
              ? "border-2 border-primary-ink bg-primary-soft p-[13px]"
              : "border-border p-3.5 hover:border-border-strong",
            agotado && "bg-surface",
            className,
          )}
        >
          <button
            type="button"
            aria-pressed={seleccionada}
            aria-describedby={`${id}-detalle ${id}-cupos`}
            disabled={agotado}
            onClick={() => onSeleccionar?.(nrc)}
            onPointerEnter={(e) => e.pointerType === "mouse" && onVistaPrevia?.(nrc)}
            onPointerLeave={(e) => e.pointerType === "mouse" && onVistaPrevia?.(null)}
            onFocus={() => onVistaPrevia?.(nrc)}
            onBlur={() => onVistaPrevia?.(null)}
            className={cn(
              "col-span-full row-start-1 min-w-0 rounded-[10px] text-left",
              // La tarjeta entera es el área táctil: el ::after del botón la cubre.
              "after:absolute after:inset-0 after:rounded-card after:content-['']",
              "focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-focus focus-visible:after:outline-solid",
              agotado ? "cursor-default" : "cursor-pointer",
            )}
          >
            <span className="flex items-baseline justify-between gap-2">
              <span id={`${id}-nrc`} className="text-body font-bold tabular">
                {nrc.nrc}
              </span>
              <span className="truncate text-meta text-text-2">
                {nrc.sede === MODALIDAD[nrc.modalidad]
                  ? nrc.sede
                  : `${MODALIDAD[nrc.modalidad]}, ${nrc.sede}`}
              </span>
            </span>
            <span className="mt-1 block text-compact font-semibold tabular">
              {horarioLegible(nrc.bloques)}
            </span>
          </button>
          <p
            id={`${id}-detalle`}
            className="col-span-full row-start-2 m-0 text-[13px] leading-[18px] text-text-2"
          >
            {virtual ? null : <span className="tabular">{salonesLegibles(nrc.bloques)}, </span>}
            {nrc.docente}
          </p>
          <div id={`${id}-cupos`} className="col-start-1 row-start-3 min-w-0 self-end">
            <BarraCupos
              className="mt-2.5"
              libres={nrc.cuposLibres}
              total={nrc.cupoTotal}
              nrc={nrc.nrc}
              atenuada={sinConexion}
            />
          </div>
          {accion ? (
            <div className="relative z-10 col-start-2 row-start-3 mt-2 self-end">{accion}</div>
          ) : null}
        </motion.article>
      )}
    </AnimatePresence>
  );
}
