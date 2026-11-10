import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useEffect, useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Button } from "@/components/ui/Button";
import { BarraCupos } from "./BarraCupos";

const meta = {
  title: "Dominio/BarraCupos",
  component: BarraCupos,
  args: { nrc: "80852", total: 18, libres: 12 },
  decorators: [(Story) => <div className="max-w-[320px]">{Story()}</div>],
} satisfies Meta<typeof BarraCupos>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Lleno18de18: Story = { name: "18 de 18 libres", args: { libres: 18 } };
export const Holgado12: Story = { name: "12 libres", args: { libres: 12 } };
export const Pocos3: Story = { name: "Quedan 3", args: { libres: 3 } };
export const Ultimo1: Story = { name: "Último cupo", args: { libres: 1 } };
export const Agotado0: Story = { name: "Agotado", args: { libres: 0 } };
export const Destacada: Story = { args: { libres: 3, variante: "destacada" } };
export const SinConexion: Story = {
  name: "Atenuada (sin conexión)",
  args: { libres: 12, atenuada: true },
};
/** Más de 40 cupos: barra continua con marcas cada 5. */
export const Continua: Story = { args: { libres: 31, total: 45 } };

/** Todos los niveles juntos (como en el brief). */
export const Niveles: Story = {
  render: (args) => (
    <div className="grid gap-4">
      {[18, 9, 3, 1, 0].map((l) => (
        <BarraCupos key={l} {...args} libres={l} />
      ))}
    </div>
  ),
};

function EnVivo({ total, nrc }: { total: number; nrc: string }) {
  const [libres, setLibres] = useState(6);
  return (
    <div className="grid gap-4">
      <BarraCupos libres={libres} total={total} nrc={nrc} />
      <div className="flex gap-2">
        <Button
          tamano="sm"
          variante="secundario"
          onClick={() => setLibres((l) => Math.max(0, l - 1))}
        >
          Ocupar un cupo
        </Button>
        <Button tamano="sm" variante="fantasma" onClick={() => setLibres(6)}>
          Reiniciar
        </Button>
      </div>
    </div>
  );
}

/**
 * Cupos en vivo: cada clic ocupa una silla (se apaga en 420 ms y la cifra se contornea).
 * El lector de pantalla solo oye los umbrales.
 */
export const Umbrales: Story = {
  render: (args) => <EnVivo total={args.total} nrc={args.nrc} />,
  parameters: { temaUnico: true },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    const vivo = canvasElement.querySelector('[aria-live="polite"]') as HTMLElement;
    const ocupar = c.getByRole("button", { name: "Ocupar un cupo" });
    await userEvent.click(ocupar); // 6 → 5: sin anuncio
    await expect(vivo).toHaveTextContent("");
    await userEvent.click(ocupar); // 5 → 4: cruza a "pocos"
    await waitFor(() => expect(vivo).toHaveTextContent("Quedan 4 cupos en 80852."));
    await userEvent.click(ocupar); // 4 → 3: mismo nivel, conserva el último anuncio
    await userEvent.click(ocupar); // 3 → 2
    await userEvent.click(ocupar); // 2 → 1
    await waitFor(() => expect(vivo).toHaveTextContent("Queda el último cupo en 80852."));
    await userEvent.click(ocupar); // 1 → 0
    await waitFor(() => expect(vivo).toHaveTextContent("80852 se agotó."));
    await expect(c.getByRole("img")).toHaveAccessibleName("0 de 18 cupos libres");
  },
};

function Simulacion() {
  const [libres, setLibres] = useState(18);
  useEffect(() => {
    const id = window.setInterval(() => setLibres((l) => (l <= 0 ? 18 : l - 1)), 1200);
    return () => window.clearInterval(id);
  }, []);
  return <BarraCupos libres={libres} total={18} nrc="80852" variante="destacada" />;
}

/** Simulación continua para ver la animación (no se usa en capturas). */
export const Simulado: Story = { render: () => <Simulacion />, tags: ["!test"] };
