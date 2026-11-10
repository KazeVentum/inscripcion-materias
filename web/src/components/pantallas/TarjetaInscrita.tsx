"use client";

import { Check, Clock } from "lucide-react";
import { useState } from "react";
import { ContadorReserva } from "@/components/dominio/ContadorReserva";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { MODALIDAD, horarioLegible, salonesLegibles } from "@/lib/horario";
import type { HorarioItemOut } from "@/lib/tipos";
import { useMediaQuery } from "@/lib/useMediaQuery";

export interface TarjetaInscritaProps {
  item: HorarioItemOut;
  /** Cancela y devuelve si se logró. */
  onCancelar: (nrc: string, titulo: string) => Promise<boolean>;
  /** Muestra el nombre de la materia (en el horario; en la lista ya está en la fila). */
  conTitulo?: boolean;
}

/** NRC ya inscrito (o con reserva viva) con su cancelación confirmada en un diálogo. */
export function TarjetaInscrita({ item, onCancelar, conTitulo = false }: TarjetaInscritaProps) {
  const [abierto, setAbierto] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const escritorio = useMediaQuery("(min-width: 1024px)");
  const reservada = item.estado === "reservada";
  const virtual = item.bloques.length === 0;

  async function confirmar() {
    setCancelando(true);
    const ok = await onCancelar(item.nrc, item.titulo);
    setCancelando(false);
    if (ok) setAbierto(false);
  }

  return (
    <article
      aria-label={`NRC ${item.nrc}, ${item.titulo}`}
      className="rounded-card border border-border bg-surface p-3.5 shadow-edge"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {conTitulo ? (
            <p className="m-0 truncate font-head text-subject font-semibold">{item.titulo}</p>
          ) : null}
          <p className="m-0 text-body font-bold tabular">NRC {item.nrc}</p>
        </div>
        {reservada ? (
          <Badge tono="reservado" icono={<Clock />}>
            Reservada
            {item.vencimiento ? (
              <>
                {" "}
                <ContadorReserva vencimiento={item.vencimiento} />
              </>
            ) : null}
          </Badge>
        ) : (
          <Badge tono="exito" icono={<Check strokeWidth={2.6} />}>
            Inscrita
          </Badge>
        )}
      </div>
      <p className="m-0 mt-1 text-compact font-semibold tabular">{horarioLegible(item.bloques)}</p>
      <p className="m-0 text-meta text-text-2">
        {virtual ? null : <span className="tabular">{salonesLegibles(item.bloques)}, </span>}
        {MODALIDAD[item.modalidad]}, {item.sede}. {item.docente}
      </p>
      {reservada ? (
        <p className="m-0 mt-2 text-meta text-text-2">
          Te guardamos el cupo 5 minutos mientras confirmamos.
        </p>
      ) : null}

      <Dialog
        abierto={abierto}
        onAbiertoChange={setAbierto}
        forma={escritorio ? "centrado" : "bandeja"}
        titulo={`¿Cancelar ${item.titulo}?`}
        descripcion={`Soltarás el cupo del NRC ${item.nrc} y otra persona podrá tomarlo. Puedes inscribirlo de nuevo si todavía hay cupo.`}
        disparador={
          <Button variante="fantasma" tamano="sm" className="mt-2 -ml-2">
            Cancelar inscripción
          </Button>
        }
        acciones={
          <>
            <Button variante="secundario" onClick={() => setAbierto(false)}>
              Mantener inscripción
            </Button>
            <Button variante="peligro" cargando={cancelando} onClick={confirmar}>
              {cancelando ? "Cancelando…" : "Cancelar inscripción"}
            </Button>
          </>
        }
      />
    </article>
  );
}
