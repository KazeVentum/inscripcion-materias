import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ocupacionFranja } from "@/lib/fixturesAnalitica";
import { MapaOcupacion } from "./MapaOcupacion";

const meta = {
  title: "Analítica/MapaOcupacion",
  component: MapaOcupacion,
  args: { items: ocupacionFranja },
  decorators: [(Story) => <div className="max-w-[460px]">{Story()}</div>],
} satisfies Meta<typeof MapaOcupacion>;
export default meta;
type Story = StoryObj<typeof meta>;

export const FranjaPorSede: Story = {};
