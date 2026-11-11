import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { demandaNrc } from "@/lib/fixturesAnalitica";
import { TablaDemandaNrc } from "./TablaDemandaNrc";

const meta = {
  title: "Analítica/TablaDemandaNrc",
  component: TablaDemandaNrc,
  parameters: { temaUnico: true },
  args: { items: demandaNrc, orden: "demanda", onOrden: fn() },
} satisfies Meta<typeof TablaDemandaNrc>;
export default meta;
type Story = StoryObj<typeof meta>;

export const PorIntentos: Story = {};
export const PorTiempoDeLlenado: Story = { args: { orden: "tiempo_llenado" } };
