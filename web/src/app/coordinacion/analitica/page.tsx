import type { Metadata } from "next";
import { PantallaAnalitica } from "@/components/pantallas/PantallaAnalitica";

export const metadata: Metadata = { title: "Analítica · Inscripción de asignaturas" };

export default function Analitica() {
  return <PantallaAnalitica />;
}
