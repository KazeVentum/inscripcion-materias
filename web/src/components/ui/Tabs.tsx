"use client";

import { Tabs as T } from "radix-ui";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { cn } from "@/lib/cn";

/**
 * Control segmentado sobre Radix Tabs (teclado: flechas, Inicio, Fin).
 * Uso típico: "Semana" / "Materias" en móvil.
 */
export const Tabs = T.Root;

export const TabsList = forwardRef<
  ElementRef<typeof T.List>,
  ComponentPropsWithoutRef<typeof T.List>
>(function TabsList({ className, ...rest }, ref) {
  return (
    <T.List
      ref={ref}
      className={cn(
        "inline-grid auto-cols-fr grid-flow-col gap-1 rounded-control bg-surface-2 p-1",
        className,
      )}
      {...rest}
    />
  );
});

export const TabsTrigger = forwardRef<
  ElementRef<typeof T.Trigger>,
  ComponentPropsWithoutRef<typeof T.Trigger>
>(function TabsTrigger({ className, ...rest }, ref) {
  return (
    <T.Trigger
      ref={ref}
      className={cn(
        "inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-[7px] px-3 text-compact font-semibold text-text-2 tabular",
        "transition-[background-color,color,box-shadow] duration-[var(--dur-fast)] ease-out hover:text-text",
        "data-[state=active]:bg-surface data-[state=active]:text-text data-[state=active]:shadow-[var(--shadow-1),inset_0_0_0_1px_var(--border-strong)]",
        "disabled:opacity-60 [&_svg]:size-4",
        className,
      )}
      {...rest}
    />
  );
});

export const TabsContent = forwardRef<
  ElementRef<typeof T.Content>,
  ComponentPropsWithoutRef<typeof T.Content>
>(function TabsContent({ className, ...rest }, ref) {
  return (
    <T.Content ref={ref} className={cn("focus-visible:outline-offset-4", className)} {...rest} />
  );
});
