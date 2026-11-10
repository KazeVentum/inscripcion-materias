import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AHORA } from "@/lib/fixtures";
import type { BloqueCalendarioDatos } from "@/lib/tipos";
import { BloqueCalendario } from "./BloqueCalendario";

const base: BloqueCalendarioDatos = {
  id: "b",
  nrc: "81204",
  titulo: "Estructuras de Datos",
  dia: "LUN",
  inicio: "18:15",
  fin: "19:44",
  edificio: "RGH",
  salon: "A402LS25",
  estado: "inscrito",
};

const meta = {
  title: "Dominio/BloqueCalendario",
  component: BloqueCalendario,
  args: { bloque: base, ahora: AHORA },
  decorators: [
    (Story, ctx) =>
      ctx.parameters.sinMarco ? (
        Story()
      ) : (
        <ul
          className="relative m-0 grid list-none rounded-chip bg-surface-2 p-1.5"
          style={{
            width: ctx.args.variante === "compacto" ? 52 : 120,
            height: ctx.args.variante === "compacto" ? 26 : 96,
          }}
        >
          {Story()}
        </ul>
      ),
  ],
} satisfies Meta<typeof BloqueCalendario>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Inscrito: Story = {};
export const VistaPrevia: Story = {
  args: {
    bloque: {
      ...base,
      nrc: "80852",
      titulo: "Sistemas Operativos",
      dia: "MAR",
      salon: "A406LS27",
      estado: "vista-previa",
    },
  },
};
/** Reservado recién: contador en 5:00. */
export const Reservado: Story = {
  args: {
    bloque: {
      ...base,
      nrc: "55120",
      titulo: "Inglés II",
      dia: "SAB",
      inicio: "08:30",
      fin: "09:59",
      edificio: "MPD",
      salon: "D105LS03",
      estado: "reservado",
      vencimiento: new Date(AHORA + 300_000).toISOString(),
    },
  },
};
export const Conflicto: Story = {
  args: {
    bloque: {
      ...base,
      nrc: "90011",
      titulo: "Física Mecánica",
      estado: "conflicto",
      cruzaCon: "80852",
    },
  },
};
export const CompactoInscrito: Story = { args: { variante: "compacto" } };
export const CompactoReservado: Story = { args: { ...Reservado.args, variante: "compacto" } };

/** Los cuatro estados lado a lado, como en el brief. */
export const Estados: Story = {
  parameters: { sinMarco: true },
  render: (args) => (
    <div className="grid max-w-[560px] grid-cols-2 gap-2.5 sm:grid-cols-4">
      {[Inscrito, VistaPrevia, Reservado, Conflicto].map((s, i) => (
        <ul key={i} className="relative m-0 h-24 list-none rounded-chip bg-surface-2 p-1.5">
          <BloqueCalendario {...args} {...s.args} className="absolute inset-1.5" />
        </ul>
      ))}
    </div>
  ),
};
