import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { kpisDe } from "@/lib/analitica";
import { resumen } from "@/lib/fixturesAnalitica";
import { TarjetaKpi } from "./TarjetaKpi";

const meta = {
  title: "Analítica/TarjetaKpi",
  component: TarjetaKpi,
  args: { etiqueta: "Intentos", valor: "1.454", detalle: "497 estudiantes" },
  decorators: [(Story) => <div className="max-w-[200px]">{Story()}</div>],
} satisfies Meta<typeof TarjetaKpi>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Neutro: Story = {};
export const Critico: Story = {
  args: { etiqueta: "Sin cupo", valor: "33", detalle: "demanda no atendida", tono: "critico" },
};
export const MetaCumplida: Story = {
  args: { etiqueta: "Latencia p95", valor: "1 ms", detalle: "cumple meta < 1 s", tono: "bueno" },
};
export const MetaIncumplida: Story = {
  args: { etiqueta: "Latencia p95", valor: "1,5 s", detalle: "supera meta < 1 s", tono: "malo" },
};
export const FilaDeSeis: Story = {
  decorators: [(Story) => <div className="w-full max-w-none">{Story()}</div>],
  render: () => (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {kpisDe(resumen).map((k) => (
        <TarjetaKpi key={k.id} {...k} />
      ))}
    </div>
  ),
};
