import { redirect } from "next/navigation";

/** La primera pantalla tras el login es la inscripción; sin sesión, RutaProtegida manda a /login. */
export default function Inicio() {
  redirect("/inscripcion");
}
