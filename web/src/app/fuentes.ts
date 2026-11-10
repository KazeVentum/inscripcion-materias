import { Montserrat, Open_Sans } from "next/font/google";

/** Titulares, nombre de materia y cifra de cupos (600/700). */
export const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
  variable: "--font-montserrat",
});

/** Texto. Variable con eje de ancho: el calendario usa font-stretch 87.5 %. */
export const openSans = Open_Sans({
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
  variable: "--font-open-sans",
});

export const clasesFuentes = `${montserrat.variable} ${openSans.variable}`;
