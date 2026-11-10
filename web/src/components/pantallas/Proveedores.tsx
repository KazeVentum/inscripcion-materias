"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useState, type ReactNode } from "react";
import { crearQueryClient } from "@/lib/api/consultas";
import { AvisosProvider } from "./Avisos";

/** TanStack Query, avisos y movimiento (respeta prefers-reduced-motion en todo Motion). */
export function Proveedores({ children }: { children: ReactNode }) {
  const [cliente] = useState(crearQueryClient);
  return (
    <QueryClientProvider client={cliente}>
      <MotionConfig reducedMotion="user">
        <AvisosProvider>{children}</AvisosProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
