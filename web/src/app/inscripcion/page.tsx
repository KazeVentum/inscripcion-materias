import type { Metadata } from "next";
import { PantallaInscripcion } from "@/components/pantallas/PantallaInscripcion";

export const metadata: Metadata = { title: "Inscripción · Inscripción de asignaturas" };

export default function Inscripcion() {
  return <PantallaInscripcion />;
}
