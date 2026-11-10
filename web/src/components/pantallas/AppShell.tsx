"use client";

import { useQueryClient } from "@tanstack/react-query";
import { BarChart3, CalendarCheck, CalendarDays, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { usePerfil } from "@/lib/api/hooks";
import { cerrarSesion } from "@/lib/api/sesion";
import { cn } from "@/lib/cn";
import { RutaProtegida } from "./RutaProtegida";

const ENLACES = [
  { href: "/inscripcion", texto: "Inscripción", icono: CalendarCheck },
  { href: "/horario", texto: "Mi horario", icono: CalendarDays },
  { href: "/coordinacion/analitica", texto: "Analítica", icono: BarChart3 },
] as const;

export interface AppShellProps {
  children: ReactNode;
  /** Indicador de cupos en vivo (solo /inscripcion). */
  estado?: ReactNode;
  /** Franja bajo el encabezado (sin conexión). */
  franja?: ReactNode;
  /** Escritorio: ocupa el alto de la ventana y el contenido gestiona su scroll. */
  ajustado?: boolean;
}

/** Encabezado, navegación y guardia de sesión comunes a las pantallas autenticadas. */
export function AppShell({ children, estado, franja, ajustado = false }: AppShellProps) {
  return (
    <RutaProtegida>
      <div className={cn("min-h-dvh bg-bg text-text", ajustado && "lg:flex lg:h-dvh lg:flex-col")}>
        <Encabezado estado={estado} />
        {franja}
        {children}
      </div>
    </RutaProtegida>
  );
}

function Encabezado({ estado }: { estado: ReactNode }) {
  const perfil = usePerfil();
  const ruta = usePathname();
  const router = useRouter();
  const qc = useQueryClient();

  const salir = () => {
    cerrarSesion();
    qc.clear();
    router.replace("/login");
  };

  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 pb-1 lg:flex-nowrap lg:gap-x-6 lg:border-b lg:border-border lg:bg-surface lg:px-8 lg:py-2">
      <div className="min-w-0 flex-1 lg:flex-none">
        <p className="m-0 font-head text-compact font-bold tracking-[0.01em] text-primary-ink">
          UNIMINUTO
        </p>
        <p className="m-0 truncate text-meta text-text-3 tabular">
          {perfil.data ? `${perfil.data.nombre}, 2027-1` : "Inscripción 2027-1"}
        </p>
      </div>

      <nav
        aria-label="Principal"
        className="order-last -mx-1 flex w-full gap-1 overflow-x-auto pb-1 lg:order-none lg:mx-0 lg:w-auto lg:flex-1 lg:overflow-visible lg:pb-0"
      >
        {ENLACES.map(({ href, texto, icono: Icono }) => {
          const activo = ruta === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={activo ? "page" : undefined}
              className={cn(
                "inline-flex h-11 shrink-0 items-center gap-2 rounded-control px-3 text-compact font-semibold",
                activo
                  ? "bg-primary-soft text-primary-ink"
                  : "text-text-2 hover:bg-surface-2 hover:text-text",
              )}
            >
              <Icono aria-hidden="true" className="size-[18px]" />
              {texto}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-1">
        {estado}
        <ThemeToggle />
        <IconButton etiqueta="Cerrar sesión" icono={<LogOut />} onClick={salir} />
      </div>
    </header>
  );
}
