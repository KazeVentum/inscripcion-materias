import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Plus, Trash2 } from "lucide-react";
import { expect, fn, userEvent, within } from "storybook/test";
import { Button } from "./Button";

const meta = {
  title: "Primitivas/Button",
  component: Button,
  args: { children: "Inscribir 80852", onClick: fn() },
  argTypes: {
    variante: {
      control: "inline-radio",
      options: ["primario", "secundario", "fantasma", "peligro", "reservado", "hecho"],
    },
    tamano: { control: "inline-radio", options: ["md", "sm"] },
  },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Primario: Story = {
  play: async ({ canvasElement, args }) => {
    const [boton] = within(canvasElement).getAllByRole("button", { name: "Inscribir 80852" });
    await userEvent.click(boton!);
    await expect(args.onClick).toHaveBeenCalled();
  },
};
export const Secundario: Story = { args: { variante: "secundario", children: "Ver otros grupos" } };
export const Fantasma: Story = { args: { variante: "fantasma", children: "Ver mi horario" } };
export const Peligro: Story = {
  args: {
    variante: "peligro",
    children: "Cancelar inscripción",
    icono: <Trash2 aria-hidden="true" />,
  },
};
export const ConIcono: Story = {
  args: { variante: "secundario", children: "Agregar materia", icono: <Plus aria-hidden="true" /> },
};
export const Cargando: Story = { args: { cargando: true, children: "Inscribiendo…" } };
export const Deshabilitado: Story = {
  args: { disabled: true, motivo: "Sin conexión: espera a que vuelvan los cupos en vivo." },
};
export const Pequeno: Story = { args: { tamano: "sm" } };
export const Bloque: Story = { args: { bloque: true, children: "Inscribir" } };

/** Todas las variantes juntas, para comparar jerarquía. */
export const Todas: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-start gap-3">
      <Button {...args}>Inscribir 80852</Button>
      <Button {...args} variante="secundario">
        Ver otros grupos
      </Button>
      <Button {...args} variante="fantasma">
        Ver mi horario
      </Button>
      <Button {...args} variante="peligro">
        Cancelar inscripción
      </Button>
      <Button {...args} cargando>
        Inscribiendo…
      </Button>
      <Button {...args} disabled>
        Inscribir
      </Button>
    </div>
  ),
};
