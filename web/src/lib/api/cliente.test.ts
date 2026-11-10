import { describe, expect, it, vi } from "vitest";
import { ApiError, ErrorRed, crearCliente } from "./cliente";

function respuesta(cuerpo: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(cuerpo), {
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    status: init.status ?? 200,
  });
}

function armar(fetchImpl: typeof fetch, token: string | null = "jwt-de-prueba") {
  const alExpirar = vi.fn();
  const cliente = crearCliente({ fetchImpl, token: () => token, alExpirar });
  return { cliente, alExpirar };
}

describe("cliente de la API", () => {
  it("envía el JWT en Authorization, nunca en la URL", async () => {
    const f = vi.fn(async () => respuesta([]));
    const { cliente } = armar(f as unknown as typeof fetch);
    await cliente.materias();
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/materias/habilitadas");
    expect(url).not.toContain("jwt-de-prueba");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer jwt-de-prueba");
  });

  it("el login no lleva Authorization y manda usuario y password", async () => {
    const f = vi.fn(async () =>
      respuesta({ accessToken: "t", expiraEnS: 3600, estudianteId: "e" }),
    );
    const { cliente } = armar(f as unknown as typeof fetch);
    await cliente.login({ usuario: "est-000001", password: "x" });
    const [, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(JSON.parse(init.body as string)).toEqual({ usuario: "est-000001", password: "x" });
    expect(init.method).toBe("POST");
  });

  it("codifica el id de materia y NRC en la ruta", async () => {
    const f = vi.fn(async () => respuesta([]));
    const { cliente } = armar(f as unknown as typeof fetch);
    await cliente.nrcDe("A/B");
    expect((f.mock.calls[0] as unknown as [string])[0]).toBe("/api/v1/materias/A%2FB/nrc");
  });

  it("un 409 sin_cupo conserva la alternativa de la API", async () => {
    const alternativa = { nrc: "40930", cuposLibres: 6 };
    const f = vi.fn(async () =>
      respuesta({ codigo: "sin_cupo", mensaje: "El NRC se llenó", alternativa }, { status: 409 }),
    );
    const { cliente } = armar(f as unknown as typeof fetch);
    const err = await cliente.inscribir({ nrc: "80852" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, codigo: "sin_cupo", alternativa });
  });

  it("un 409 cruce expone el NRC en conflicto", async () => {
    const f = vi.fn(async () =>
      respuesta({ codigo: "cruce", mensaje: "x", conflicto: { nrc: "81204" } }, { status: 409 }),
    );
    const { cliente } = armar(f as unknown as typeof fetch);
    const err = (await cliente.inscribir({ nrc: "1" }).catch((e: unknown) => e)) as ApiError;
    expect(err.conflicto).toBe("81204");
  });

  it("un 401 en ruta autenticada cierra la sesión; en el login no", async () => {
    const f = vi.fn(async () =>
      respuesta({ codigo: "credenciales_invalidas", mensaje: "no" }, { status: 401 }),
    );
    const { cliente, alExpirar } = armar(f as unknown as typeof fetch);
    await expect(cliente.perfil()).rejects.toBeInstanceOf(ApiError);
    expect(alExpirar).toHaveBeenCalledTimes(1);
    await expect(cliente.login({ usuario: "a", password: "b" })).rejects.toMatchObject({
      status: 401,
    });
    expect(alExpirar).toHaveBeenCalledTimes(1);
  });

  it("un 429 trae Retry-After", async () => {
    const f = vi.fn(async () =>
      respuesta(
        { codigo: "demasiados_intentos", mensaje: "espera" },
        { status: 429, headers: { "Retry-After": "42" } },
      ),
    );
    const { cliente } = armar(f as unknown as typeof fetch);
    const err = (await cliente
      .login({ usuario: "a", password: "b" })
      .catch((e: unknown) => e)) as ApiError;
    expect(err.status).toBe(429);
    expect(err.reintentarEnS).toBe(42);
  });

  it("un fallo de red es ErrorRed", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const { cliente } = armar(f as unknown as typeof fetch);
    await expect(cliente.horario()).rejects.toBeInstanceOf(ErrorRed);
  });

  it("un 502 con HTML del proxy no rompe el parseo del error", async () => {
    const f = vi.fn(async () => new Response("<html>Bad Gateway</html>", { status: 502 }));
    const { cliente } = armar(f as unknown as typeof fetch);
    await expect(cliente.horario()).rejects.toMatchObject({ status: 502, codigo: "error" });
  });
});
