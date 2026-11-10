import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import storybook from "eslint-plugin-storybook";
import prettier from "eslint-config-prettier/flat";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  ...storybook.configs["flat/recommended"],
  prettier,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/#[0-9a-fA-F]{6}\\b/]",
          message: "Los colores salen de tokens.css (var(--…)), no de literales.",
        },
      ],
    },
  },
  {
    // theme-color de <meta> no acepta var(--…): layout.tsx repite --bg de cada tema.
    files: ["src/styles/**", "**/*.test.ts", "scripts/**", "src/app/layout.tsx"],
    rules: { "no-restricted-syntax": "off" },
  },
  globalIgnores([
    ".next/**",
    "storybook-static/**",
    "node_modules/**",
    "next-env.d.ts",
    "!.storybook",
  ]),
]);
