import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BarraOcupacion } from "./BarraOcupacion";

const meta = {
  title: "Analítica/BarraOcupacion",
  component: BarraOcupacion,
  args: { ocupados: 12, total: 18 },
  decorators: [(Story) => <div className="max-w-[240px]">{Story()}</div>],
} satisfies Meta<typeof BarraOcupacion>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Parcial: Story = {};
export const Lleno: Story = { args: { ocupados: 18 } };
export const LlenoConDemandaSinAtender: Story = { args: { ocupados: 18, critico: true } };
export const Continua: Story = { args: { ocupados: 30, total: 45 } };
