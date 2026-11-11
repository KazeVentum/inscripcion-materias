import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { combinaciones } from "@/lib/fixturesAnalitica";
import { ListaCombinaciones } from "./ListaCombinaciones";

const meta = {
  title: "Analítica/ListaCombinaciones",
  component: ListaCombinaciones,
  args: { items: combinaciones },
  decorators: [(Story) => <div className="max-w-[560px]">{Story()}</div>],
} satisfies Meta<typeof ListaCombinaciones>;
export default meta;
export const Pares: StoryObj<typeof meta> = {};
