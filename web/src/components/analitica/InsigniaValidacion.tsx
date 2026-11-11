"use client";

import { CircleCheck, CircleX } from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import { numero } from "@/lib/formatos";
import { useMediaQuery } from "@/lib/useMediaQuery";
import type { ValidacionOut } from "@/lib/tipos";
import { cn } from "@/lib/cn";

/**
 * Insignia de linaje: "Conteos bronce → plata → oro cuadran". Al abrirla muestra la
 * ecuación de la cuadratura y cada check (esperado contra obtenido). Si algo no cuadra,
 * cambia de forma (icono y texto) y de color, y los checks fallidos van primero.
 */
export function InsigniaValidacion({ validacion }: { validacion: ValidacionOut }) {
  const movil = !useMediaQuery("(min-width: 640px)");
  const ok = validacion.cuadra;
  const checks = [...validacion.checks].sort((a, b) => Number(a.ok) - Number(b.ok));
  return (
    <Dialog
      forma={movil ? "bandeja" : "centrado"}
      titulo={ok ? "Los conteos cuadran" : "Los conteos no cuadran"}
      descripcion={`Bronce ${numero(validacion.lineasBronce)} líneas = plata ${numero(validacion.eventosPlata)} eventos + ${numero(validacion.duplicados)} duplicados + ${numero(validacion.invalidos)} inválidos.`}
      disparador={
        <button
          type="button"
          className={cn(
            "inline-flex min-h-11 items-center gap-1.5 rounded-pill px-3 text-compact font-semibold",
            ok
              ? "bg-success-soft text-success shadow-[inset_0_0_0_1px_var(--success)]"
              : "bg-danger-soft text-danger shadow-[inset_0_0_0_1.5px_var(--danger)]",
          )}
        >
          {ok ? (
            <CircleCheck aria-hidden="true" className="size-4" />
          ) : (
            <CircleX aria-hidden="true" className="size-4" />
          )}
          {ok
            ? "Conteos bronce → plata → oro cuadran"
            : "Los conteos bronce → plata → oro no cuadran"}
        </button>
      }
    >
      <ul className="m-0 grid list-none gap-2 p-0">
        {checks.map((c) => (
          <li key={c.nombre} className="flex items-start gap-2 text-compact">
            {c.ok ? (
              <CircleCheck aria-label="Cuadra" className="mt-0.5 size-4 shrink-0 text-success" />
            ) : (
              <CircleX aria-label="No cuadra" className="mt-0.5 size-4 shrink-0 text-danger" />
            )}
            <span className="min-w-0">
              {c.nombre}
              <span className="block text-meta text-text-2 tabular">
                esperado {numero(c.esperado)} · obtenido {numero(c.obtenido)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
