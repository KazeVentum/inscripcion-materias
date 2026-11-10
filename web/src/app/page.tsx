import { EstadoVacio } from "@/components/estados/EstadoVacio";

/** Marcador de la fase 4: las pantallas del estudiante llegan en la fase 5. */
export default function Inicio() {
  return (
    <main className="mx-auto max-w-[640px] px-4 py-14">
      <p className="m-0 font-head text-compact font-bold text-primary-ink">UNIMINUTO</p>
      <h1 className="mt-2 text-title font-bold tracking-[var(--tracking-title)]">
        Inscripción 2027-1
      </h1>
      <EstadoVacio
        className="mt-6"
        titulo="La pantalla de inscripción llega en la próxima fase."
        texto="El sistema de diseño ya está en Storybook: make storybook y abre localhost:6006."
      />
    </main>
  );
}
