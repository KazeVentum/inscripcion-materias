"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { EstadoError } from "@/components/estados/EstadoError";
import { EstadoVacio } from "@/components/estados/EstadoVacio";
import { ApiError, ErrorRed } from "@/lib/api/cliente";

export interface ConsultaProps<T> {
  query: UseQueryResult<T>;
  /** Forma del contenido mientras carga. */
  esqueleto: ReactNode;
  /** Devuelve el texto de vacío si `data` no tiene nada que mostrar. */
  vacio?: (data: T) => { titulo: string; texto?: string } | null;
  children: (data: T) => ReactNode;
}

/** Estados de una consulta: carga (skeleton), error con reintento, vacío y contenido. */
export function Consulta<T>({ query, esqueleto, vacio, children }: ConsultaProps<T>) {
  if (query.data === undefined) {
    if (query.isError) {
      const red = query.error instanceof ErrorRed;
      const prohibido = query.error instanceof ApiError && query.error.status === 403;
      return (
        <EstadoError
          titulo={
            red
              ? "Sin conexión con el servidor."
              : prohibido
                ? "Tu cuenta no tiene permiso para ver esta sección."
                : "No pudimos cargar esta sección."
          }
          texto={
            red
              ? "No se perdió ningún dato. Reintenta cuando vuelva la conexión."
              : "Los datos del lago no cambiaron. Vuelve a intentarlo."
          }
          onReintentar={() => void query.refetch()}
          reintentando={query.isFetching}
        />
      );
    }
    return (
      <div role="status" aria-busy="true" aria-label="Cargando">
        {esqueleto}
      </div>
    );
  }
  const v = vacio?.(query.data);
  if (v) return <EstadoVacio titulo={v.titulo} {...(v.texto ? { texto: v.texto } : {})} />;
  return <>{children(query.data)}</>;
}
