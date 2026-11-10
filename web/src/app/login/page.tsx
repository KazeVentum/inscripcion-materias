import type { Metadata } from "next";
import { Suspense } from "react";
import { PantallaLogin } from "@/components/pantallas/PantallaLogin";

export const metadata: Metadata = { title: "Entrar · Inscripción de asignaturas" };

export default function Login() {
  // useSearchParams exige Suspense en el render estático.
  return (
    <Suspense>
      <PantallaLogin />
    </Suspense>
  );
}
