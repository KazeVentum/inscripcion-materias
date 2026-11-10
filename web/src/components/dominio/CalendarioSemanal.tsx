"use client";

import { Maximize2 } from "lucide-react";
import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { HORA_FIN, HORA_INICIO, diaLargo, minutos } from "@/lib/horario";
import { DIAS, type BloqueCalendarioDatos, type Dia } from "@/lib/tipos";
import { BloqueCalendario } from "./BloqueCalendario";

export interface CalendarioSemanalProps {
  bloques: readonly BloqueCalendarioDatos[];
  /** "compacta": móvil, 07–22 en ~180 px. "completa": escritorio, 64 px por hora con scroll. */
  variante?: "compacta" | "completa";
  titulo?: string;
  /** Texto a la derecha del título ("6 créditos inscritos"). */
  resumen?: ReactNode;
  pxPorHora?: number;
  /** Completa: alto del área con scroll (px). */
  altoVisible?: number;
  /** Completa: hora a la que se desplaza al montar. */
  scrollInicial?: string;
  leyenda?: boolean;
  /** Compacta: abre la semana completa (pestaña "Semana"). */
  onExpandir?: () => void;
  ahora?: number;
  className?: string;
}

type Colocado = BloqueCalendarioDatos & { carril: number; carriles: number };

/** Reparte en carriles los bloques que se solapan (un cruce se ve lado a lado). */
function colocar(bloques: readonly BloqueCalendarioDatos[]): Colocado[] {
  const orden = [...bloques].sort((a, b) => minutos(a.inicio) - minutos(b.inicio));
  const salida: Colocado[] = [];
  let grupo: Colocado[] = [];
  let finGrupo = -1;
  const cerrar = () => {
    const n = Math.max(1, ...grupo.map((g) => g.carril + 1));
    grupo.forEach((g) => (g.carriles = n));
    salida.push(...grupo);
    grupo = [];
  };
  for (const b of orden) {
    const ini = minutos(b.inicio);
    if (grupo.length && ini >= finGrupo) cerrar();
    const ocupados = new Set(grupo.filter((g) => minutos(g.fin) > ini).map((g) => g.carril));
    let carril = 0;
    while (ocupados.has(carril)) carril++;
    grupo.push({ ...b, carril, carriles: 1 });
    finGrupo = Math.max(finGrupo, minutos(b.fin));
  }
  if (grupo.length) cerrar();
  return salida;
}

const LEYENDA = [
  {
    texto: "Inscrita",
    muestra: "bg-[var(--block-enrolled-bg)] shadow-[inset_3px_0_0_var(--block-enrolled-edge)]",
  },
  {
    texto: "Vista previa",
    muestra:
      "bg-primary-soft outline-[1.5px] outline-dashed outline-primary-ink -outline-offset-[1.5px]",
  },
  { texto: "Reservada", muestra: "bg-accent-soft shadow-[inset_3px_0_0_var(--accent)]" },
];

/**
 * Semana LUN–SAB, 07:00–22:00. La franja 18–22 y la mañana del sábado van en
 * --surface-2: ahí vive la mayoría de clases. Recibe los bloques por props.
 */
