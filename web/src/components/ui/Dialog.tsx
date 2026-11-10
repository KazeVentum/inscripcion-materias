"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Dialog as D } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { DUR, EASE_OUT, RESORTE_BANDEJA } from "@/lib/movimiento";
import { useControlable } from "@/lib/useControlable";
import { IconButton } from "./IconButton";

export interface DialogProps {
  titulo: string;
  descripcion?: ReactNode;
  children?: ReactNode;
  /** Botones al pie. En bandeja van a ancho completo, al alcance del pulgar. */
  acciones?: ReactNode;
  disparador?: ReactNode;
  abierto?: boolean;
  abiertoInicial?: boolean;
  onAbiertoChange?: (abierto: boolean) => void;
  /** "centrado" (escritorio) o "bandeja" (móvil, sube desde abajo con el vidrio del brief). */
  forma?: "centrado" | "bandeja";
  /** Fuerza el respaldo sólido de la bandeja (lo que ve quien no tiene backdrop-filter). */
  solido?: boolean;
}

/**
 * Diálogo modal (Radix). Para decisiones que no caben en el lugar: confirmar cancelar una
 * inscripción, ver la semana completa. Los errores esperables NO van en modal (brief §9).
 */
export function Dialog({
  titulo,
  descripcion,
  children,
  acciones,
  disparador,
  abierto,
  abiertoInicial = false,
  onAbiertoChange,
  forma = "centrado",
  solido = false,
}: DialogProps) {
  const [open, setOpen] = useControlable(abierto, abiertoInicial, onAbiertoChange);
  const bandeja = forma === "bandeja";

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      {disparador ? <D.Trigger asChild>{disparador}</D.Trigger> : null}
      <AnimatePresence>
        {open ? (
          <D.Portal forceMount>
            <D.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-[var(--scrim)]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: DUR.base, ease: EASE_OUT }}
              />
            </D.Overlay>
            <D.Content
              asChild
              forceMount
              {...(descripcion ? {} : { "aria-describedby": undefined })}
            >
              <motion.div
                data-solido={solido}
                className={cn(
                  "fixed z-50 flex flex-col text-text shadow-e2 focus:outline-none",
                  bandeja
                    ? "vidrio inset-x-0 bottom-0 max-h-[85dvh] rounded-t-sheet border-t border-border px-4 pt-2 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[var(--shadow-2),var(--edge)]"
                    : "top-1/2 left-1/2 w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-sheet border border-border bg-surface p-6 shadow-[var(--shadow-2),var(--edge)]",
                )}
                initial={bandeja ? { y: "100%" } : { opacity: 0, scale: 0.98 }}
                animate={bandeja ? { y: 0 } : { opacity: 1, scale: 1 }}
                exit={bandeja ? { y: "100%" } : { opacity: 0, scale: 0.98 }}
                transition={bandeja ? RESORTE_BANDEJA : { duration: DUR.base, ease: EASE_OUT }}
              >
                {bandeja ? (
                  <span
                    aria-hidden="true"
                    className="mx-auto mb-2 block h-1 w-9 rounded-pill bg-border-strong"
                  />
                ) : null}
                <div className="flex items-start justify-between gap-3">
                  <D.Title className="pt-2 text-section font-semibold">{titulo}</D.Title>
                  <D.Close asChild>
                    <IconButton etiqueta="Cerrar" icono={<X />} className="-mr-2" />
                  </D.Close>
                </div>
                {descripcion ? (
                  <D.Description className="mt-1 text-compact text-text-2 measure">
                    {descripcion}
                  </D.Description>
                ) : null}
                {children ? <div className="mt-4 min-h-0 overflow-y-auto">{children}</div> : null}
                {acciones ? (
                  <div
                    className={cn(
                      "mt-6 flex gap-3",
                      bandeja ? "flex-col-reverse [&>*]:w-full" : "justify-end",
                    )}
                  >
                    {acciones}
                  </div>
                ) : null}
              </motion.div>
            </D.Content>
          </D.Portal>
        ) : null}
      </AnimatePresence>
    </D.Root>
  );
}

export const DialogClose = D.Close;
