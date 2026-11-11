import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { EstadoSinDatos } from "./EstadoSinDatos";

const meta = {
  title: "Analítica/EstadoSinDatos",
  component: EstadoSinDatos,
  decorators: [(Story) => <div className="max-w-[640px]">{Story()}</div>],
} satisfies Meta<typeof EstadoSinDatos>;
export default meta;
export const SinOro: StoryObj<typeof meta> = {};
