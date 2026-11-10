import { BarChart3 } from "lucide-react";
import Link from "next/link";
import { AppShell } from "./AppShell";
import { EstadoVacio } from "@/components/estados/EstadoVacio";

/**
 * Analítica de coordinación (HU5). En la fase 6 leerá la capa oro; por ahora solo el estado
 * vacío del brief (una frase y una acción).
 */
export function PantallaAnalitica() {
  return (
    <AppShell>
      <main className="mx-auto max-w-[960px] px-4 pt-6 pb-16 lg:px-8 lg:pt-10">
        <h1 className="text-title font-bold tracking-[var(--tracking-title)]">
          Analítica de coordinación
        </h1>
        <p className="m-0 mt-2 text-compact text-text-2 measure">
          Demanda histórica por NRC y ocupación por franja, para planear la oferta.
        </p>
        <section
          aria-label="Estado de la analítica"
          className="mt-8 rounded-card border border-border bg-surface p-6 lg:p-8"
        >
          <EstadoVacio
            icono={<BarChart3 />}
            titulo="Aún no hay datos de demanda."
            texto="Los datos llegarán en la fase 6, cuando el lago de datos procese los intentos de inscripción."
            accion={
              <Link
                href="/inscripcion"
                className="inline-flex h-11 items-center rounded-control px-4 text-compact font-semibold text-primary-ink shadow-[inset_0_0_0_1px_var(--border-strong)] hover:bg-primary-soft"
              >
                Ir a la inscripción
              </Link>
            }
          />
        </section>
      </main>
    </AppShell>
  );
}
