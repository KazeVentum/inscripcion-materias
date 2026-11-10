import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import {
  nrc40930Alternativa,
  nrc80852,
  nrc81377,
  nrc86366Agotado,
  nrcHolgado,
  nrcVirtual,
} from "@/lib/fixtures";
import { BotonInscribir } from "./BotonInscribir";
import { TarjetaNrc } from "./TarjetaNrc";

const meta = {
  title: "Dominio/TarjetaNrc",
  component: TarjetaNrc,
  args: { nrc: nrc80852, onSeleccionar: fn(), onVistaPrevia: fn() },
  decorators: [(Story) => <div className="max-w-[358px]">{Story()}</div>],
} satisfies Meta<typeof TarjetaNrc>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Normal: Story = { args: { nrc: nrcHolgado } };
export const PocosCupos: Story = {};
export const UltimoCupo: Story = { args: { nrc: nrc81377 } };
export const VistaPreviaActiva: Story = {
  args: { seleccionada: true },
  play: async ({ canvasElement, args }) => {
    const [boton] = within(canvasElement).getAllByRole("button", { pressed: true });
    await expect(boton).toHaveAccessibleName("80852 Presencial, Calle 80 Mar y Jue 18:15–19:44");
    await expect(boton).toHaveAccessibleDescription(/Quedan 3 de 18/);
    await userEvent.click(boton!);
    await expect(args.onSeleccionar).toHaveBeenCalledWith(nrc80852);
  },
};
export const Virtual: Story = { args: { nrc: nrcVirtual } };
/** Sin cupo y con alternativa de la API: el aviso ocupa el lugar de la tarjeta. */
export const SinCupoConAlternativa: Story = {
  args: { nrc: nrc86366Agotado, alternativa: nrc40930Alternativa },
};
export const SinCupoSinAlternativa: Story = { args: { nrc: nrc86366Agotado, alternativa: null } };
export const AgotadoSinAviso: Story = { args: { nrc: nrc86366Agotado } };
export const SinConexion: Story = { args: { sinConexion: true } };

/** Escritorio: la acción vive en la tarjeta. */
export const ConAccion: Story = {
  args: { accion: <BotonInscribir nrc="80852" tamano="sm" /> },
  decorators: [(Story) => <div className="max-w-[420px]">{Story()}</div>],
};

function EnVivo() {
  const [n, setN] = useState(nrc80852);
  const [sel, setSel] = useState(false);
  return (
    <div className="grid gap-3">
      <TarjetaNrc
        nrc={n}
        seleccionada={sel}
        onSeleccionar={() => setSel((s) => !s)}
        alternativa={nrc40930Alternativa}
      />
      <button
        type="button"
        className="min-h-11 justify-self-start text-compact font-semibold text-info underline"
        onClick={() =>
          setN((x) => ({ ...x, cuposLibres: x.cuposLibres > 0 ? x.cuposLibres - 1 : 3 }))
        }
      >
        Simular que otra persona inscribe
      </button>
    </div>
  );
}
/** Se agota mientras la miras: la tarjeta da paso a la alternativa en su lugar. */
export const SeAgotaEnVivo: Story = { render: () => <EnVivo />, parameters: { temaUnico: true } };

/** Todos los estados juntos (capturas y revisión contra el brief). */
export const Galeria: Story = {
  decorators: [(Story) => <div className="max-w-[358px]">{Story()}</div>],
  render: () => (
    <div className="grid gap-3">
      <TarjetaNrc nrc={nrcHolgado} />
      <TarjetaNrc nrc={nrc80852} seleccionada />
      <TarjetaNrc nrc={nrc86366Agotado} alternativa={nrc40930Alternativa} />
      <TarjetaNrc nrc={nrc81377} />
      <TarjetaNrc nrc={nrcVirtual} />
    </div>
  ),
};
