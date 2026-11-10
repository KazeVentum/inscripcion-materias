"use client";

import { Check, Clock } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/Button";
import { ContadorReserva } from "./ContadorReserva";

export type EstadoBotonInscribir = "reposo" | "inscribiendo" | "reservado" | "inscrita";

export interface BotonInscribirProps extends Omit<
  ButtonProps,
  "variante" | "cargando" | "children" | "icono"
> {
  nrc: string;
  estado?: EstadoBotonInscribir;
  /** Reservado: vencimiento de la reserva. */
  vencimiento?: string;
  ahora?: number;
  /** "Inscribir" a secas (bandeja móvil, donde el NRC ya está al lado). */
  sinNrc?: boolean;
}

/**
 * Inscribir → Inscribiendo… → Reservado 4:32 → Inscrita. La acción conserva su nombre en
 * todo el flujo. Deshabilitado solo con motivo visible (prop `motivo`).
 */
export function BotonInscribir({
  nrc,
  estado = "reposo",
  vencimiento,
  ahora,
  sinNrc = false,
  ...rest
}: BotonInscribirProps) {
  switch (estado) {
    case "inscribiendo":
      return (
        <Button cargando {...rest}>
          Inscribiendo…
        </Button>
      );
    case "reservado":
      return (
        <Button variante="reservado" icono={<Clock aria-hidden="true" />} aria-disabled {...rest}>
          Reservado{" "}
          {vencimiento ? (
            <ContadorReserva
              vencimiento={vencimiento}
              {...(ahora !== undefined ? { ahora } : {})}
            />
          ) : null}
        </Button>
      );
    case "inscrita":
      return (
        <Button
          variante="hecho"
          icono={<Check aria-hidden="true" strokeWidth={2.6} />}
          aria-disabled
          {...rest}
        >
          Inscrita
        </Button>
      );
    default:
      return (
        <Button {...rest}>
          {sinNrc ? "Inscribir" : `Inscribir ${nrc}`}
          {sinNrc ? <span className="sr-only"> {nrc}</span> : null}
        </Button>
      );
  }
}
