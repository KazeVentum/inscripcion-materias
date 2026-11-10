"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { ConfirmacionExito } from "@/components/estados/ConfirmacionExito";
import { Toast, ToastProvider } from "@/components/ui/Toast";
import { useMediaQuery } from "@/lib/useMediaQuery";

interface Aviso {
  id: number;
  tipo: "inscrita" | "info" | "error";
  texto?: string;
  materia?: string;
  nrc?: string;
  alVerHorario?: () => void;
}

interface Avisos {
  inscrita: (materia: string, nrc: string, alVerHorario?: () => void) => void;
  info: (texto: string) => void;
  error: (texto: string) => void;
}

const Contexto = createContext<Avisos | null>(null);

export function useAvisos(): Avisos {
  const c = useContext(Contexto);
  if (!c) throw new Error("useAvisos fuera de AvisosProvider");
  return c;
}

/**
 * Avisos (toasts). Los errores esperables de una acción se muestran aquí, no en un modal
 * (brief §9). En móvil, dentro de /inscripcion se apoyan sobre la bandeja de acción.
 */
export function AvisosProvider({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const ruta = usePathname();
  const escritorio = useMediaQuery("(min-width: 1024px)");

  const agregar = useCallback((a: Omit<Aviso, "id">) => {
    setAvisos((xs) => [...xs.slice(-2), { ...a, id: Date.now() + Math.random() }]);
  }, []);
  const quitar = (id: number) => setAvisos((xs) => xs.filter((a) => a.id !== id));

  const api = useMemo<Avisos>(
    () => ({
      inscrita: (materia, nrc, alVerHorario) =>
        agregar({ tipo: "inscrita", materia, nrc, ...(alVerHorario ? { alVerHorario } : {}) }),
      info: (texto) => agregar({ tipo: "info", texto }),
      error: (texto) => agregar({ tipo: "error", texto }),
    }),
    [agregar],
  );

  const sobreBandeja = ruta === "/inscripcion" && !escritorio;
  return (
    <Contexto.Provider value={api}>
      <ToastProvider offsetInferior={sobreBandeja ? 104 : 16}>
        {children}
        {avisos.map((a) =>
          a.tipo === "inscrita" && a.materia && a.nrc ? (
            <ConfirmacionExito
              key={a.id}
              materia={a.materia}
              nrc={a.nrc}
              abierto
              onAbiertoChange={(abierto) => !abierto && quitar(a.id)}
              {...(a.alVerHorario ? { onVerHorario: a.alVerHorario } : {})}
            />
          ) : (
            <Toast
              key={a.id}
              tono={a.tipo === "error" ? "error" : "exito"}
              abierto
              onAbiertoChange={(abierto) => !abierto && quitar(a.id)}
              {...(a.tipo === "error" ? { duracion: 8000 } : {})}
            >
              {a.texto}
            </Toast>
          ),
        )}
      </ToastProvider>
    </Contexto.Provider>
  );
}
