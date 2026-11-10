import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Campo } from "./Campo";

const meta = {
  title: "UI/Campo",
  component: Campo,
  args: { etiqueta: "Estudiante o correo", placeholder: "est-000001" },
  decorators: [(Story) => <div className="max-w-[360px]">{Story()}</div>],
} satisfies Meta<typeof Campo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Reposo: Story = {};
export const ConAyuda: Story = { args: { ayuda: "Tu código de estudiante o tu correo." } };
export const ConError: Story = {
  args: { defaultValue: "est-9", error: "Usuario o contraseña incorrectos." },
};
export const Contrasena: Story = {
  args: { etiqueta: "Contraseña", type: "password", alternarVisibilidad: true },
};
export const Deshabilitado: Story = { args: { disabled: true, defaultValue: "est-000001" } };
