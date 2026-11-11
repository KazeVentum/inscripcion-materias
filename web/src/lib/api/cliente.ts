import type {
  AuditoriaOut,
  CodigoError,
  CombinacionesOut,
  CoordinadorOut,
  DemandaInsatisfechaOut,
  DemandaNrcOut,
  OcupacionFranjaOut,
  OrdenDemanda,
  ResumenOut,
  EstadoInscripcionOut,
  AvanceOut,
  HorarioOut,
  InscripcionIn,
  LoginIn,
  LoginOut,
  MateriaHabilitadaOut,
  NrcOut,
  PerfilOut,
  ReservaOut,
  TicketOut,
} from "@/lib/tipos";
import { cerrarSesion, leerSesion } from "./sesion";

/** Respuesta de error de la API: `{ codigo, mensaje, alternativa? }` con su estado HTTP. */
export class ApiError extends Error {
  readonly status: number;
  readonly codigo: CodigoError | string;
  readonly alternativa: NrcOut | null;
  /** NRC con el que cruza (409 cruce). */
  readonly conflicto: string | null;
  readonly reintentarEnS: number | null;

  constructor(
    status: number,
    cuerpo: {
      codigo?: string;
      mensaje?: string;
      alternativa?: NrcOut | null;
      conflicto?: { nrc?: string };
    },
    reintentarEnS: number | null = null,
  ) {
    super(cuerpo.mensaje ?? `Error ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.codigo = cuerpo.codigo ?? "error";
    this.alternativa = cuerpo.alternativa ?? null;
    this.conflicto = cuerpo.conflicto?.nrc ?? null;
    this.reintentarEnS = reintentarEnS;
  }
}

/** No hubo respuesta: sin red, servidor caído o petición cancelada por tiempo. */
export class ErrorRed extends Error {
  constructor(causa?: unknown) {
    super("Sin conexión con el servidor");
    this.name = "ErrorRed";
    this.cause = causa;
  }
}

export interface OpcionesCliente {
  base?: string;
  fetchImpl?: typeof fetch;
  token?: () => string | null;
  /** Se llama con 401 en una ruta autenticada (token vencido o inválido). */
  alExpirar?: () => void;
}

interface Opciones {
  metodo?: "GET" | "POST" | "DELETE";
  cuerpo?: unknown;
  signal?: AbortSignal;
  /** Sin Authorization (login). */
  anonimo?: boolean;
}

export function crearCliente({
  base = "/api/v1",
  fetchImpl,
  token = () => leerSesion()?.token ?? null,
  alExpirar = cerrarSesion,
}: OpcionesCliente = {}) {
  async function pedir<T>(ruta: string, op: Opciones = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (op.cuerpo !== undefined) headers["Content-Type"] = "application/json";
    const t = op.anonimo ? null : token();
    if (t) headers.Authorization = `Bearer ${t}`;

    let res: Response;
    try {
      res = await (fetchImpl ?? fetch)(`${base}${ruta}`, {
        method: op.metodo ?? "GET",
        headers,
        ...(op.cuerpo !== undefined ? { body: JSON.stringify(op.cuerpo) } : {}),
        ...(op.signal ? { signal: op.signal } : {}),
        cache: "no-store",
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      throw new ErrorRed(e);
    }

    if (!res.ok) {
      let cuerpo: ConstructorParameters<typeof ApiError>[1] = {};
      try {
        cuerpo = (await res.json()) as typeof cuerpo;
      } catch {
        /* cuerpo vacío o HTML del proxy (502): se conserva solo el estado */
      }
      const espera = Number(res.headers.get("Retry-After"));
      const err = new ApiError(
        res.status,
        cuerpo,
        Number.isFinite(espera) && espera > 0 ? espera : null,
      );
      if (res.status === 401 && !op.anonimo) alExpirar();
      throw err;
    }
    return (await res.json()) as T;
  }

  const enc = encodeURIComponent;
  return {
    login: (datos: LoginIn) =>
      pedir<LoginOut>("/auth/login", { metodo: "POST", cuerpo: datos, anonimo: true }),
    perfil: (signal?: AbortSignal) => pedir<PerfilOut>("/me", opc(signal)),
    materias: (signal?: AbortSignal) =>
      pedir<MateriaHabilitadaOut[]>("/materias/habilitadas", opc(signal)),
    nrcDe: (materiaId: string, signal?: AbortSignal) =>
      pedir<NrcOut[]>(`/materias/${enc(materiaId)}/nrc`, opc(signal)),
    avance: (signal?: AbortSignal) => pedir<AvanceOut>("/avance", opc(signal)),
    horario: (signal?: AbortSignal) => pedir<HorarioOut>("/horario", opc(signal)),
    inscribir: (datos: InscripcionIn) =>
      pedir<ReservaOut>("/inscripciones", { metodo: "POST", cuerpo: datos }),
    estadoInscripcion: (nrc: string, signal?: AbortSignal) =>
      pedir<EstadoInscripcionOut>(`/inscripciones/${enc(nrc)}`, opc(signal)),
    cancelar: (nrc: string) =>
      pedir<EstadoInscripcionOut>(`/inscripciones/${enc(nrc)}`, { metodo: "DELETE" }),
    ticketStream: () => pedir<TicketOut>("/stream/ticket", { metodo: "POST" }),

    // Coordinación (HU5): solo rol coordinador; un estudiante recibe 403 rol_no_permitido.
    coordinador: (signal?: AbortSignal) => pedir<CoordinadorOut>("/coordinacion/me", opc(signal)),
    resumen: (signal?: AbortSignal) =>
      pedir<ResumenOut>("/coordinacion/analitica/resumen", opc(signal)),
    demandaNrc: (p: ParamsDemandaNrc = {}, signal?: AbortSignal) =>
      pedir<DemandaNrcOut>(
        `/coordinacion/analitica/demanda-nrc${consulta({
          orden: p.orden,
          limite: p.limite,
          materiaId: p.materiaId,
          soloConIntentos: p.soloConIntentos ? "true" : undefined,
        })}`,
        opc(signal),
      ),
    ocupacionFranja: (signal?: AbortSignal) =>
      pedir<OcupacionFranjaOut>("/coordinacion/analitica/ocupacion-franja", opc(signal)),
    combinaciones: (p: { semestre?: number; limite?: number } = {}, signal?: AbortSignal) =>
      pedir<CombinacionesOut>(
        `/coordinacion/analitica/combinaciones${consulta({ semestre: p.semestre, limite: p.limite })}`,
        opc(signal),
      ),
    auditoria: (signal?: AbortSignal) =>
      pedir<AuditoriaOut>("/coordinacion/analitica/auditoria", opc(signal)),
    demandaInsatisfecha: (limite?: number, signal?: AbortSignal) =>
      pedir<DemandaInsatisfechaOut>(
        `/coordinacion/analitica/demanda-insatisfecha${consulta({ limite })}`,
        opc(signal),
      ),
  };
}

export interface ParamsDemandaNrc {
  orden?: OrdenDemanda;
  limite?: number;
  materiaId?: string;
  soloConIntentos?: boolean;
}

/** `?a=1&b=x` sin los parámetros vacíos; "" si no queda ninguno. */
export function consulta(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v));
  const t = q.toString();
  return t ? `?${t}` : "";
}

function opc(signal?: AbortSignal): Opciones {
  return signal ? { signal } : {};
}

export type ClienteApi = ReturnType<typeof crearCliente>;

/** Cliente por defecto: mismo origen, JWT de la sesión. */
export const api: ClienteApi = crearCliente();
