"use client";

import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { crearQueryClient } from "@/lib/api/consultas";
import { useSesion } from "@/lib/api/sesion";
import { AvisosProvider } from "./Avisos";

/**
 * Vacía la caché en toda transición de sesión (login, cierre, 401, vencimiento, otro
 * estudiante en la misma pestaña): nada de un estudiante queda a la vista del siguiente.
 */
export function useLimpiarCachePorSesion(): void {
  const qc = useQueryClient();
  const estudiante = useSesion()?.estudianteId ?? null;
  const previo = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (previo.current !== undefined && previo.current !== estudiante) qc.clear();
    previo.current = estudiante;
  }, [estudiante, qc]);
}

function LimpiaCache() {
  useLimpiarCachePorSesion();
  return null;
}

/** TanStack Query, avisos y movimiento (respeta prefers-reduced-motion en todo Motion). */
export function Proveedores({ children }: { children: ReactNode }) {
  const [cliente] = useState(crearQueryClient);
  return (
    <QueryClientProvider client={cliente}>
      <LimpiaCache />
      <MotionConfig reducedMotion="user">
        <AvisosProvider>{children}</AvisosProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
