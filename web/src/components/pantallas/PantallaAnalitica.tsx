"use client";

import { Database } from "lucide-react";
import { useState } from "react";
import { BarrasDemanda } from "@/components/analitica/BarrasDemanda";
import { Consulta } from "@/components/analitica/Consulta";
import { EsqueletoBarras, EsqueletoFilas, EsqueletoKpis } from "@/components/analitica/Esqueletos";
import { EstadoSinDatos } from "@/components/analitica/EstadoSinDatos";
import { InsigniaValidacion } from "@/components/analitica/InsigniaValidacion";
import { ListaCombinaciones } from "@/components/analitica/ListaCombinaciones";
import { MapaOcupacion } from "@/components/analitica/MapaOcupacion";
import { Seccion } from "@/components/analitica/Seccion";
import { TablaAuditoria } from "@/components/analitica/TablaAuditoria";
import { TablaDemandaNrc } from "@/components/analitica/TablaDemandaNrc";
import { TarjetaKpi } from "@/components/analitica/TarjetaKpi";
import { EstadoSinConexion } from "@/components/estados/EstadoSinConexion";
import { Button } from "@/components/ui/Button";
import { Selector } from "@/components/ui/Selector";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorRed } from "@/lib/api/cliente";
import {
  useAuditoria,
  useCombinaciones,
  useDemandaInsatisfecha,
  useDemandaNrc,
  useMateriasDeDemanda,
  useOcupacionFranja,
  useResumen,
} from "@/lib/api/hooks";
import { ORDENES, barrasDemanda, kpisDe } from "@/lib/analitica";
import { fechaHoraBogota, hace } from "@/lib/formatos";
import type { OrdenDemanda } from "@/lib/tipos";
import { useAhora } from "@/lib/useAhora";
import { AppShell } from "./AppShell";

const PASO = 25;

/** Analítica de coordinación (HU5): lee la capa oro vía API para decidir la oferta. */
export function PantallaAnalitica() {
  const resumen = useResumen();
  const sinRed = resumen.error instanceof ErrorRed;
  return (
    <AppShell
      rol="coordinador"
      franja={
        sinRed ? (
          <EstadoSinConexion texto="Sin conexión. Mostramos los últimos datos cargados. Reconectando…" />
        ) : undefined
      }
    >
      <main className="mx-auto max-w-[1280px] px-4 pt-6 pb-16 lg:px-8 lg:pt-8">
        <h1 className="text-title font-bold tracking-[var(--tracking-title)]">
          Analítica de coordinación
        </h1>
        <Consulta
          query={resumen}
          esqueleto={
            <div className="mt-4 grid gap-6">
              <Skeleton className="h-5 w-72" />
              <EsqueletoKpis />
            </div>
          }
        >
          {(r) => (r.generadoEn === null ? <Vacio /> : <Contenido resumen={r} />)}
        </Consulta>
      </main>
    </AppShell>
  );
}

function Vacio() {
  return (
    <>
      <p className="m-0 mt-2 text-compact text-text-2 measure">
        Demanda por NRC y ocupación por franja, para decidir la oferta del próximo periodo.
      </p>
      <div className="mt-8">
        <EstadoSinDatos />
      </div>
    </>
  );
}

