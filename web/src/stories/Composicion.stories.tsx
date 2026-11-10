import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useMemo, useState } from "react";
import { BotonInscribir, type EstadoBotonInscribir } from "@/components/dominio/BotonInscribir";
import { CalendarioSemanal } from "@/components/dominio/CalendarioSemanal";
import { FilaMateria, ListaMaterias } from "@/components/dominio/FilaMateria";
import { IndicadorEnVivo, type EstadoConexion } from "@/components/dominio/IndicadorEnVivo";
import { TarjetaNrc } from "@/components/dominio/TarjetaNrc";
import { ConfirmacionExito } from "@/components/estados/ConfirmacionExito";
import { EstadoSinConexion } from "@/components/estados/EstadoSinConexion";
import { BandejaAccion } from "@/components/ui/BandejaAccion";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ToastProvider } from "@/components/ui/Toast";
import {
  AHORA,
  VENCIMIENTO_RESERVA,
  horario,
  materias,
  nrc40930Alternativa,
  nrcPorMateria,
} from "@/lib/fixtures";
import { bloquesDe, horarioLegible } from "@/lib/horario";
import type { BloqueCalendarioDatos, NrcOut } from "@/lib/tipos";

/**
 * Referencia de la pantalla de inscripción (maqueta aprobada del brief), armada solo con
 * componentes del sistema. No es la pantalla de la fase 5: no hay datos reales ni red.
 */
