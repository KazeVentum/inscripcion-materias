import * as a11yAnnotations from "@storybook/addon-a11y/preview";
import { setProjectAnnotations } from "@storybook/nextjs-vite";
import { MotionGlobalConfig } from "motion/react";
import * as projectAnnotations from "./preview";

// En pruebas no se espera a las animaciones: axe mide contraste sobre el estado final.
MotionGlobalConfig.skipAnimations = true;
const sinAnimacion = document.createElement("style");
sinAnimacion.textContent =
  "*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;transition-duration:0s!important}";
document.head.appendChild(sinAnimacion);

setProjectAnnotations([a11yAnnotations, projectAnnotations]);
