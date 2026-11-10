import type { Decorator, Preview } from "@storybook/nextjs-vite";
import { MotionConfig } from "motion/react";
import { useLayoutEffect, type ReactNode } from "react";
import { clasesFuentes } from "../src/app/fuentes";
import { TooltipProvider } from "../src/components/ui/Tooltip";
import "../src/styles/globals.css";

type Tema = "claro" | "oscuro" | "ambos";
const ATTR = { claro: "light", oscuro: "dark" } as const;

function Lienzo({
  tema,
  children,
  relleno,
}: {
  tema: "claro" | "oscuro";
  children: ReactNode;
  relleno: boolean;
}) {
  return (
    <div
      data-theme={ATTR[tema]}
      className="min-w-0 bg-bg text-text"
      style={{ padding: relleno ? 24 : 0, minHeight: relleno ? undefined : "100vh" }}
    >
      {children}
    </div>
  );
}

/**
 * Tema desde la barra: claro, oscuro o ambos lado a lado (por defecto en componentes, así
 * la verificación a11y corre en los dos temas). Las stories con portales (diálogo, toast,
 * tooltip) fijan `parameters.temaUnico`; las composiciones, `parameters.pantalla`.
 */
function RaizTema({ html, children }: { html: "light" | "dark"; children: ReactNode }) {
  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", html);
    document.documentElement.classList.add(...clasesFuentes.split(" "));
    document.documentElement.lang = "es";
  }, [html]);
  return children;
}

const conTema: Decorator = (Story, ctx) => {
  const elegido = (ctx.globals.theme as Tema | undefined) ?? "ambos";
  const pantalla = Boolean(ctx.parameters.pantalla);
  const unico = Boolean(ctx.parameters.temaUnico) || pantalla;
  const tema: Tema = unico && elegido === "ambos" ? "claro" : elegido;
  const html = tema === "oscuro" ? "dark" : "light";

  const relleno = !pantalla;
  if (tema === "ambos") {
    return (
      <RaizTema html={html}>
        <div className="grid grid-cols-1 md:grid-cols-2">
          <Lienzo tema="claro" relleno>
            <Story />
          </Lienzo>
          <Lienzo tema="oscuro" relleno>
            <Story />
          </Lienzo>
        </div>
      </RaizTema>
    );
  }
  return (
    <RaizTema html={html}>
      <Lienzo tema={tema} relleno={relleno}>
        <Story />
      </Lienzo>
    </RaizTema>
  );
};

const conProveedores: Decorator = (Story) => (
  <MotionConfig reducedMotion="user">
    <TooltipProvider delayDuration={300}>
      <Story />
    </TooltipProvider>
  </MotionConfig>
);

const preview: Preview = {
  decorators: [conProveedores, conTema],
  globalTypes: {
    theme: {
      description: "Tema",
      toolbar: {
        title: "Tema",
        icon: "contrast",
        items: [
          { value: "ambos", title: "Claro y oscuro" },
          { value: "claro", title: "Claro", icon: "sun" },
          { value: "oscuro", title: "Oscuro", icon: "moon" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: "ambos" },
  parameters: {
    layout: "fullscreen",
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    backgrounds: { disable: true },
    viewport: {
      options: {
        movil: {
          name: "Móvil 390 × 844",
          styles: { width: "390px", height: "844px" },
          type: "mobile",
        },
        escritorio: {
          name: "Escritorio 1440 × 900",
          styles: { width: "1440px", height: "900px" },
          type: "desktop",
        },
      },
    },
    a11y: {
      // Cualquier violación de axe hace fallar la story en `npm run test:stories`.
      test: "error",
      options: {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
      },
    },
    nextjs: { appDirectory: true },
  },
};

export default preview;
