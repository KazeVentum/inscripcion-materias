import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, screen, userEvent, within } from "storybook/test";
import { ConfirmacionExito } from "@/components/estados/ConfirmacionExito";
import { Button } from "./Button";
import { Toast, ToastProvider } from "./Toast";

const meta = {
  title: "Primitivas/Toast",
  component: Toast,
  parameters: { temaUnico: true },
  args: { children: "Inscrita: Sistemas Operativos, NRC 80852.", abierto: true, duracion: 1e9 },
  decorators: [
    (Story) => (
      <ToastProvider>
        <div className="min-h-[240px]">{Story()}</div>
      </ToastProvider>
    ),
  ],
} satisfies Meta<typeof Toast>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ExitoClaro: Story = { globals: { theme: "claro" } };
export const ExitoOscuro: Story = { globals: { theme: "oscuro" } };
export const ErrorClaro: Story = {
  args: {
    tono: "error",
    children: "Se cruza con Estructuras de Datos (NRC 81204) el martes a las 18:15.",
  },
  globals: { theme: "claro" },
};
export const ErrorOscuro: Story = { ...ErrorClaro, globals: { theme: "oscuro" } };
export const SinConexion: Story = {
  args: {
    tono: "sin-conexion",
    children: "Sin conexión. Los cupos pueden haber cambiado. Reconectando…",
  },
  globals: { theme: "oscuro" },
};
export const ConAccion: Story = {
  args: { accion: { etiqueta: "Ver horario", alt: "Ver tu horario", onClick: () => {} } },
  globals: { theme: "claro" },
};

function Disparar() {
  const [n, setN] = useState(0);
  return (
    <>
      <Button onClick={() => setN((x) => x + 1)}>Inscribir 80852</Button>
      {n > 0 ? <ConfirmacionExito key={n} materia="Sistemas Operativos" nrc="80852" /> : null}
    </>
  );
}

/** Al confirmar: toast 4 s con el check que se traza. */
export const AlConfirmar: Story = {
  render: () => <Disparar />,
  globals: { theme: "claro" },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Inscribir 80852" }));
    await expect(
      await screen.findByText("Inscrita: Sistemas Operativos, NRC 80852."),
    ).toBeVisible();
  },
};
