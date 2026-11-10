import { NextResponse, type NextRequest } from "next/server";

/**
 * CSP con nonce por petición (Next 16: `proxy.ts` reemplaza a `middleware.ts`).
 * Next añade scripts en línea propios (hidratación) cuyo contenido cambia en cada página, así
 * que un hash fijo no sirve: con nonce, Next lo aplica solo a los suyos y el layout lo pone
 * en el script del tema. El resto de cabeceras de seguridad estáticas viven en next.config.ts.
 */
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Next y Motion escriben atributos style en el HTML: sin 'unsafe-inline' no se pintaría
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Páginas solamente: ni la API reenviada, ni estáticos, ni imágenes.
  matcher: [
    {
      source: "/((?!api/|_next/static|_next/image|favicon.ico|logo-uniminuto.png).*)",
      missing: [{ type: "header", key: "next-router-prefetch" }],
    },
  ],
};
