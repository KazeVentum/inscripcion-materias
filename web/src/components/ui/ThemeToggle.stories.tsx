import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ThemeToggle } from "./ThemeToggle";

const meta = {
  title: "Primitivas/ThemeToggle",
  component: ThemeToggle,
} satisfies Meta<typeof ThemeToggle>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Sistema: Story = { args: { valor: "sistema" } };
export const Claro: Story = { args: { valor: "claro" } };
export const Oscuro: Story = { args: { valor: "oscuro" } };
