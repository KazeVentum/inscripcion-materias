import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, screen, userEvent, waitFor } from "storybook/test";
import { validacionFalla, validacionOk } from "@/lib/fixturesAnalitica";
import { InsigniaValidacion } from "./InsigniaValidacion";

const meta = {
  title: "Analítica/InsigniaValidacion",
  component: InsigniaValidacion,
  parameters: { temaUnico: true },
  args: { validacion: validacionOk },
  decorators: [(Story) => <div className="min-h-[420px]">{Story()}</div>],
} satisfies Meta<typeof InsigniaValidacion>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Cuadra: Story = {};
export const NoCuadra: Story = { args: { validacion: validacionFalla } };
export const DetalleAbierto: Story = {
  play: async ({ canvasElement }) => {
    const boton = canvasElement.querySelector("button");
    if (!boton) throw new Error("sin insignia");
    await userEvent.click(boton);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    await expect(screen.getByText(/esperado 5\.616 · obtenido 5\.616/)).toBeInTheDocument();
  },
};
