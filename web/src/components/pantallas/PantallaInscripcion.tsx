"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CalendarCheck } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AvanceSemestre } from "@/components/dominio/AvanceSemestre";
import { Skeleton } from "@/components/ui/Skeleton";
import { BotonInscribir } from "@/components/dominio/BotonInscribir";
import { CalendarioSemanal } from "@/components/dominio/CalendarioSemanal";
import { FilaMateria, ListaMaterias } from "@/components/dominio/FilaMateria";
import { IndicadorEnVivo } from "@/components/dominio/IndicadorEnVivo";
import { EstadoCarga } from "@/components/estados/EstadoCarga";
import { EstadoError } from "@/components/estados/EstadoError";
import { EstadoSinConexion } from "@/components/estados/EstadoSinConexion";
import { EstadoVacio } from "@/components/estados/EstadoVacio";
import { BandejaAccion } from "@/components/ui/BandejaAccion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { ErrorRed } from "@/lib/api/cliente";
import { useSesion } from "@/lib/api/sesion";
import { claves } from "@/lib/api/consultas";
import { useAvance, useHorario, useMaterias } from "@/lib/api/hooks";
import { alternativaLocal } from "@/lib/alternativa";
import { bloquesDe, horarioLegible } from "@/lib/horario";
import type {
  BloqueCalendarioDatos,
  HorarioItemOut,
  MateriaHabilitadaOut,
  NrcOut,
} from "@/lib/tipos";
import { useAltoVentana } from "@/lib/useAltoVentana";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { useCuposEnVivo } from "@/lib/useCuposEnVivo";
import { useCancelar, useInscripcion } from "@/lib/useInscripcion";
import { useNrcEnCache } from "@/lib/useNrcEnCache";
import { AppShell } from "./AppShell";
import { GruposDeMateria } from "./GruposDeMateria";
import { TarjetaInscrita } from "./TarjetaInscrita";

/** 1.er, 2.º, 3.er, 4.º… */
export function ordinalSemestre(n: number): string {
  return n === 1 || n === 3 ? `${n}.er` : `${n}.º`;
}

function agrupar(materias: readonly MateriaHabilitadaOut[]): [number, MateriaHabilitadaOut[]][] {
  const mapa = new Map<number, MateriaHabilitadaOut[]>();
  for (const m of materias) mapa.set(m.semestre, [...(mapa.get(m.semestre) ?? []), m]);
  return [...mapa.entries()]
    .sort(([a], [b]) => a - b)
    .map(([s, ms]) => [
      s,
      // La materia ya inscrita queda al final de su grupo (brief §5).
      [...ms].sort((a, b) => Number(a.estado === "inscrita") - Number(b.estado === "inscrita")),
    ]);
}

