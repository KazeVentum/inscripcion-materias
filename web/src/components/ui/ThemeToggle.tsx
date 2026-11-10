"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { IconButton } from "./IconButton";

export type PreferenciaTema = "sistema" | "claro" | "oscuro";
const ORDEN: PreferenciaTema[] = ["sistema", "claro", "oscuro"];
const CLAVE = "tema";
const ATRIBUTO: Record<PreferenciaTema, "light" | "dark" | null> = {
  sistema: null,
  claro: "light",
  oscuro: "dark",
};
const NOMBRE: Record<PreferenciaTema, string> = {
  sistema: "el del sistema",
  claro: "claro",
  oscuro: "oscuro",
};

function leer(): PreferenciaTema {
  try {
    const v = localStorage.getItem(CLAVE);
    return v === "claro" || v === "oscuro" ? v : "sistema";
  } catch {
    return "sistema";
  }
}

const EVENTO = "tema-cambio";
function suscribir(avisar: () => void) {
  window.addEventListener("storage", avisar);
  window.addEventListener(EVENTO, avisar);
  return () => {
    window.removeEventListener("storage", avisar);
    window.removeEventListener(EVENTO, avisar);
  };
}

export function aplicarTema(pref: PreferenciaTema) {
  const attr = ATRIBUTO[pref];
  if (attr) document.documentElement.setAttribute("data-theme", attr);
  else document.documentElement.removeAttribute("data-theme");
}

/** Script para <head>: aplica el tema guardado antes de pintar (sin parpadeo). */
export const SCRIPT_TEMA = `try{var t=localStorage.getItem("${CLAVE}");if(t==="claro")document.documentElement.setAttribute("data-theme","light");else if(t==="oscuro")document.documentElement.setAttribute("data-theme","dark")}catch(e){}`;

export interface ThemeToggleProps {
  /** Controlado (stories). Sin él, lee y guarda en localStorage. */
  valor?: PreferenciaTema;
  onCambio?: (v: PreferenciaTema) => void;
}

/** Alterna sistema → claro → oscuro. El nombre accesible dice el tema actual y el siguiente. */
export function ThemeToggle({ valor, onCambio }: ThemeToggleProps) {
  const guardado = useSyncExternalStore(suscribir, leer, () => "sistema" as const);
  const actual = valor ?? guardado;

  const siguiente = ORDEN[(ORDEN.indexOf(actual) + 1) % ORDEN.length] ?? "sistema";
  const icono = actual === "oscuro" ? <Moon /> : actual === "claro" ? <Sun /> : <Monitor />;

  return (
    <IconButton
      etiqueta={`Tema: ${NOMBRE[actual]}. Cambiar a ${NOMBRE[siguiente]}`}
      icono={icono}
      onClick={() => {
        if (valor === undefined) {
          try {
            localStorage.setItem(CLAVE, siguiente);
          } catch {
            /* almacenamiento bloqueado: el tema vale solo para esta visita */
          }
          aplicarTema(siguiente);
          window.dispatchEvent(new Event(EVENTO));
        }
        onCambio?.(siguiente);
      }}
    />
  );
}
