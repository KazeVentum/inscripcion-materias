import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, screen, userEvent, waitFor, within } from "storybook/test";
import { CalendarioSemanal } from "@/components/dominio/CalendarioSemanal";
import { BotonInscribir } from "@/components/dominio/BotonInscribir";
import { AHORA, bloquesSemana } from "@/lib/fixtures";
import { BandejaAccion } from "./BandejaAccion";
import { Button } from "./Button";
import { Dialog, DialogClose } from "./Dialog";

const meta = {
  title: "Primitivas/Dialog y Sheet",
  component: Dialog,
  parameters: { temaUnico: true },
  args: {
    titulo: "¿Cancelar Inglés II?",
    descripcion:
      "Liberamos el cupo de 55120 y sale de tu horario. Puedes volver a inscribirla si sigue habiendo cupo.",
    abiertoInicial: true,
    acciones: (
      <>
        <DialogClose asChild>
          <Button variante="secundario">Conservar</Button>
        </DialogClose>
        <Button variante="peligro">Cancelar inscripción</Button>
      </>
    ),
  },
  decorators: [(Story) => <div className="min-h-[560px]">{Story()}</div>],
} satisfies Meta<typeof Dialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const CentradoClaro: Story = {
  globals: { theme: "claro" },
  play: async () => {
    const dialogo = await screen.findByRole("dialog", { name: "¿Cancelar Inglés II?" });
    await waitFor(() => expect(dialogo).toBeVisible());
    await userEvent.keyboard("{Escape}");
    await expect(screen.queryByRole("dialog")).toBeNull();
  },
};
export const CentradoOscuro: Story = { globals: { theme: "oscuro" } };

export const BandejaClaro: Story = {
  args: { forma: "bandeja" },
  globals: { theme: "claro", viewport: { value: "movil" } },
};
export const BandejaOscuro: Story = {
  args: { forma: "bandeja" },
  globals: { theme: "oscuro", viewport: { value: "movil" } },
};
/** Respaldo sin backdrop-filter o con prefers-reduced-transparency. */
export const BandejaSolida: Story = {
  args: { forma: "bandeja", solido: true },
  globals: { theme: "oscuro" },
};

export const ConDisparador: Story = {
  args: {
    abiertoInicial: false,
    disparador: <Button variante="secundario">Cancelar Inglés II</Button>,
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Cancelar Inglés II" }),
    );
    const dialogo = await screen.findByRole("dialog");
    await waitFor(() => expect(dialogo).toBeVisible());
    // El foco queda atrapado dentro del diálogo.
    await expect(screen.getByRole("dialog")).toContainElement(
      document.activeElement as HTMLElement,
    );
  },
};

function MarcoBandeja({ solido }: { solido: boolean }) {
  return (
    <div className="relative mx-auto h-[420px] max-w-[390px] overflow-hidden rounded-card border border-border bg-bg">
      <div className="p-4">
        <CalendarioSemanal
          bloques={bloquesSemana}
          ahora={AHORA}
          resumen="6 créditos inscritos"
          pxPorHora={18}
        />
      </div>
      <BandejaAccion
        posicion="absolute"
        solido={solido}
        accion={<BotonInscribir nrc="80852" sinNrc />}
      >
        <p className="m-0 truncate text-[15px] leading-5 font-bold">Sistemas Operativos</p>
        <p className="m-0 truncate text-[13px] leading-[18px] text-text-2 tabular">
          80852, Mar y Jue 18:15–19:44
        </p>
      </BandejaAccion>
    </div>
  );
}

/** Bandeja de acción (no modal) sobre la semana: el vidrio deja ver los bloques detrás. */
export const BandejaAccionVidrio: Story = {
  parameters: { temaUnico: false },
  render: () => <MarcoBandeja solido={false} />,
};
export const BandejaAccionSolida: Story = {
  parameters: { temaUnico: false },
  render: () => <MarcoBandeja solido />,
};
