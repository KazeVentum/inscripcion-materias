import { describe, expect, it, vi } from "vitest";
import { ApiError, ErrorRed } from "@/lib/api/cliente";
import { esperarConfirmacion, mensajeCruce, mensajeIntentoFallido } from "./inscribir";
import type { EstadoInscripcionOut, HorarioOut, NrcOut } from "./tipos";

const est = (estado: EstadoInscripcionOut["estado"]): EstadoInscripcionOut => ({
  nrc: "1",
  estado,
});
const sinEspera = async () => {};

describe("esperarConfirmacion", () => {
  it("consulta hasta que deja de estar reservada", async () => {
    const consultar = vi
      .fn()
      .mockResolvedValueOnce(est("reservada"))
      .mockResolvedValueOnce(est("reservada"))
      .mockResolvedValueOnce(est("confirmada"));
    const r = await esperarConfirmacion("1", { consultar, esperar: sinEspera });
    expect(r?.estado).toBe("confirmada");
    expect(consultar).toHaveBeenCalledTimes(3);
  });

  it("devuelve rechazada tal cual", async () => {
    const consultar = vi.fn().mockResolvedValue(est("rechazada"));
    expect((await esperarConfirmacion("1", { consultar, esperar: sinEspera }))?.estado).toBe(
      "rechazada",
    );
  });

  it("tolera fallos sueltos pero se rinde tras maxFallos seguidos", async () => {
    const consultar = vi
      .fn()
      .mockRejectedValueOnce(new ErrorRed())
      .mockResolvedValueOnce(est("confirmada"));
    expect((await esperarConfirmacion("1", { consultar, esperar: sinEspera }))?.estado).toBe(
      "confirmada",
    );

    const siempre = vi.fn().mockRejectedValue(new ErrorRed());
    await expect(
      esperarConfirmacion("1", { consultar: siempre, esperar: sinEspera, maxFallos: 3 }),
    ).rejects.toBeInstanceOf(ErrorRed);
    expect(siempre).toHaveBeenCalledTimes(3);
  });

  it("un 401 corta de una vez", async () => {
    const consultar = vi.fn().mockRejectedValue(new ApiError(401, { codigo: "token_expirado" }));
    await expect(esperarConfirmacion("1", { consultar, esperar: sinEspera })).rejects.toMatchObject(
      {
        status: 401,
      },
    );
    expect(consultar).toHaveBeenCalledTimes(1);
  });

  it("devuelve null al agotar el tiempo", async () => {
    let t = 0;
    const consultar = vi.fn().mockResolvedValue(est("reservada"));
    const r = await esperarConfirmacion("1", {
      consultar,
      esperar: async (ms) => void (t += ms),
      ahora: () => t,
      intervaloMs: 1000,
      maxMs: 5000,
    });
    expect(r).toBeNull();
    expect(consultar).toHaveBeenCalledTimes(5);
  });

  it("se cancela con AbortSignal", async () => {
    const c = new AbortController();
    const consultar = vi.fn().mockImplementation(async () => {
      c.abort();
      throw new DOMException("x", "AbortError");
    });
    await expect(esperarConfirmacion("1", { consultar, signal: c.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});

const nrc = (extra: Partial<NrcOut> = {}): NrcOut => ({
  nrc: "80852",
  materiaId: "ISUMBG103",
  titulo: "Sistemas Operativos",
  creditos: 3,
  sede: "Calle 80",
  modalidad: "presencial",
  docente: "Docente",
  franja: "noche",
  cupoTotal: 18,
  cuposLibres: 3,
  bloques: [{ dia: "MAR", inicio: "18:15", fin: "19:44" }],
  ...extra,
});

const horario: HorarioOut = {
  periodo: "2027-1",
  creditosTotales: 3,
  inscripciones: [
    {
      ...nrc({
        nrc: "81204",
        titulo: "Bases de Datos",
        bloques: [{ dia: "MAR", inicio: "17:00", fin: "18:30" }],
      }),
      estado: "confirmada",
    },
  ],
};

describe("mensajes de error (brief §7)", () => {
  it("cruce: nombra la materia, el NRC, el día y la hora", () => {
    const e = new ApiError(409, { codigo: "cruce", mensaje: "x", conflicto: { nrc: "81204" } });
    expect(mensajeIntentoFallido(e, nrc(), horario)).toBe(
      "Se cruza con Bases de Datos (NRC 81204) el martes a las 17:00.",
    );
  });
  it("cruce sin horario conocido usa el mensaje de la API", () => {
    const e = new ApiError(409, { codigo: "cruce", mensaje: "Se cruza con el NRC 9" });
    expect(mensajeIntentoFallido(e, nrc(), undefined)).toBe("Se cruza con el NRC 9");
    expect(mensajeCruce(nrc(), "9", undefined)).toBeNull();
  });
  it("ya inscrita, prerrequisito y red", () => {
    expect(
      mensajeIntentoFallido(new ApiError(409, { codigo: "ya_inscrita" }), nrc(), horario),
    ).toBe("Ya tienes Sistemas Operativos en tu horario.");
    expect(
      mensajeIntentoFallido(
        new ApiError(403, {
          codigo: "prerrequisito",
          mensaje: "Primero necesitas aprobar Estructuras de Datos.",
        }),
        nrc(),
        horario,
      ),
    ).toBe("Primero necesitas aprobar Estructuras de Datos.");
    expect(mensajeIntentoFallido(new ErrorRed(), nrc(), horario)).toContain(
      "No se descontó ningún cupo",
    );
  });
  it("503 y desconocidos prometen que no se descontó cupo", () => {
    expect(
      mensajeIntentoFallido(
        new ApiError(503, { codigo: "servicio_no_disponible" }),
        nrc(),
        horario,
      ),
    ).toContain("No se descontó ningún cupo");
    expect(mensajeIntentoFallido(new Error("x"), nrc(), horario)).toContain(
      "No se descontó ningún cupo",
    );
  });
});
