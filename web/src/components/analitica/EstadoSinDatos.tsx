import { BarChart3 } from "lucide-react";
import { EstadoVacio } from "@/components/estados/EstadoVacio";

const COMANDO =
  "rounded-chip bg-surface-2 px-2 py-0.5 font-[ui-monospace,SFMono-Regular,Menlo,monospace] text-compact text-text";

/** Vacío de la analítica: la capa oro aún no se calcula. Explica cómo generar datos. */
export function EstadoSinDatos() {
  return (
    <div className="rounded-card border border-border bg-surface p-6 lg:p-8">
      <EstadoVacio
        icono={<BarChart3 />}
        titulo="Aún no hay datos en la capa oro."
        texto="La analítica se calcula con los intentos de inscripción que procesa el lago de datos. Para generarlos:"
        accion={
          <ol className="m-0 grid list-decimal gap-2 pl-5 text-compact text-text">
            <li>
              Simula tráfico real contra la API con <code className={COMANDO}>make simular</code>.
            </li>
            <li>
              Calcula bronce, plata y oro con <code className={COMANDO}>make lake</code>.
            </li>
            <li>Vuelve a esta página: se actualiza sola cada minuto.</li>
          </ol>
        }
      />
    </div>
  );
}
