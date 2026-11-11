import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { auditoria } from "@/lib/fixturesAnalitica";
import { TablaAuditoria } from "./TablaAuditoria";

const meta = {
  title: "Analítica/TablaAuditoria",
  component: TablaAuditoria,
  args: { filas: auditoria },
  decorators: [(Story) => <div className="max-w-[460px]">{Story()}</div>],
} satisfies Meta<typeof TablaAuditoria>;
export default meta;
export const PorTipo: StoryObj<typeof meta> = {};
