"use client";

import { LogIn } from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { EstadoError } from "@/components/estados/EstadoError";
import { Button } from "@/components/ui/Button";
import { Campo } from "@/components/ui/Campo";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { ApiError, ErrorRed, api } from "@/lib/api/cliente";
import { guardarSesion, useSesion } from "@/lib/api/sesion";
import { useAhora } from "@/lib/useAhora";

const DEMOS = [
  { id: "est-000001", nota: "1.er semestre" },
  { id: "est-000002", nota: "clase MAR/JUE 20:30" },
  { id: "est-000003", nota: "6.º semestre" },
  { id: "est-000004", nota: "9.º, habilitada para práctica" },
  { id: "est-000005", nota: "con rezago" },
] as const;

/** Solo rutas internas: evita redirigir a otro sitio con ?siguiente=. */
function destinoSeguro(siguiente: string | null): string {
  return siguiente && /^\/(?!\/)/.test(siguiente) ? siguiente : "/inscripcion";
}

export function PantallaLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const sesion = useSesion();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorCredenciales, setErrorCredenciales] = useState<string | null>(null);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [bloqueadoHasta, setBloqueadoHasta] = useState(0);
  const ahora = useAhora(1000);
  const destino = destinoSeguro(params.get("siguiente"));

  useEffect(() => {
    if (sesion) router.replace(destino);
  }, [sesion, router, destino]);

  const espera = Math.max(0, Math.ceil((bloqueadoHasta - ahora) / 1000));

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (enviando || espera > 0) return;
    setEnviando(true);
    setErrorCredenciales(null);
    setErrorGeneral(null);
    try {
      const r = await api.login({ usuario: usuario.trim(), password });
      guardarSesion({
        token: r.accessToken,
        estudianteId: r.estudianteId,
        expiraEn: Date.now() + r.expiraEnS * 1000,
      });
      router.replace(destino);
    } catch (err) {
      setEnviando(false);
      if (err instanceof ApiError && err.status === 401) {
        setErrorCredenciales(
          "Usuario o contraseña incorrectos. Revisa los datos e inténtalo de nuevo.",
        );
      } else if (err instanceof ApiError && err.status === 429) {
        const s = err.reintentarEnS ?? 60;
        setBloqueadoHasta(Date.now() + s * 1000);
        setErrorGeneral(
          `Demasiados intentos fallidos. Por seguridad, espera ${s} segundos antes de volver a intentarlo.`,
        );
      } else if (err instanceof ErrorRed) {
        setErrorGeneral(
          "No pudimos conectar con el servidor. Revisa tu conexión y vuelve a intentarlo.",
        );
      } else {
        setErrorGeneral(
          "No pudimos iniciar sesión. Tus datos no se guardaron; vuelve a intentarlo.",
        );
      }
    }
  }

  const motivo = params.get("motivo");
  return (
    <div className="min-h-dvh bg-bg text-text lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* Placa azul en claro (la cruz blanca del isotipo no se ve sobre blanco); en oscuro,
          el isotipo va directo sobre el fondo. */}
      <div className="grid place-items-center bg-placa px-6 py-8 lg:min-h-dvh lg:py-16">
        <Image
          src="/logo-uniminuto.png"
          alt="UNIMINUTO"
          width={120}
          height={171}
          priority
          unoptimized
          className="h-auto w-[120px] lg:w-[168px]"
        />
      </div>

      <main className="relative mx-auto w-full max-w-[440px] px-4 pt-8 pb-12 lg:flex lg:max-w-[480px] lg:flex-col lg:justify-center lg:px-0">
        <div className="absolute top-3 right-3 lg:top-6 lg:right-6">
          <ThemeToggle />
        </div>
        <h1 className="text-title font-bold tracking-[var(--tracking-title)]">
          Entrar con cuenta institucional
        </h1>
        <p className="m-0 mt-2 text-compact text-text-2 measure">
          Inscribe tus materias de 2027-1 con cupos y horarios en vivo.
        </p>

        {motivo === "expirada" ? (
          <p
            role="status"
            className="m-0 mt-5 rounded-control bg-primary-soft px-3.5 py-3 text-compact text-text"
          >
            Tu sesión venció. Entra de nuevo para seguir; tu horario no cambió.
          </p>
        ) : null}

        <form onSubmit={enviar} className="mt-6 grid gap-4" noValidate>
          <Campo
            etiqueta="Estudiante o correo"
            name="usuario"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            ayuda="Tu código (est-000001) o tu correo sintético."
          />
          <Campo
            etiqueta="Contraseña"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            alternarVisibilidad
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            {...(errorCredenciales ? { error: errorCredenciales } : {})}
          />

          {errorGeneral ? <EstadoError titulo={errorGeneral} /> : null}

          <Button
            type="submit"
            bloque
            icono={<LogIn aria-hidden="true" />}
            cargando={enviando}
            disabled={usuario.trim() === "" || password === "" || espera > 0}
            {...(espera > 0 ? { motivo: `Podrás intentarlo en ${espera} s.` } : {})}
          >
            {enviando ? "Entrando…" : "Entrar"}
          </Button>
        </form>

        <section aria-labelledby="demo" className="mt-10 border-t border-border pt-5">
          <h2 id="demo" className="text-subject font-semibold">
            Cuentas de demo
          </h2>
          <p className="m-0 mt-1 text-compact text-text-2 measure">
            Datos sintéticos. La contraseña de demo es la misma para todas (la define quien levantó
            el entorno).
          </p>
          <ul className="m-0 mt-3 grid list-none gap-1 p-0">
            {DEMOS.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => setUsuario(d.id)}
                  className="flex min-h-11 w-full items-baseline justify-between gap-3 rounded-control px-3 py-2 text-left hover:bg-surface-2"
                >
                  <span className="font-semibold tabular text-primary-ink">{d.id}</span>
                  <span className="text-meta text-text-2">{d.nota}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
