import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/** Pulso lento de opacidad (1.4 s), sin brillo que barre. Decorativo: aria-hidden. */
export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      aria-hidden="true"
      className={cn("block h-3 animate-pulso rounded-chip bg-surface-2", className)}
      {...rest}
    />
  );
}
