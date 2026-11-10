import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { nrc40930Alternativa } from "@/lib/fixtures";
import { AvisoAlternativa } from "./AvisoAlternativa";

const meta = {
  title: "Dominio/AvisoAlternativa",
  component: AvisoAlternativa,
  args: { agotado: "86366", alternativa: nrc40930Alternativa, onInscribir: fn(), onVerOtros: fn() },
  decorators: [(Story) => <div className="max-w-[358px]">{Story()}</div>],
} satisfies Meta<typeof AvisoAlternativa>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ConAlternativa: Story = {};
export const SinAlternativa: Story = { args: { alternativa: null } };
export const SinConexion: Story = { args: { motivoDeshabilitado: "Sin conexión" } };
