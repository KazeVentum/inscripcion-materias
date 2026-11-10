import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AHORA } from "@/lib/fixtures";
import { IndicadorEnVivo } from "./IndicadorEnVivo";

const meta = {
  title: "Dominio/IndicadorEnVivo",
  component: IndicadorEnVivo,
  args: { estado: "en-vivo", ahora: AHORA },
} satisfies Meta<typeof IndicadorEnVivo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const EnVivo: Story = {};
export const Reconectando: Story = {
  args: { estado: "reconectando", ultimaActualizacion: new Date(AHORA - 12_000).toISOString() },
};
export const SinConexion: Story = {
  args: { estado: "sin-conexion", ultimaActualizacion: new Date(AHORA - 40_000).toISOString() },
};
export const SinDato: Story = { args: { estado: "sin-conexion" } };
