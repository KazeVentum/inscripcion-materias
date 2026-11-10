"use client";

import { CalendarPlus, Download } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { CalendarioSemanal } from "@/components/dominio/CalendarioSemanal";
import { EstadoCarga } from "@/components/estados/EstadoCarga";
import { EstadoError } from "@/components/estados/EstadoError";
import { EstadoVacio } from "@/components/estados/EstadoVacio";
import { Button } from "@/components/ui/Button";
import { ErrorRed } from "@/lib/api/cliente";
import { useHorario } from "@/lib/api/hooks";
import { bloquesDe } from "@/lib/horario";
import { descargarIcs, generarIcs } from "@/lib/ics";
import type { BloqueCalendarioDatos } from "@/lib/tipos";
import { useAltoVentana } from "@/lib/useAltoVentana";
import { useCancelar } from "@/lib/useInscripcion";
import { useAvisos } from "./Avisos";
import { AppShell } from "./AppShell";
import { TarjetaInscrita } from "./TarjetaInscrita";

export function PantallaHorario() {
  const q = useHorario();
  const cancelar = useCancelar();
  const avisos = useAvisos();
  const alto = useAltoVentana();

  const bloques = useMemo<BloqueCalendarioDatos[]>(
    () =>
      (q.data?.inscripciones ?? []).flatMap((i) =>
        bloquesDe(i, i.estado === "confirmada" ? "inscrito" : "reservado", {
          vencimiento: i.vencimiento ?? null,
        }),
      ),
    [q.data],
  );

  const confirmadas = (q.data?.inscripciones ?? []).filter((i) => i.estado === "confirmada");
  const conHorario = confirmadas.filter((i) => i.bloques.length > 0);

  function exportar() {
    if (!q.data) return;
    const ics = generarIcs(conHorario, { periodo: q.data.periodo });
    descargarIcs(ics, `horario-${q.data.periodo}.ics`);
    avisos.info("Descargamos tu horario. Ábrelo con tu calendario (zona horaria de Bogotá).");
  }

  const sinRed = q.error instanceof ErrorRed;
  const total = q.data?.inscripciones.length ?? 0;

  return (
    <AppShell>
      <main className="mx-auto max-w-[1100px] px-4 pt-5 pb-16 lg:px-8 lg:pt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-title font-bold tracking-[var(--tracking-title)]">Mi horario</h1>
            <p className="m-0 mt-1 text-compact text-text-2 tabular">
              {q.data
                ? `${q.data.periodo}, ${q.data.creditosTotales} créditos`
                : "Tu semana de 2027-1"}
            </p>
          </div>
          <Button
            variante="secundario"
            icono={<Download aria-hidden="true" />}
            onClick={exportar}
            disabled={conHorario.length === 0}
            {...(conHorario.length === 0 && !q.isPending
              ? { motivo: "Aún no hay clases con horario para exportar." }
              : {})}
          >
            Exportar .ics
          </Button>
        </div>

        {q.isPending ? (
          <div className="mt-6">
            <EstadoCarga />
          </div>
        ) : q.isError ? (
          <EstadoError
            className="mt-6"
            titulo={sinRed ? "Sin conexión con el servidor." : "No pudimos cargar tu horario."}
            texto="Tu inscripción no cambió. Vuelve a intentarlo en un momento."
            onReintentar={() => void q.refetch()}
            reintentando={q.isFetching}
          />
        ) : total === 0 ? (
          <EstadoVacio
            className="mt-8"
            icono={<CalendarPlus />}
            titulo="Aún no tienes materias en tu horario."
            texto="Elige tus grupos en la inscripción y aparecerán aquí."
            accion={
              <Link
                href="/inscripcion"
                className="inline-flex h-12 items-center rounded-control bg-primary px-5 text-compact font-semibold text-on-primary shadow-[var(--button-sheen)]"
              >
                Ir a inscribir
              </Link>
            }
          />
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
            <CalendarioSemanal
              variante="completa"
              bloques={bloques}
              resumen={`${q.data.creditosTotales} créditos`}
              titulo="Tu semana"
              altoVisible={Math.max(420, alto - 280)}
              leyenda
            />
            <section aria-labelledby="lista-inscritas">
              <h2 id="lista-inscritas" className="mb-3 text-section font-semibold">
                Inscripciones
              </h2>
              <div className="grid gap-3">
                {q.data.inscripciones.map((i) => (
                  <TarjetaInscrita key={i.nrc} item={i} conTitulo onCancelar={cancelar} />
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    </AppShell>
  );
}
