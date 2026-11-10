"use client";

import Link from "next/link";
import { BotonInscribir } from "@/components/dominio/BotonInscribir";
import { TarjetaNrc } from "@/components/dominio/TarjetaNrc";
import { EstadoError } from "@/components/estados/EstadoError";
import { EstadoVacio } from "@/components/estados/EstadoVacio";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorRed } from "@/lib/api/cliente";
import { useNrcDe } from "@/lib/api/hooks";
import type { FaseInscripcion } from "@/lib/useInscripcion";
import type { NrcOut } from "@/lib/tipos";

export interface GruposDeMateriaProps {
  materiaId: string;
  seleccionado: string | null;
  fases: Record<string, FaseInscripcion>;
  /** Alternativa de un NRC agotado (API en 409, o la calculada con la caché). */
  alternativaDe: (nrc: NrcOut) => NrcOut | null;
  sinConexion: boolean;
  onSeleccionar: (nrc: NrcOut) => void;
  onVistaPrevia: (nrc: NrcOut | null) => void;
  onInscribir: (nrc: NrcOut) => void;
  onVerOtros: (materiaId: string) => void;
}

/** NRC inscribibles de una materia (la API ya quitó sin cupo, con cruce o sin prerrequisitos). */
export function GruposDeMateria({
  materiaId,
  seleccionado,
  fases,
  alternativaDe,
  sinConexion,
  onSeleccionar,
  onVistaPrevia,
  onInscribir,
  onVerOtros,
}: GruposDeMateriaProps) {
  const q = useNrcDe(materiaId);

  if (q.isPending) {
    return (
      <div role="status" aria-label="Cargando grupos" className="grid gap-[var(--gap-cards)]">
        {[0, 1].map((i) => (
          <div key={i} className="grid gap-2 rounded-card border border-border bg-surface p-3.5">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3.5 w-44" />
            <Skeleton className="h-3 w-36" />
            <Skeleton className="mt-1 h-2.5 w-full" />
          </div>
        ))}
      </div>
    );
  }
  if (q.isError) {
    return (
      <EstadoError
        titulo={
          q.error instanceof ErrorRed
            ? "Sin conexión con el servidor."
            : "No pudimos cargar los grupos de esta materia."
        }
        texto="Tu horario sigue igual."
        onReintentar={() => void q.refetch()}
        reintentando={q.isFetching}
      />
    );
  }
  if (q.data.length === 0) {
    return (
      <EstadoVacio
        titulo="Ningún grupo de esta materia encaja hoy con tu semana."
        texto="La lista se actualiza sola."
        accion={
          <Link
            href="/horario"
            className="inline-flex h-11 items-center rounded-control px-3 text-compact font-semibold text-info underline underline-offset-[3px]"
          >
            Ver mi horario
          </Link>
        }
      />
    );
  }

  return (
    <>
      {q.data.map((n) => {
        const agotado = n.cuposLibres <= 0;
        const fase = fases[n.nrc];
        return (
          <TarjetaNrc
            key={n.nrc}
            nrc={n}
            seleccionada={seleccionado === n.nrc}
            onSeleccionar={onSeleccionar}
            onVistaPrevia={onVistaPrevia}
            sinConexion={sinConexion}
            {...(agotado ? { alternativa: alternativaDe(n) } : {})}
            onInscribirAlternativa={() => {
              const alt = alternativaDe(n);
              if (alt) onInscribir(alt);
            }}
            onVerOtros={() => onVerOtros(materiaId)}
            accion={
              <span className="hidden lg:block">
                <BotonInscribir
                  nrc={n.nrc}
                  tamano="sm"
                  estado={
                    fase?.fase === "reservada"
                      ? "reservado"
                      : fase?.fase === "inscribiendo"
                        ? "inscribiendo"
                        : "reposo"
                  }
                  {...(fase?.fase === "reservada" ? { vencimiento: fase.vencimiento } : {})}
                  onClick={() => onInscribir(n)}
                  disabled={sinConexion}
                />
              </span>
            }
          />
        );
      })}
    </>
  );
}
