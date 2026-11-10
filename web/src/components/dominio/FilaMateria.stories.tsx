import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { EstadoVacio } from "@/components/estados/EstadoVacio";
import {
  AHORA,
  VENCIMIENTO_RESERVA,
  materias,
  nrc80852,
  nrc81377,
  nrcHolgado,
} from "@/lib/fixtures";
import { FilaMateria, ListaMaterias } from "./FilaMateria";
import { TarjetaNrc } from "./TarjetaNrc";

const [so, calculo, fisica, ingles, estructuras] = materias as [
  (typeof materias)[0],
  (typeof materias)[0],
  (typeof materias)[0],
  (typeof materias)[0],
  (typeof materias)[0],
];

const meta = {
  title: "Dominio/FilaMateria",
  component: FilaMateria,
  args: { materia: so },
  decorators: [
    (Story, ctx) => (
      <div className="max-w-[390px]">
        <ListaMaterias
          titulo="3.er semestre"
          abiertasInicial={(ctx.parameters.abiertas as string[]) ?? []}
        >
          {Story()}
        </ListaMaterias>
      </div>
    ),
  ],
} satisfies Meta<typeof FilaMateria>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Pendiente: Story = {
  args: {
    children: (
      <>
        <TarjetaNrc nrc={nrc80852} />
        <TarjetaNrc nrc={nrc81377} />
      </>
    ),
  },
  play: async ({ canvasElement }) => {
    const [fila] = within(canvasElement).getAllByRole("button", { name: /Sistemas Operativos/ });
    await expect(fila).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(fila!);
    await expect(fila).toHaveAttribute("aria-expanded", "true");
  },
};
export const Expandida: Story = {
  ...Pendiente,
  play: undefined,
  parameters: { abiertas: ["ISUMBG103"] },
  args: {
    ...Pendiente.args,
    children: (
      <>
        <TarjetaNrc nrc={nrc80852} seleccionada />
        <TarjetaNrc nrc={nrcHolgado} />
      </>
    ),
  },
};
export const SinGrupos: Story = {
  args: {
    materia: fisica,
    children: (
      <EstadoVacio
        titulo="Ningún grupo de esta materia encaja hoy con tu semana."
        texto="La lista se actualiza sola si se abre un cupo."
      />
    ),
  },
  parameters: { abiertas: ["FISI1010"] },
};
export const Inscrita: Story = { args: { materia: estructuras, nrcInscrito: "81204" } };
export const Reservada: Story = {
  args: { materia: ingles, reservaVence: VENCIMIENTO_RESERVA, ahora: AHORA },
};
export const Varias: Story = {
  render: () => (
    <>
      <FilaMateria materia={so} />
      <FilaMateria materia={calculo} />
      <FilaMateria materia={ingles} reservaVence={VENCIMIENTO_RESERVA} ahora={AHORA} />
      <FilaMateria materia={estructuras} nrcInscrito="81204" />
    </>
  ),
};
