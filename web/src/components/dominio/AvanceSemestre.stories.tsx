import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { avance } from "@/lib/fixtures";
import { AvanceSemestre } from "./AvanceSemestre";

const meta = {
  title: "Dominio/AvanceSemestre",
  component: AvanceSemestre,
  args: { avance },
  decorators: [(Story) => <div className="max-w-[390px]">{Story()}</div>],
} satisfies Meta<typeof AvanceSemestre>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Cerrado: Story = {};
export const Abierto: Story = { args: { abierto: true } };
export const SinAtrasadas: Story = {
  args: { abierto: true, avance: { ...avance, atrasadas: [] } },
};
export const TodoInscrito: Story = {
  args: {
    avance: {
      ...avance,
      inscritas: 5,
      faltan: 0,
      habilitadasSinInscribir: 0,
      mensaje: "Ya inscribiste todas las materias de tu semestre.",
      materias: avance.materias.map((m) => ({ ...m, estado: "inscrita" as const })),
      atrasadas: [],
    },
  },
};
export const SinPendientes: Story = {
  args: {
    abierto: true,
    avance: {
      ...avance,
      totalPendientes: 0,
      inscritas: 0,
      faltan: 0,
      habilitadasSinInscribir: 0,
      materias: [],
      atrasadas: [],
      mensaje: "No tienes materias obligatorias pendientes en tu semestre.",
    },
  },
};
