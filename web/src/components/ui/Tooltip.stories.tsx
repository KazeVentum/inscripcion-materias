import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Info } from "lucide-react";
import { IconButton } from "./IconButton";
import { Tooltip } from "./Tooltip";

const meta = {
  title: "Primitivas/Tooltip",
  component: Tooltip,
  parameters: { temaUnico: true },
  args: {
    contenido: "El cupo se guarda 5 minutos mientras confirmamos.",
    children: <IconButton etiqueta="Qué es una reserva" icono={<Info />} />,
  },
  decorators: [(Story) => <div className="grid min-h-40 place-items-center">{Story()}</div>],
} satisfies Meta<typeof Tooltip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AlPasar: Story = {};
export const AbiertoClaro: Story = { args: { abierto: true }, globals: { theme: "claro" } };
export const AbiertoOscuro: Story = { args: { abierto: true }, globals: { theme: "oscuro" } };
