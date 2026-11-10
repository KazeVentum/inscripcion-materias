import type { Metadata } from "next";
import { PantallaHorario } from "@/components/pantallas/PantallaHorario";

export const metadata: Metadata = { title: "Mi horario · Inscripción de asignaturas" };

export default function Horario() {
  return <PantallaHorario />;
}
