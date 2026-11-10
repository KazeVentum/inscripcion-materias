import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Menu, X } from "lucide-react";
import { IconButton } from "./IconButton";

const meta = {
  title: "Primitivas/IconButton",
  component: IconButton,
  args: { etiqueta: "Abrir menú", icono: <Menu /> },
} satisfies Meta<typeof IconButton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Fantasma: Story = {};
export const Secundario: Story = {
  args: { variante: "secundario", etiqueta: "Cerrar", icono: <X /> },
};
export const Deshabilitado: Story = { args: { disabled: true } };
export const ConTooltip: Story = { args: { conTooltip: true }, parameters: { temaUnico: true } };
