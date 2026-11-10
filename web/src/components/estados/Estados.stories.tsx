import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Button } from "@/components/ui/Button";
import { ToastProvider } from "@/components/ui/Toast";
import { ConfirmacionExito } from "./ConfirmacionExito";
import { EstadoCarga } from "./EstadoCarga";
import { EstadoError } from "./EstadoError";
import { EstadoSinConexion } from "./EstadoSinConexion";
import { EstadoVacio } from "./EstadoVacio";

const meta = {
  title: "Estados/Estados",
  component: EstadoVacio,
  args: { titulo: "No tienes materias pendientes para 2027-1." },
  decorators: [(Story) => <div className="max-w-[390px]">{Story()}</div>],
} satisfies Meta<typeof EstadoVacio>;
export default meta;
type Story = StoryObj<typeof meta>;

export const VacioMaterias: Story = {
  args: {
    texto: "Revisa tu horario.",
    accion: (
      <Button variante="secundario" tamano="sm">
        Ver mi horario
      </Button>
    ),
  },
};
export const VacioGrupos: Story = {
  args: {
    titulo: "Ningún grupo de esta materia encaja hoy con tu semana.",
    texto: "La lista se actualiza sola.",
    accion: (
      <Button variante="fantasma" tamano="sm">
        Ver mi horario
      </Button>
    ),
  },
};
export const ErrorAlInscribir: Story = {
  render: () => (
    <EstadoError
      titulo="No pudimos inscribirte."
      texto="No se descontó ningún cupo. Revisa tu conexión y vuelve a intentarlo."
      onReintentar={() => {}}
    />
  ),
};
export const ErrorReintentando: Story = {
  render: () => (
    <EstadoError
      titulo="No pudimos cargar tus materias."
      texto="Tu horario sigue igual."
      onReintentar={() => {}}
      reintentando
    />
  ),
};
export const Rechazada: Story = {
  render: () => (
    <EstadoError
      titulo="El sistema académico no confirmó 80852."
      texto="Liberamos el cupo; puedes intentarlo de nuevo."
      onReintentar={() => {}}
    />
  ),
};
export const SinConexion: Story = { render: () => <EstadoSinConexion /> };
export const Carga: Story = { render: () => <EstadoCarga /> };

export const ConfirmacionExitoClaro: Story = {
  parameters: { temaUnico: true },
  globals: { theme: "claro" },
  render: () => (
    <ToastProvider>
      <div className="min-h-[200px]" />
      <ConfirmacionExito materia="Sistemas Operativos" nrc="80852" abierto />
    </ToastProvider>
  ),
};
export const ConfirmacionExitoOscuro: Story = {
  ...ConfirmacionExitoClaro,
  globals: { theme: "oscuro" },
};
