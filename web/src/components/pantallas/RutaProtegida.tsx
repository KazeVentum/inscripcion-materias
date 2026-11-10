"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSesion } from "@/lib/api/sesion";

/**
 * Solo muestra a sus hijos con sesión vigente. Sin ella manda a /login conservando adónde
 * iba; si la sesión se pierde con la pantalla abierta (401, vencida), avisa el motivo.
 */
export function RutaProtegida({ children }: { children: ReactNode }) {
  const sesion = useSesion();
  const router = useRouter();
  const ruta = usePathname();
  const tuvoSesion = useRef(false);

  useEffect(() => {
    if (sesion) tuvoSesion.current = true;
    if (sesion === null) {
      const q = new URLSearchParams({ siguiente: ruta });
      if (tuvoSesion.current) q.set("motivo", "expirada");
      router.replace(`/login?${q.toString()}`);
    }
  }, [sesion, router, ruta]);

  if (!sesion) {
    return (
      <div role="status" aria-label="Cargando" className="grid gap-4 p-6">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-40 w-full max-w-[640px]" />
      </div>
    );
  }
  return <>{children}</>;
}
