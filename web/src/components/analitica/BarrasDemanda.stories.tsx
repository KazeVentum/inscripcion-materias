import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { barrasDemanda } from "@/lib/analitica";
import { demandaInsatisfecha } from "@/lib/fixturesAnalitica";
import { BarrasDemanda } from "./BarrasDemanda";

const meta = {
  title: "Analítica/BarrasDemanda",
  component: BarrasDemanda,
  args: { barras: barrasDemanda(demandaInsatisfecha) },
  decorators: [(Story) => <div className="max-w-[560px]">{Story()}</div>],
} satisfies Meta<typeof BarrasDemanda>;
export default meta;
type Story = StoryObj<typeof meta>;

export const TresCriticas: Story = {};
export const SinCriticas: Story = { args: { barras: barrasDemanda(demandaInsatisfecha, 0) } };
