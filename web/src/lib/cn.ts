import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["title", "section", "subject", "body", "compact", "meta", "block", "seats"] },
      ],
    },
  },
});

export function cn(...entradas: ClassValue[]): string {
  return twMerge(clsx(entradas));
}
