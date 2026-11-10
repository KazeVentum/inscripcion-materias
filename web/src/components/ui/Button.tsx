"use client";

import { Slot } from "radix-ui";
import { forwardRef, useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export type VarianteBoton =
  | "primario"
  | "secundario"
  | "fantasma"
  | "peligro"
  /** Estados del flujo de inscripción (brief §5, botón Inscribir). */
  | "reservado"
  | "hecho";

export type TamanoBoton = "md" | "sm";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBoton;
  tamano?: TamanoBoton;
  /** Muestra spinner, mantiene el ancho y deshabilita. Pasa el texto de progreso como hijo. */
  cargando?: boolean;
  /** Ícono a la izquierda (Lucide, 18 px). */
  icono?: ReactNode;
  /** Ancho completo (bandeja). */
  bloque?: boolean;
  /** Motivo visible de por qué está deshabilitado (el brief no permite deshabilitar sin él). */
  motivo?: string;
  asChild?: boolean;
}

const VARIANTES: Record<VarianteBoton, string> = {
  primario: "bg-primary text-on-primary shadow-[var(--button-sheen)] hover:brightness-110",
  secundario:
    "bg-surface text-text shadow-[inset_0_0_0_1px_var(--border-strong)] hover:bg-surface-2",
  fantasma: "bg-transparent text-primary-ink hover:bg-primary-soft",
  peligro: "bg-danger text-on-danger hover:brightness-110",
  reservado: "bg-accent text-on-accent",
  hecho: "bg-success-soft text-success shadow-[inset_0_0_0_1.5px_var(--success)]",
};

const TAMANOS: Record<TamanoBoton, string> = {
  md: "h-12 px-5 text-[15px] leading-5 [&_svg]:size-[18px]",
  sm: "h-11 px-4 text-compact [&_svg]:size-4",
};

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-4 shrink-0 animate-giro rounded-pill border-2 border-current border-t-transparent opacity-80",
        className,
      )}
    />
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variante = "primario",
    tamano = "md",
    cargando = false,
    icono,
    bloque = false,
    motivo,
    asChild = false,
    disabled,
    className,
    children,
    type,
    "aria-describedby": describedBy,
    ...rest
  },
  ref,
) {
  const idMotivo = useId();
  const Comp = asChild ? Slot.Root : "button";
  const deshabilitado = disabled || cargando;

  const boton = (
    <Comp
      ref={ref}
      type={asChild ? undefined : (type ?? "button")}
      disabled={deshabilitado}
      aria-busy={cargando || undefined}
      aria-describedby={
        [describedBy, motivo ? idMotivo : null].filter(Boolean).join(" ") || undefined
      }
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-control font-body font-semibold tabular",
        "transition-[transform,background-color,filter] duration-[var(--dur-press)] ease-out active:scale-[.98]",
        VARIANTES[variante],
        TAMANOS[tamano],
        bloque && "w-full",
        cargando && "cursor-progress opacity-85",
        disabled &&
          !cargando &&
          "cursor-not-allowed bg-surface-2 text-text-2 shadow-none hover:bg-surface-2 hover:brightness-100 active:scale-100",
        className,
      )}
      {...rest}
    >
      {cargando ? <Spinner /> : icono}
      {children}
    </Comp>
  );

  if (!motivo) return boton;
  return (
    <span className={cn("inline-flex flex-col gap-1", bloque && "w-full")}>
      {boton}
      <span id={idMotivo} className="text-meta text-text-2">
        {motivo}
      </span>
    </span>
  );
});
