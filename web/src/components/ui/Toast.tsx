"use client";

import { TriangleAlert, WifiOff, X } from "lucide-react";
import { Toast as T } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { CheckAnimado } from "./CheckAnimado";

export type TonoToast = "exito" | "error" | "sin-conexion";

/**
 * Proveedor + zona de toasts. En móvil se apoya encima de la bandeja (offsetInferior).
 */
export function ToastProvider({
  children,
  offsetInferior = 16,
}: {
  children: ReactNode;
  offsetInferior?: number;
}) {
  return (
    <T.Provider swipeDirection="down" duration={4000} label="Notificaciones">
      {children}
      <T.Viewport
        style={{ paddingBottom: offsetInferior }}
        className="fixed inset-x-0 bottom-0 z-[60] m-0 flex list-none flex-col items-center gap-2 px-4 outline-none"
      />
    </T.Provider>
  );
}

const ICONOS: Record<TonoToast, ReactNode> = {
  exito: <CheckAnimado className="text-success" />,
  error: <TriangleAlert className="size-5 text-danger" aria-hidden="true" />,
  "sin-conexion": <WifiOff className="size-5 text-text-2" aria-hidden="true" />,
};

export interface ToastProps {
  tono?: TonoToast;
  children: ReactNode;
  abierto?: boolean;
  onAbiertoChange?: (abierto: boolean) => void;
  /** Acción opcional (p. ej. "Ver horario"). */
  accion?: { etiqueta: string; alt: string; onClick: () => void };
  duracion?: number;
}

export function Toast({
  tono = "exito",
  children,
  abierto,
  onAbiertoChange,
  accion,
  duracion,
}: ToastProps) {
  return (
    <T.Root
      {...(abierto !== undefined ? { open: abierto } : {})}
      {...(onAbiertoChange ? { onOpenChange: onAbiertoChange } : {})}
      {...(duracion !== undefined ? { duration: duracion } : {})}
      type={tono === "exito" ? "foreground" : "background"}
      className={cn(
        "flex w-full max-w-[360px] items-start gap-2.5 rounded-control border border-border bg-surface py-3 pr-2 pl-3.5 text-compact text-text shadow-[var(--shadow-2),var(--edge)]",
        "data-[state=open]:animate-[toast-entra_var(--dur-base)_var(--ease-out)] data-[state=closed]:animate-[toast-sale_var(--dur-fast)_var(--ease-in-out)]",
        "data-[swipe=move]:translate-y-[var(--radix-toast-swipe-move-y)] data-[swipe=end]:animate-[toast-sale_var(--dur-fast)_var(--ease-in-out)]",
      )}
    >
      <span className="mt-px shrink-0">{ICONOS[tono]}</span>
      <T.Description className="min-w-0 flex-1 py-0.5">{children}</T.Description>
      {accion ? (
        <T.Action altText={accion.alt} asChild>
          <button
            type="button"
            onClick={accion.onClick}
            className="h-8 shrink-0 rounded-chip px-2 text-compact font-semibold text-info underline underline-offset-[3px]"
          >
            {accion.etiqueta}
          </button>
        </T.Action>
      ) : null}
      <T.Close
        aria-label="Cerrar aviso"
        className="-my-1 grid size-8 shrink-0 place-items-center rounded-chip text-text-3 hover:bg-surface-2 hover:text-text"
      >
        <X className="size-4" aria-hidden="true" />
      </T.Close>
    </T.Root>
  );
}
