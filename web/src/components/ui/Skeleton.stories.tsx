import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Skeleton } from "./Skeleton";

const meta = {
  title: "Primitivas/Skeleton",
  component: Skeleton,
} satisfies Meta<typeof Skeleton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Lineas: Story = {
  render: () => (
    <div className="grid max-w-80 gap-2">
      <Skeleton className="w-3/5" />
      <Skeleton className="w-4/5" />
      <Skeleton className="w-2/5" />
    </div>
  ),
};
