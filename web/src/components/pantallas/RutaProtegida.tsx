"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { useSesion } from "@/lib/api/sesion";
import { rutaInicial } from "@/lib/destino";
import type { Rol } from "@/lib/tipos";

/**
 * Solo muestra a sus hijos con sesión vigente. Sin ella manda a /login conservando adónde
 * iba; si la sesión se pierde con la pantalla abierta (401, vencida), avisa el motivo.
 * Con sesión de otro rol manda a la pantalla de inicio de ese rol sin pintar los hijos, así
 * no se llaman endpoints que responderían 403.
 */
export function RutaProtegida({
  children,
  rol = "estudiante",
}: {
  children: ReactNode;
  rol?: Rol;
}) {
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
    } else if (sesion && sesion.rol !== rol) router.replace(rutaInicial(sesion.rol));
  }, [sesion, router, ruta, rol]);

  if (!sesion || sesion.rol !== rol) {
    return (
      <main className="grid gap-4 p-6" aria-busy="true">
        <p role="status" className="sr-only">
          Cargando
        </p>
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-40 w-full max-w-[640px]" />
      </main>
    );
  }
  return <>{children}</>;
}