function Contenido({ resumen }: { resumen: NonNullable<ReturnType<typeof useResumen>["data"]> }) {
  const ahora = useAhora(30_000);
  const generado = resumen.generadoEn as string;
  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="m-0 text-compact text-text-2">
          Periodo <span className="font-semibold tabular text-text">{resumen.periodo}</span>
        </p>
        <p className="m-0 flex items-center gap-1.5 text-compact text-text-2">
          <Database aria-hidden="true" className="size-4 shrink-0" />
          <span>
            Datos de la capa oro · actualizado {hace(generado, ahora)}{" "}
            <time dateTime={generado} className="tabular">
              ({fechaHoraBogota(generado)})
            </time>
          </span>
        </p>
        {resumen.validacion ? <InsigniaValidacion validacion={resumen.validacion} /> : null}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {kpisDe(resumen).map((k) => (
          <TarjetaKpi
            key={k.id}
            etiqueta={k.etiqueta}
            valor={k.valor}
            detalle={k.detalle}
            tono={k.tono}
          />
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <DemandaInsatisfecha />
        </div>
        <div className="lg:col-span-5">
          <OcupacionFranja />
        </div>
      </div>

      <div className="mt-6">
        <DemandaPorNrc />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Combinaciones />
        <Auditoria />
      </div>
    </>
  );
}

function DemandaInsatisfecha() {
  const q = useDemandaInsatisfecha();
  return (
    <Seccion
      titulo="Dónde abrir más grupos"
      descripcion="Materias con más intentos sin cupo. Las tres primeras son las candidatas a ampliar la oferta."
      className="h-full"
    >
      <Consulta
        query={q}
        esqueleto={<EsqueletoBarras />}
        vacio={(d) =>
          d.items.length === 0
            ? {
                titulo: "Nadie se quedó sin cupo.",
                texto: "Cuando haya intentos sin cupo, las materias aparecerán aquí.",
              }
            : null
        }
      >
        {(d) => <BarrasDemanda barras={barrasDemanda(d.items)} />}
      </Consulta>
    </Seccion>
  );
}

function OcupacionFranja() {
  const q = useOcupacionFranja();
  return (
    <Seccion
      titulo="Ocupación por franja y sede"
      descripcion="Qué parte de los cupos está ocupada en cada franja."
      className="h-full"
    >
      <Consulta
        query={q}
        esqueleto={<EsqueletoFilas filas={4} />}
        vacio={(d) =>
          d.items.length === 0 ? { titulo: "Sin NRC para calcular la ocupación." } : null
        }
      >
        {(d) => <MapaOcupacion items={d.items} />}
      </Consulta>
    </Seccion>
  );
}

function DemandaPorNrc() {
  const [orden, setOrden] = useState<OrdenDemanda>("demanda");
  const [materia, setMateria] = useState("");
  const [soloConIntentos, setSoloConIntentos] = useState(false);
  const [limite, setLimite] = useState(PASO);
  const materias = useMateriasDeDemanda();
  const q = useDemandaNrc({ orden, limite, materiaId: materia || null, soloConIntentos });

  return (
    <Seccion
      titulo="Demanda por NRC"
      descripcion="Ordena por lo que necesites decidir y filtra por materia."
      acciones={
        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:w-auto lg:grid-cols-[220px_260px_auto] lg:items-end">
          <Selector
            etiqueta="Ordenar por"
            value={orden}
            onChange={(e) => {
              setOrden(e.target.value as OrdenDemanda);
              setLimite(PASO);
            }}
            opciones={ORDENES.map((o) => ({ valor: o.valor, texto: o.etiqueta }))}
          />
          <Selector
            etiqueta="Materia"
            value={materia}
            onChange={(e) => {
              setMateria(e.target.value);
              setLimite(PASO);
            }}
            opciones={[
              { valor: "", texto: "Todas las materias" },
              ...(materias.data ?? []).map((m) => ({ valor: m.id, texto: m.nombre })),
            ]}
          />
          <label className="flex min-h-11 items-center gap-2 text-compact">
            <input
              type="checkbox"
              checked={soloConIntentos}
              onChange={(e) => {
                setSoloConIntentos(e.target.checked);
                setLimite(PASO);
              }}
              className="size-5 accent-[var(--primary)]"
            />
            Solo con intentos
          </label>
        </div>
      }
    >
      <Consulta
        query={q}
        esqueleto={<EsqueletoFilas />}
        vacio={(d) =>
          d.items.length === 0
            ? {
                titulo: "Ningún NRC coincide con estos filtros.",
                texto: "Prueba con otra materia o quita «Solo con intentos».",
              }
            : null
        }
      >
        {(d) => (
          <div aria-busy={q.isPlaceholderData}>
            <TablaDemandaNrc items={d.items} orden={orden} onOrden={(o) => setOrden(o)} />
            <p className="m-0 mt-3 text-meta text-text-2">
              Sillas azules: cupos ocupados. Doradas: NRC lleno que dejó estudiantes sin cupo.
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p role="status" className="m-0 text-compact text-text-2 tabular">
                Mostrando {d.items.length} de {d.total} NRC
              </p>
              {d.items.length < d.total ? (
                <Button
                  variante="secundario"
                  tamano="sm"
                  onClick={() => setLimite((l) => l + PASO)}
                >
                  Ver más NRC
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </Consulta>
    </Seccion>
  );
}

const SEMESTRES = [
  { valor: "", texto: "Todos los semestres" },
  ...Array.from({ length: 10 }, (_, i) => ({ valor: String(i + 1), texto: `Semestre ${i + 1}` })),
];

function Combinaciones() {
  const [semestre, setSemestre] = useState("");
  const q = useCombinaciones(semestre ? Number(semestre) : null);
  return (
    <Seccion
      titulo="Combinaciones frecuentes"
      descripcion="Pares de NRC que los estudiantes de un mismo semestre inscriben juntos."
      acciones={
        <Selector
          etiqueta="Semestre"
          value={semestre}
          onChange={(e) => setSemestre(e.target.value)}
          opciones={SEMESTRES}
          className="w-full sm:w-52"
        />
      }
    >
      <Consulta
        query={q}
        esqueleto={<EsqueletoFilas filas={5} />}
        vacio={(d) =>
          d.items.length === 0
            ? {
                titulo: "Sin combinaciones frecuentes todavía.",
                texto: "Aparecen cuando al menos dos estudiantes comparten el mismo par de NRC.",
              }
            : null
        }
      >
        {(d) => <ListaCombinaciones items={d.items} />}
      </Consulta>
    </Seccion>
  );
}

function Auditoria() {
  const q = useAuditoria();
  return (
    <Seccion
      titulo="Auditoría"
      descripcion="Cada intento queda trazado: resultado, cantidad y latencia por tipo de evento."
    >
      <Consulta
        query={q}
        esqueleto={<EsqueletoFilas filas={7} />}
        vacio={(d) => (d.total.length === 0 ? { titulo: "Sin eventos auditados." } : null)}
      >
        {(d) => <TablaAuditoria filas={d.total} />}
      </Consulta>
    </Seccion>
  );
}
