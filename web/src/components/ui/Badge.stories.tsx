import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Check, Clock, Hourglass, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Badge } from "./Badge";
import { Chip } from "./Chip";

const meta = {
  title: "Primitivas/Badge y Chip",
  component: Badge,
  args: { children: "Presencial" },
} satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Tonos: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge>Virtual</Badge>
      <Badge tono="primario">Vista previa</Badge>
      <Badge tono="exito" icono={<Check strokeWidth={2.6} />}>
        Inscrita
      </Badge>
      <Badge tono="aviso" icono={<Hourglass />}>
        Quedan 3
      </Badge>
      <Badge tono="peligro" icono={<TriangleAlert />}>
        Último cupo
      </Badge>
      <Badge tono="reservado" icono={<Clock />}>
        Reservada 4:32
      </Badge>
    </div>
  ),
};

function Filtros() {
  const [activos, setActivos] = useState<string[]>(["noche"]);
  const alternar = (f: string) =>
    setActivos((a) => (a.includes(f) ? a.filter((x) => x !== f) : [...a, f]));
  return (
    <div role="group" aria-label="Filtrar por franja" className="flex flex-wrap gap-2">
      {[
        ["mañana", "Mañana"],
        ["tarde", "Tarde"],
        ["noche", "Noche"],
      ].map(([v, t]) => (
        <Chip key={v} activo={activos.includes(v!)} onClick={() => alternar(v!)}>
          {t}
        </Chip>
      ))}
    </div>
  );
}

export const ChipsDeFiltro: Story = { render: () => <Filtros /> };
