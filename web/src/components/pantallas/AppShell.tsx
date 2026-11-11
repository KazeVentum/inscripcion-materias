"use client";

import { useQueryClient } from "@tanstack/react-query";
import { BarChart3, CalendarCheck, CalendarDays, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { usePerfil, usePerfilCoordinador } from "@/lib/api/hooks";
import { cerrarSesion } from "@/lib/api/sesion";
import { cn } from "@/lib/cn";
import { ventanaJornada } from "@/lib/horario";
import type { Rol } from "@/lib/tipos";
import { RutaProtegida } from "./RutaProtegida";

const ENLACES = [
  { href: "/inscripcion", texto: "Inscripción", icono: CalendarCheck },
  { href: "/horario", texto: "Mi horario", icono: CalendarDays },
] as const;

/** El enlace de analítica solo existe en la cabecera del coordinador. */
const ENLACES_COORDINACION = [
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
  /** Rol que puede ver la pantalla; con otro rol se redirige a su inicio. */
  rol?: Rol;
}

/** Encabezado, navegación y guardia de sesión comunes a las pantallas autenticadas. */
export function AppShell({
  children,
  estado,
  franja,
  ajustado = false,
  rol = "estudiante",
}: AppShellProps) {
  return (
    <RutaProtegida rol={rol}>
      <div className={cn("min-h-dvh bg-bg text-text", ajustado && "lg:flex lg:h-dvh lg:flex-col")}>
        {rol === "coordinador" ? <EncabezadoCoordinacion /> : <Encabezado estado={estado} />}
        {franja}
        {children}
      </div>
    </RutaProtegida>
  );
}

function useSalir() {
  const router = useRouter();
  const qc = useQueryClient();
  return () => {
    cerrarSesion();
    qc.clear();
    router.replace("/login");
  };
}

/** Cabecera propia de coordinación: sin cupos en vivo ni jornada de estudiante. */
function EncabezadoCoordinacion() {
  const perfil = usePerfilCoordinador();
  const ruta = usePathname();
  const salir = useSalir();
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 pb-1 lg:flex-nowrap lg:gap-x-6 lg:border-b lg:border-border lg:bg-surface lg:px-8 lg:py-2">
      <div className="min-w-0 flex-1 lg:flex-none">
        <p className="m-0 font-head text-compact font-bold tracking-[0.01em] text-primary-ink">
          UNIMINUTO
        </p>
        <p className="m-0 text-meta text-text-3">
          {perfil.data ? `${perfil.data.nombre} · ` : ""}
          Coordinación · Ingeniería de Sistemas
        </p>
      </div>
      <nav
        aria-label="Principal"
        className="order-last -mx-1 flex w-full gap-1 overflow-x-auto pb-1 lg:order-none lg:mx-0 lg:w-auto lg:flex-1 lg:overflow-visible lg:pb-0"
      >
        {ENLACES_COORDINACION.map(({ href, texto, icono: Icono }) => (
          <Link
            key={href}
            href={href}
            aria-current={ruta === href ? "page" : undefined}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-control bg-primary-soft px-3 text-compact font-semibold text-primary-ink"
          >
            <Icono aria-hidden="true" className="size-[18px]" />
            {texto}
          </Link>
        ))}
      </nav>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <IconButton etiqueta="Cerrar sesión" icono={<LogOut />} onClick={salir} />
      </div>
    </header>
  );
}

function Encabezado({ estado }: { estado: ReactNode }) {
  const perfil = usePerfil();
  const ruta = usePathname();
  const salir = useSalir();

  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 pb-1 lg:flex-nowrap lg:gap-x-6 lg:border-b lg:border-border lg:bg-surface lg:px-8 lg:py-2">
      <div className="min-w-0 flex-1 lg:flex-none">
        <p className="m-0 font-head text-compact font-bold tracking-[0.01em] text-primary-ink">
          UNIMINUTO
        </p>
        <p
          className="m-0 whitespace-nowrap text-meta text-text-3 tabular"
          {...(perfil.data ? { title: perfil.data.nombre } : {})}
        >
          {perfil.data ? (
            // Una sola línea en 390 px: en móvil "Jornada" queda solo para lectores de
            // pantalla y se ve "Noche · 18:00–22:00"; en escritorio se ve completo.
            <>
              <span className="max-lg:sr-only">Jornada </span>
              <span className="max-lg:capitalize">{perfil.data.jornada}</span>
              {` · ${ventanaJornada(perfil.data.jornada)}`}
            </>
          ) : (
            "Inscripción 2027-1"
          )}
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
