import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CalendarDays, List } from "lucide-react";
import { expect, userEvent, within } from "storybook/test";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./Tabs";

const meta = {
  title: "Primitivas/SegmentedControl",
  component: Tabs,
  parameters: { temaUnico: true },
} satisfies Meta<typeof Tabs>;
export default meta;
type Story = StoryObj<typeof meta>;

const render = () => (
  <Tabs defaultValue="materias" className="max-w-[358px]">
    <TabsList aria-label="Vista" className="w-full">
      <TabsTrigger value="semana">
        <CalendarDays aria-hidden="true" />
        Semana
      </TabsTrigger>
      <TabsTrigger value="materias">
        <List aria-hidden="true" />
        Materias
      </TabsTrigger>
    </TabsList>
    <TabsContent value="semana" className="mt-4 text-compact text-text-2">
      Tu semana completa, con texto en cada bloque.
    </TabsContent>
    <TabsContent value="materias" className="mt-4 text-compact text-text-2">
      Materias habilitadas para 2027-1.
    </TabsContent>
  </Tabs>
);

export const Claro: Story = {
  render,
  globals: { theme: "claro" },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole("tab", { name: "Semana" }));
    await expect(c.getByRole("tab", { name: "Semana" })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowRight}");
    await expect(c.getByRole("tab", { name: "Materias" })).toHaveFocus();
  },
};
export const Oscuro: Story = { render, globals: { theme: "oscuro" } };
