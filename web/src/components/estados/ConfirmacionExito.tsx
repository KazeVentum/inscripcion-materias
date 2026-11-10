"use client";

import { Toast } from "@/components/ui/Toast";

export interface ConfirmacionExitoProps {
  materia: string;
  nrc: string;
  abierto?: boolean;
  onAbiertoChange?: (abierto: boolean) => void;
  onVerHorario?: () => void;
}

/** Toast de éxito (4 s, check animado): "Inscrita: Sistemas Operativos, NRC 80852." */
export function ConfirmacionExito({
  materia,
  nrc,
  abierto,
  onAbiertoChange,
  onVerHorario,
}: ConfirmacionExitoProps) {
  return (
    <Toast
      tono="exito"
      {...(abierto !== undefined ? { abierto } : {})}
      {...(onAbiertoChange ? { onAbiertoChange } : {})}
      {...(onVerHorario
        ? { accion: { etiqueta: "Ver horario", alt: "Ver tu horario", onClick: onVerHorario } }
        : {})}
    >
      <span className="tabular">
        Inscrita: {materia}, NRC {nrc}.
      </span>
    </Toast>
  );
}
