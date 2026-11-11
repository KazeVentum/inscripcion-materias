import { ChevronDown } from "lucide-react";
import { useId, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface SelectorProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  etiqueta: string;
  opciones: readonly { valor: string; texto: string }[];
}

/** Selector nativo (teclado y móvil gratis): etiqueta visible, 44 px, borde de control. */
export function Selector({ etiqueta, opciones, className, ...rest }: SelectorProps) {
  const id = useId();
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={id} className="mb-1 block text-meta font-semibold text-text-2">
        {etiqueta}
      </label>
      <div className="relative">
        <select
          id={id}
          className="h-11 w-full appearance-none truncate rounded-control border border-border-strong bg-surface pr-9 pl-3 text-compact text-text"
          {...rest}
        >
          {opciones.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.texto}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-text-2"
        />
      </div>
    </div>
  );
}