export function CalendarioSemanal({
  bloques,
  variante = "compacta",
  titulo = "Tu semana",
  resumen,
  pxPorHora,
  altoVisible = 640,
  scrollInicial = "17:30",
  leyenda,
  onExpandir,
  ahora,
  className,
}: CalendarioSemanalProps) {
  const compacta = variante === "compacta";
  const px = pxPorHora ?? (compacta ? 12 : 64);
  const alto = (HORA_FIN - HORA_INICIO) * px;
  const y = (hm: string) => ((minutos(hm) - HORA_INICIO * 60) / 60) * px;
  const idTitulo = useId();
  const scrollRef = useRef<HTMLDivElement>(null);
  const conLeyenda = leyenda ?? compacta;

  useEffect(() => {
    if (compacta || !scrollRef.current) return;
    scrollRef.current.scrollTop = Math.max(0, y(scrollInicial) - 8);
    // Solo al montar o si cambia la escala.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compacta, px, scrollInicial]);

  const porDia = new Map<Dia, Colocado[]>(DIAS.map((d) => [d, []]));
  for (const b of bloques) porDia.get(b.dia)?.push(b as Colocado);
  for (const d of DIAS) porDia.set(d, colocar(porDia.get(d) ?? []));

  const horasEje = compacta
    ? [7, 12, 18, 22]
    : Array.from({ length: HORA_FIN - HORA_INICIO + 1 }, (_, i) => HORA_INICIO + i);

  const varsColumna = {
    "--cal-px-hora": `${px}px`,
    "--cal-noche-top": `${y("18:00")}px`,
    "--cal-noche-h": `${alto - y("18:00")}px`,
    "--cal-manana-h": `${y("12:00")}px`,
    ...(compacta
      ? {}
      : { "--cal-lineas": "linear-gradient(to bottom, var(--border) 0 1px, transparent 1px)" }),
    height: `${alto}px`,
  } as CSSProperties;

  const ejeAncho = compacta ? 22 : 44;
  const columnas = `${ejeAncho}px repeat(6, minmax(0, 1fr))`;

  const cabecera = (
    <div
      aria-hidden="true"
      className={cn(
        "grid gap-x-1",
        compacta ? "pb-1" : "sticky top-0 z-10 gap-x-1.5 bg-surface pt-1 pb-2",
      )}
      style={{ gridTemplateColumns: columnas }}
    >
      <span />
      {DIAS.map((d) => (
        <span
          key={d}
          className={cn(
            "text-center font-semibold text-text-3 stretch-calendar",
            compacta ? "text-[11px] leading-[14px]" : "text-meta",
          )}
        >
          {d}
        </span>
      ))}
    </div>
  );

  const rejilla = (
    <div
      className={cn("grid", compacta ? "gap-x-1" : "gap-x-1.5")}
      style={{ gridTemplateColumns: columnas }}
    >
      <div aria-hidden="true" className="relative" style={{ height: alto }}>
        {horasEje.map((h) => (
          <span
            key={h}
            className={cn(
              "absolute right-1 -translate-y-1/2 font-semibold text-text-3 stretch-calendar tabular",
              compacta ? "text-[10px] leading-[10px]" : "text-meta",
              !compacta && h === HORA_INICIO && "translate-y-0",
            )}
            style={{ top: (h - HORA_INICIO) * px }}
          >
            {compacta ? String(h).padStart(2, "0") : `${String(h).padStart(2, "0")}:00`}
          </span>
        ))}
      </div>
      {DIAS.map((d) => (
        <ul
          key={d}
          aria-label={diaLargo(d)}
          data-sabado={d === "SAB"}
          className={cn("cal-columna m-0 p-0", compacta ? "rounded-[4px]" : "rounded-chip")}
          style={varsColumna}
        >
          {(porDia.get(d) ?? []).map((b) => {
            const top = y(b.inicio);
            const h = Math.max(y(b.fin) - top, compacta ? 12 : 20);
            const ancho = 100 / b.carriles;
            return (
              <BloqueCalendario
                key={b.id}
                bloque={b}
                variante={compacta ? "compacto" : "completo"}
                {...(ahora !== undefined ? { ahora } : {})}
                className="absolute"
                style={{
                  top,
                  height: h,
                  left: `calc(${ancho * b.carril}% + 2px)`,
                  width: `calc(${ancho}% - 4px)`,
                }}
              />
            );
          })}
        </ul>
      ))}
    </div>
  );

  return (
    <section
      aria-labelledby={idTitulo}
      className={cn(
        "rounded-card border border-border bg-surface shadow-[var(--shadow-1),var(--edge)]",
        compacta ? "px-3 pt-3 pb-2.5" : "p-4",
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2
          id={idTitulo}
          className={cn("font-semibold", compacta ? "text-subject" : "text-section")}
        >
          {titulo}
        </h2>
        <div className="flex items-center gap-1">
          {resumen ? (
            <span className="text-meta font-semibold text-text-2 tabular">{resumen}</span>
          ) : null}
          {compacta && onExpandir ? (
            <button
              type="button"
              onClick={onExpandir}
              aria-label="Ver semana completa"
              className="-my-2 -mr-2 grid size-11 place-items-center rounded-control text-text-2 hover:bg-surface-2"
            >
              <Maximize2 aria-hidden="true" className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      {compacta ? (
        <>
          {cabecera}
          {rejilla}
        </>
      ) : (
        <div
          ref={scrollRef}
          tabIndex={0}
          role="region"
          aria-label="Semana completa, desplazable"
          className="-mx-1 overflow-y-auto px-1"
          style={{ maxHeight: altoVisible }}
        >
          {cabecera}
          <div className="pt-1.5 pb-2">{rejilla}</div>
        </div>
      )}

      {conLeyenda ? (
        <ul className="m-0 mt-2.5 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-meta text-text-2">
          {LEYENDA.map((l) => (
            <li key={l.texto} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={cn("inline-block h-2.5 w-3 rounded-[3px]", l.muestra)}
              />
              {l.texto}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