function Inscripcion({ conexion = "en-vivo" }: { conexion?: EstadoConexion }) {
  const offline = conexion !== "en-vivo";
  const [seleccion, setSeleccion] = useState<NrcOut | null>(nrcPorMateria.ISUMBG103?.[0] ?? null);
  const [hover, setHover] = useState<NrcOut | null>(null);
  const [estado, setEstado] = useState<EstadoBotonInscribir>("reposo");
  const [toast, setToast] = useState(0);
  const [inscritas, setInscritas] = useState<NrcOut[]>([]);

  const previa = hover ?? seleccion;
  const bloques = useMemo<BloqueCalendarioDatos[]>(() => {
    const base = horario.inscripciones.flatMap((i) =>
      bloquesDe(i, i.estado === "confirmada" ? "inscrito" : "reservado", {
        vencimiento: i.vencimiento ?? null,
      }),
    );
    const propias = inscritas.flatMap((n) => bloquesDe(n, "inscrito"));
    const prueba =
      previa && !inscritas.some((n) => n.nrc === previa.nrc)
        ? bloquesDe(previa, estado === "reservado" ? "reservado" : "vista-previa", {
            vencimiento: new Date(AHORA + 300_000).toISOString(),
          })
        : [];
    return [...base, ...propias, ...prueba];
  }, [previa, estado, inscritas]);

  const creditos = horario.creditosTotales + inscritas.reduce((s, n) => s + n.creditos, 0);

  const inscribir = (nrc: NrcOut) => {
    setSeleccion(nrc);
    setEstado("inscribiendo");
    window.setTimeout(() => setEstado("reservado"), 700);
    window.setTimeout(() => {
      setEstado("inscrita");
      setInscritas((xs) => [...xs, nrc]);
      setToast((t) => t + 1);
    }, 2600);
  };

  const [so, calculo, , ingles, estructuras] = materias;
  const pendientes = [so, calculo].filter((m): m is NonNullable<typeof m> => Boolean(m));
  const motivo = offline ? "Sin conexión" : undefined;

  const tarjetas = (materiaId: string) =>
    (nrcPorMateria[materiaId] ?? []).map((n) => {
      const agotado = n.cuposLibres === 0;
      return (
        <TarjetaNrc
          key={n.nrc}
          nrc={n}
          seleccionada={seleccion?.nrc === n.nrc}
          onSeleccionar={(x) => {
            setSeleccion((s) => (s?.nrc === x.nrc ? null : x));
            setEstado("reposo");
          }}
          onVistaPrevia={setHover}
          sinConexion={offline}
          {...(agotado ? { alternativa: nrc40930Alternativa } : {})}
          onInscribirAlternativa={() => inscribir(nrc40930Alternativa)}
          accion={
            <span className="hidden lg:block">
              <BotonInscribir
                nrc={n.nrc}
                tamano="sm"
                estado={seleccion?.nrc === n.nrc ? estado : "reposo"}
                vencimiento={new Date(AHORA + 300_000).toISOString()}
                ahora={AHORA}
                onClick={() => inscribir(n)}
                disabled={offline}
              />
            </span>
          }
        />
      );
    });

  const lista = (
    <ListaMaterias titulo="3.er semestre" abiertasInicial={["ISUMBG103"]}>
      {pendientes.map((m) => (
        <FilaMateria key={m.materiaId} materia={m}>
          {tarjetas(m.materiaId)}
        </FilaMateria>
      ))}
      {ingles ? (
        <FilaMateria materia={ingles} reservaVence={VENCIMIENTO_RESERVA} ahora={AHORA} />
      ) : null}
      {estructuras ? <FilaMateria materia={estructuras} nrcInscrito="81204" /> : null}
    </ListaMaterias>
  );

  return (
    <ToastProvider offsetInferior={104}>
      <div className="min-h-dvh bg-bg text-text lg:flex lg:h-dvh lg:flex-col">
        <header className="flex items-center justify-between gap-3 px-4 pt-3 pb-3 lg:border-b lg:border-border lg:bg-surface lg:px-8 lg:py-3">
          <div className="min-w-0">
            <p className="m-0 font-head text-[15px] leading-5 font-bold tracking-[0.01em] text-primary-ink">
              UNIMINUTO
            </p>
            <p className="m-0 truncate text-meta text-text-3 tabular">
              Ingeniería de Sistemas, 2027-1
            </p>
          </div>
          <h1 className="sr-only">Inscripción 2027-1</h1>
          <div className="flex items-center gap-2">
            <IndicadorEnVivo
              estado={conexion}
              ahora={AHORA}
              {...(offline ? { ultimaActualizacion: new Date(AHORA - 40_000).toISOString() } : {})}
            />
            <ThemeToggle />
          </div>
        </header>
        {offline ? <EstadoSinConexion className="lg:px-8" /> : null}

        {/* Móvil y tablet: semana compacta arriba, lista debajo, decisión en la bandeja. */}
        <main className="pb-28 lg:hidden">
          <div className="sticky top-0 z-20 bg-bg px-4 pt-1 pb-3">
            <CalendarioSemanal
              bloques={bloques}
              ahora={AHORA}
              resumen={`${creditos} créditos inscritos`}
              onExpandir={() => {}}
            />
          </div>
          <div className="px-4 pt-4">{lista}</div>
        </main>

        {/* Escritorio: lista 420 px con scroll propio + semana completa sticky. */}
        <main className="hidden min-h-0 flex-1 grid-cols-[420px_minmax(0,1fr)] gap-8 px-8 pt-6 lg:grid">
          <div className="min-h-0 overflow-y-auto pr-2 pb-8">
            <h2 className="mb-4 text-section font-semibold">Materias que puedes inscribir</h2>
            {lista}
          </div>
          <div className="min-h-0 pb-6">
            <CalendarioSemanal
              variante="completa"
              bloques={bloques}
              ahora={AHORA}
              resumen={`${creditos} créditos inscritos`}
              altoVisible={690}
            />
          </div>
        </main>

        <BandejaAccion
          visible={Boolean(seleccion)}
          className="lg:hidden"
          etiqueta="NRC seleccionado"
          accion={
            seleccion ? (
              <BotonInscribir
                nrc={seleccion.nrc}
                sinNrc
                estado={estado}
                vencimiento={new Date(AHORA + 300_000).toISOString()}
                ahora={AHORA}
                onClick={() => inscribir(seleccion)}
                disabled={offline}
                {...(motivo ? { motivo } : {})}
              />
            ) : null
          }
        >
          {seleccion ? (
            <>
              <p className="m-0 truncate text-[15px] leading-5 font-bold">{seleccion.titulo}</p>
              <p className="m-0 truncate text-[13px] leading-[18px] text-text-2 tabular">
                {seleccion.nrc}, {horarioLegible(seleccion.bloques)}
              </p>
            </>
          ) : null}
        </BandejaAccion>

        {toast > 0 && inscritas.at(-1) ? (
          <ConfirmacionExito
            key={toast}
            materia={inscritas.at(-1)!.titulo}
            nrc={inscritas.at(-1)!.nrc}
          />
        ) : null}
      </div>
    </ToastProvider>
  );
}

const meta = {
  title: "Composición/Inscripción",
  component: Inscripcion,
  parameters: { pantalla: true, layout: "fullscreen" },
} satisfies Meta<typeof Inscripcion>;
export default meta;
type Story = StoryObj<typeof meta>;

export const MovilClaro: Story = {
  name: "Móvil 390 · claro",
  globals: { theme: "claro", viewport: { value: "movil", isRotated: false } },
};
export const MovilOscuro: Story = {
  name: "Móvil 390 · oscuro",
  globals: { theme: "oscuro", viewport: { value: "movil", isRotated: false } },
};
export const EscritorioClaro: Story = {
  name: "Escritorio 1440 · claro",
  globals: { theme: "claro", viewport: { value: "escritorio", isRotated: false } },
};
export const EscritorioOscuro: Story = {
  name: "Escritorio 1440 · oscuro",
  globals: { theme: "oscuro", viewport: { value: "escritorio", isRotated: false } },
};
export const MovilSinConexion: Story = {
  name: "Móvil 390 · sin conexión",
  args: { conexion: "sin-conexion" },
  globals: { theme: "claro", viewport: { value: "movil", isRotated: false } },
};
