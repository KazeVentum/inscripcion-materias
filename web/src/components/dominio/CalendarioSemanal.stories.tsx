import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { AHORA, bloquesConConflicto, bloquesSemana } from "@/lib/fixtures";
import { CalendarioSemanal } from "./CalendarioSemanal";

const meta = {
  title: "Dominio/CalendarioSemanal",
  component: CalendarioSemanal,
  args: { bloques: bloquesSemana, ahora: AHORA, resumen: "6 créditos inscritos" },
} satisfies Meta<typeof CalendarioSemanal>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Móvil: 07–22 en 180 px, solo NRC o contador en cada bloque. */
export const Compacta: Story = {
  args: { onExpandir: fn() },
  decorators: [(Story) => <div className="max-w-[358px]">{Story()}</div>],
};
export const CompactaConConflicto: Story = {
  args: { bloques: bloquesConConflicto },
  decorators: [(Story) => <div className="max-w-[358px]">{Story()}</div>],
};
export const CompactaVacia: Story = {
  args: { bloques: [], resumen: "0 créditos" },
  decorators: [(Story) => <div className="max-w-[358px]">{Story()}</div>],
};
/** Escritorio: 64 px por hora, scroll inicial a las 17:30. */
export const Completa: Story = {
  args: { variante: "completa", altoVisible: 560 },
  parameters: { temaUnico: true },
};
export const CompletaOscuro: Story = {
  ...Completa,
  globals: { theme: "oscuro" },
};
export const CompletaConConflicto: Story = {
  args: { variante: "completa", bloques: bloquesConConflicto, altoVisible: 560 },
  parameters: { temaUnico: true },
};
