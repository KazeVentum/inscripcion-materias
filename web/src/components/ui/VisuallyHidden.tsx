import type { HTMLAttributes } from "react";

/** Texto solo para lectores de pantalla. */
export function VisuallyHidden(props: HTMLAttributes<HTMLSpanElement>) {
  return <span className="sr-only" {...props} />;
}
