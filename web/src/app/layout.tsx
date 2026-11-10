import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Proveedores } from "@/components/pantallas/Proveedores";
import { SCRIPT_TEMA } from "@/components/ui/ThemeToggle";
import "@/styles/globals.css";
import { clasesFuentes } from "./fuentes";

export const metadata: Metadata = {
  title: "Inscripción de asignaturas",
  description: "Inscribe tus materias de 2027-1 con cupos y horarios en vivo.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f5f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0f1d" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={clasesFuentes} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>
        <Proveedores>{children}</Proveedores>
      </body>
    </html>
  );
}
