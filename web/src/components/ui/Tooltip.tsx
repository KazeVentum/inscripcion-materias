"use client";

import { Tooltip as T } from "radix-ui";
import type { ReactNode } from "react";

export const TooltipProvider = T.Provider;

export interface TooltipProps {
  contenido: ReactNode;
  children: ReactNode;
  lado?: "top" | "right" | "bottom" | "left";
  /** Para stories y capturas. */
  abierto?: boolean;
}

/**
 * Ayuda breve. Nunca lleva información imprescindible: en táctil no hay hover.
 * Fondo invertido (--text) con texto --surface: 15.8:1 en claro, 14.1:1 en oscuro.
 */
export function Tooltip({ contenido, children, lado = "top", abierto }: TooltipProps) {
  return (
    <T.Root delayDuration={300} {...(abierto !== undefined ? { open: abierto } : {})}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={lado}
          sideOffset={6}
          collisionPadding={8}
          className="z-50 max-w-60 rounded-chip bg-text px-2.5 py-1.5 text-meta font-semibold text-surface shadow-e2 data-[state=delayed-open]:animate-[aparece_var(--dur-fast)_var(--ease-out)]"
        >
          {contenido}
          <T.Arrow className="fill-text" width={10} height={5} />
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
