"use client";

import { Hourglass, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { MAX_SILLAS, anuncioUmbral, nivelCupos, textoCupos, type NivelCupos } from "@/lib/cupos";

export interface BarraCuposProps {
  libres: number;
  total: number;
  /** NRC, para el anuncio del lector de pantalla ("Queda el último cupo en 80852"). */
  nrc: string;
  /** Sin conexión: el dato puede estar viejo; se atenúa. */
  atenuada?: boolean;
  /** "compacta" en tarjetas; "destacada" muestra la cifra grande (Montserrat 700). */
  variante?: "compacta" | "destacada";
  className?: string;
}

const COLOR_TEXTO: Record<NivelCupos, string> = {
  holgado: "text-text",
  pocos: "text-warning",
  ultimo: "text-danger",
  agotado: "text-text-2",
};

/**
 * Barra de cupos en vivo (elemento firma). Una silla por cupo: ocupadas a la izquierda,
 * libres a la derecha. El texto cambia de forma en cada umbral; el color solo refuerza.
 * aria-live anuncia solo umbrales (quedan pocos, último, agotado), nunca cada cambio.
 */
export function BarraCupos({
  libres: libresProp,
  total,
  nrc,
  atenuada = false,
  variante = "compacta",
  className,
}: BarraCuposProps) {
  const libres = Math.max(0, Math.min(libresProp, total));
  const nivel = nivelCupos(libres, total);
  const anterior = useRef<number | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const [cambio, setCambio] = useState<{ n: number; recien: number | null }>({
    n: 0,
    recien: null,
  });

  useEffect(() => {
    const antes = anterior.current;
    anterior.current = libres;
    if (antes === null || antes === libres) return;
    const msg = anuncioUmbral(antes, libres, total, nrc);
    if (msg) setAnuncio(msg);
    // La silla que se ocupó es la primera libre de antes (índice total - antes).
    setCambio((c) => ({ n: c.n + 1, recien: libres < antes ? total - antes : null }));
    const t = window.setTimeout(() => setCambio((c) => ({ ...c, recien: null })), 2000);
    return () => window.clearTimeout(t);
  }, [libres, total, nrc]);

  const icono =
    nivel === "pocos" ? (
      <Hourglass aria-hidden="true" className="size-3.5 shrink-0" />
    ) : nivel === "ultimo" ? (
      <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
    ) : null;

  const continua = total > MAX_SILLAS;
  const destacada = variante === "destacada";

  return (
    <div className={cn("min-w-0", className)} data-atenuada={atenuada}>
      <div
        className={cn(
          "mb-1.5 flex items-center gap-1.5 font-semibold tabular",
          destacada ? "text-compact" : "text-[13px] leading-[18px]",
          // Sin conexión el dato puede ser viejo: el texto pierde el color de urgencia
          // (sin bajar contraste) y las sillas se atenúan.
          atenuada ? "text-text-2" : COLOR_TEXTO[nivel],
        )}
      >
        {icono}
        {destacada && nivel !== "agotado" && nivel !== "ultimo" ? (
          <span>
            <span
              key={cambio.n}
              className={cn(
                "inline-block px-0.5 font-head text-seats font-bold tabular",
                cambio.n > 0 && "cifra-cambio",
              )}
            >
              {libres}
            </span>{" "}
            <span className="font-normal text-text-2">de {total} libres</span>
          </span>
        ) : (
          <span key={cambio.n} className={cn("-mx-0.5 px-0.5", cambio.n > 0 && "cifra-cambio")}>
            {textoCupos(libres, total)}
          </span>
        )}
      </div>

      {continua ? (
        <div
          role="img"
          aria-label={`${libres} de ${total} cupos libres`}
          className={cn("barra-continua", destacada ? "h-3" : "h-2.5", atenuada && "opacity-50")}
          style={{ ["--paso-marca" as string]: `${(5 / total) * 100}%` }}
        >
          <span className="relleno" style={{ width: `${(libres / total) * 100}%` }} />
          <span className="marcas" />
        </div>
      ) : (
        <div
          role="img"
          aria-label={`${libres} de ${total} cupos libres`}
          className={cn("flex gap-0.5", destacada ? "h-3" : "h-2.5", atenuada && "opacity-50")}
        >
          {Array.from({ length: total }, (_, i) => {
            const libre = i >= total - libres;
            return (
              <span
                key={i}
                className="silla"
                data-libre={libre}
                data-ultima={nivel === "ultimo" && libre}
                data-agotada={nivel === "agotado"}
                data-recien={cambio.recien === i}
              />
            );
          })}
        </div>
      )}

      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {anuncio}
      </span>
    </div>
  );
}