export function PantallaInscripcion() {
  const qc = useQueryClient();
  const sesion = useSesion();
  const materiasQ = useMaterias();
  const horarioQ = useHorario();
  const avanceQ = useAvance();
  const [avanceAbierto, setAvanceAbierto] = useState(false);
  // Solo un estudiante abre el SSE: con otra sesión la guardia redirige sin pedir ticket.
  const conexion = useCuposEnVivo(sesion?.rol === "estudiante");
  const { fases, alternativas, inscribir } = useInscripcion();
  const cancelar = useCancelar();
  const alto = useAltoVentana();
  const escritorio = useMediaQuery("(min-width: 1024px)");

  const [seleccion, setSeleccion] = useState<NrcOut | null>(null);
  const [hover, setHover] = useState<NrcOut | null>(null);
  const [abiertas, setAbiertas] = useState<string[]>([]);
  const [pestana, setPestana] = useState("materias");

  const sinConexion = conexion.estado === "sin-conexion";
  const horario = horarioQ.data;
  const items = useMemo(() => horario?.inscripciones ?? [], [horario]);
  const ocupados = useMemo(() => items.flatMap((i) => i.bloques), [items]);

  const alternativaDe = (n: NrcOut): NrcOut | null => {
    if (n.nrc in alternativas) return alternativas[n.nrc] ?? null;
    const grupos =
      qc.getQueryData<NrcOut[]>(claves.nrcDe(sesion?.estudianteId ?? null, n.materiaId)) ?? [];
    return alternativaLocal(n, grupos, ocupados);
  };

  // Selección viva: si el NRC elegido se agota mientras se mira, la selección pasa a su
  // alternativa de inmediato (y la semana la dibuja como vista previa).
  const viva = useNrcEnCache(seleccion?.nrc ?? null);
  const yaInscrito = (n: NrcOut | null) =>
    n ? items.some((i) => i.nrc === n.nrc && i.estado === "confirmada") : false;
  let elegido: NrcOut | null = viva ?? seleccion;
  if (elegido && elegido.cuposLibres <= 0) elegido = alternativaDe(elegido);
  if (yaInscrito(elegido)) elegido = null;

  const previa = hover ?? elegido;
  const faseElegido = elegido ? fases[elegido.nrc] : undefined;

  const bloques = useMemo<BloqueCalendarioDatos[]>(() => {
    const base = items.flatMap((i) =>
      bloquesDe(i, i.estado === "confirmada" ? "inscrito" : "reservado", {
        vencimiento: i.vencimiento ?? null,
      }),
    );
    if (!previa || items.some((i) => i.nrc === previa.nrc)) return base;
    const fase = fases[previa.nrc];
    return [
      ...base,
      ...(fase?.fase === "reservada"
        ? bloquesDe(previa, "reservado", { vencimiento: fase.vencimiento })
        : bloquesDe(previa, "vista-previa")),
    ];
  }, [items, previa, fases]);

  const creditos = horario?.creditosTotales ?? 0;
  const resumen = `${creditos} ${creditos === 1 ? "crédito inscrito" : "créditos inscritos"}`;

  const elegir = (n: NrcOut) => setSeleccion((s) => (s?.nrc === n.nrc ? null : n));
  const inscribirYFijar = (n: NrcOut) => {
    setSeleccion(n);
    void inscribir(n);
  };
  const verOtros = (materiaId: string) => {
    setPestana("materias");
    // focus() lleva la vista y el foco de teclado al primer grupo disponible de la materia.
    window.requestAnimationFrame(() => {
      const zona = document.getElementById(`materia-${materiaId}`)?.parentElement;
      zona?.querySelector<HTMLElement>("button[aria-pressed]:not(:disabled)")?.focus();
    });
  };

  const materias = materiasQ.data;
  const pendientes = materias?.filter((m) => m.estado === "pendiente").length ?? 0;

  const avanceUI = avanceQ.data ? (
    <AvanceSemestre
      avance={avanceQ.data}
      abierto={avanceAbierto}
      onAbiertoChange={setAvanceAbierto}
    />
  ) : avanceQ.isPending ? (
    <Skeleton className="h-14 w-full" />
  ) : null;

  const lista = materias ? (
    <div className="grid gap-6">
      {avanceUI}
      {pendientes === 0 ? (
        <EstadoVacio
          icono={<CalendarCheck />}
          titulo="No tienes materias pendientes para 2027-1."
          texto="Revisa tu horario."
          accion={
            <Link
              href="/horario"
              className="inline-flex h-11 items-center rounded-control px-4 text-compact font-semibold text-primary-ink shadow-[inset_0_0_0_1px_var(--border-strong)] hover:bg-primary-soft"
            >
              Ver mi horario
            </Link>
          }
        />
      ) : null}
      {agrupar(materias).map(([semestre, ms]) => {
        const ids = new Set(ms.map((m) => m.materiaId));
        return (
          <ListaMaterias
            key={semestre}
            titulo={`${ordinalSemestre(semestre)} semestre`}
            abiertas={abiertas.filter((id) => ids.has(id))}
            onAbiertasChange={(nuevas) =>
              setAbiertas((previas) => [...previas.filter((id) => !ids.has(id)), ...nuevas])
            }
          >
            {ms.map((m) => {
              const item: HorarioItemOut | undefined = items.find(
                (i) => i.materiaId === m.materiaId,
              );
              const reservada = item?.estado === "reservada";
              return (
                <FilaMateria
                  key={m.materiaId}
                  materia={item ? { ...m, estado: "inscrita" } : m}
                  {...(item && !reservada ? { nrcInscrito: item.nrc } : {})}
                  {...(reservada && item.vencimiento ? { reservaVence: item.vencimiento } : {})}
                >
                  <span id={`materia-${m.materiaId}`} className="sr-only" />
                  {item ? (
                    <TarjetaInscrita item={item} onCancelar={cancelar} />
                  ) : m.estado === "inscrita" ? (
                    <EstadoVacio titulo="Ya tienes esta materia en tu horario." />
                  ) : (
                    <GruposDeMateria
                      materiaId={m.materiaId}
                      seleccionado={elegido?.nrc ?? null}
                      fases={fases}
                      alternativaDe={alternativaDe}
                      sinConexion={sinConexion}
                      onSeleccionar={elegir}
                      onVistaPrevia={setHover}
                      onInscribir={inscribirYFijar}
                      onVerOtros={verOtros}
                    />
                  )}
                </FilaMateria>
              );
            })}
          </ListaMaterias>
        );
      })}
    </div>
  ) : null;

  const errorMaterias = materiasQ.isError ? (
    <EstadoError
      titulo={
        materiasQ.error instanceof ErrorRed
          ? "Sin conexión con el servidor."
          : "No pudimos cargar tus materias."
      }
      texto="Tu horario sigue igual. Vuelve a intentarlo."
      onReintentar={() => void materiasQ.refetch()}
      reintentando={materiasQ.isFetching}
    />
  ) : null;

  const cargando = materiasQ.isPending || horarioQ.isPending;
  const cuerpo = cargando ? <EstadoCarga /> : (errorMaterias ?? lista);

  return (
    <AppShell
      ajustado
      estado={
        <IndicadorEnVivo
          estado={conexion.estado}
          {...(conexion.ultimaActualizacion
            ? { ultimaActualizacion: conexion.ultimaActualizacion }
            : {})}
        />
      }
      franja={sinConexion ? <EstadoSinConexion className="lg:px-8" /> : null}
    >
      <h1 className="sr-only">Inscripción 2027-1</h1>

      {escritorio ? (
        <main className="grid min-h-0 flex-1 grid-cols-[420px_minmax(0,1fr)] gap-8 px-8 pt-6">
          <div className="min-h-0 overflow-y-auto pr-2 pb-8">
            <h2 className="mb-4 text-section font-semibold">Materias que puedes inscribir</h2>
            {cuerpo}
          </div>
          <div className="min-h-0 pb-6">
            <CalendarioSemanal
              variante="completa"
              bloques={bloques}
              resumen={resumen}
              altoVisible={Math.max(420, alto - 230)}
            />
          </div>
        </main>
      ) : (
        <main className="pb-28">
          <Tabs value={pestana} onValueChange={setPestana}>
            <div className="px-4 pt-2">
              <TabsList aria-label="Vista" className="w-full">
                <TabsTrigger value="materias">Materias</TabsTrigger>
                <TabsTrigger value="semana">Semana</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="materias">
              {cargando || materiasQ.isError ? (
                <div className="px-4 pt-4">{cuerpo}</div>
              ) : (
                <>
                  <div className="sticky top-0 z-20 bg-bg px-4 pt-3 pb-3">
                    <CalendarioSemanal
                      bloques={bloques}
                      resumen={resumen}
                      onExpandir={() => setPestana("semana")}
                    />
                  </div>
                  <div className="px-4 pt-2">{lista}</div>
                </>
              )}
            </TabsContent>
            <TabsContent value="semana">
              <div className="px-4 pt-3">
                <CalendarioSemanal
                  variante="completa"
                  bloques={bloques}
                  resumen={resumen}
                  altoVisible={Math.max(360, alto - 260)}
                />
              </div>
            </TabsContent>
          </Tabs>
        </main>
      )}

      <BandejaAccion
        visible={Boolean(elegido) && !escritorio}
        etiqueta="NRC seleccionado"
        accion={
          elegido ? (
            <BotonInscribir
              nrc={elegido.nrc}
              sinNrc
              estado={
                faseElegido?.fase === "reservada"
                  ? "reservado"
                  : faseElegido?.fase === "inscribiendo"
                    ? "inscribiendo"
                    : "reposo"
              }
              {...(faseElegido?.fase === "reservada"
                ? { vencimiento: faseElegido.vencimiento }
                : {})}
              onClick={() => inscribirYFijar(elegido)}
              disabled={sinConexion}
              {...(sinConexion ? { motivo: "Sin conexión" } : {})}
            />
          ) : null
        }
      >
        {elegido ? (
          <>
            <p className="m-0 truncate text-compact font-bold">{elegido.titulo}</p>
            <p className="m-0 truncate text-meta text-text-2 tabular">
              {elegido.nrc}, {horarioLegible(elegido.bloques)}
            </p>
          </>
        ) : null}
      </BandejaAccion>
    </AppShell>
  );
}
