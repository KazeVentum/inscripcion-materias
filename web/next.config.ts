import type { NextConfig } from "next";

/**
 * Las llamadas del navegador van a /api/v1/* en el mismo origen y Next las reenvía a la API
 * (sin CORS, sin exponer la URL interna). La URL se lee en build (los rewrites de
 * `output: "standalone"` se congelan en routes-manifest): en Docker, http://api:8000.
 */
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://localhost:8000";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  // gzip en el proxy retendría los bytes del SSE hasta llenar un bloque: sin compresión.
  compress: false,
  experimental: {
    // El proxy corta a los 30 s por defecto; el stream de cupos vive hasta que vence la sesión.
    proxyTimeout: 2 * 60 * 60 * 1000,
  },
  async headers() {
    // La CSP (con nonce) la pone proxy.ts; aquí van las cabeceras estáticas.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          // respaldo de frame-ancestors para navegadores viejos
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
  async rewrites() {
    return [{ source: "/api/v1/:path*", destination: `${API_INTERNAL_URL}/api/v1/:path*` }];
  },
};

export default config;
