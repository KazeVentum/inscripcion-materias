import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AHORA } from "@/lib/fixtures";
import { BotonInscribir } from "./BotonInscribir";

const meta = {
  title: "Dominio/BotonInscribir",
  component: BotonInscribir,
  args: { nrc: "80852", ahora: AHORA, vencimiento: new Date(AHORA + 300_000).toISOString() },
} satisfies Meta<typeof BotonInscribir>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Reposo: Story = {};
export const Inscribiendo: Story = { args: { estado: "inscribiendo" } };
export const Reservado: Story = { args: { estado: "reservado" } };
export const Inscrita: Story = { args: { estado: "inscrita" } };
export const SinConexion: Story = { args: { disabled: true, motivo: "Sin conexión" } };
export const Flujo: Story = {
  render: (args) => (
    <div className="flex flex-wrap gap-2.5">
      <BotonInscribir {...args} tamano="sm" />
      <BotonInscribir {...args} tamano="sm" estado="inscribiendo" />
      <BotonInscribir {...args} tamano="sm" estado="reservado" />
      <BotonInscribir {...args} tamano="sm" estado="inscrita" />
    </div>
  ),
};
