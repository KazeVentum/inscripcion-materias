import type { Rol } from "@/lib/tipos";

/** Pantalla de inicio de cada rol. */
export function rutaInicial(rol: Rol): string {
  return rol === "coordinador" ? "/coordinacion/analitica" : "/inscripcion";
}

/** `/coordinacion/*` es del coordinador; el resto de rutas autenticadas, del estudiante. */
export function rolDeRuta(ruta: string): Rol {
  return ruta === "/coordinacion" || ruta.startsWith("/coordinacion/")
    ? "coordinador"
    : "estudiante";
}

/**
 * Adónde ir tras el login: solo rutas internas (evita redirigir a otro sitio con ?siguiente=)
 * y solo si el rol puede verlas; si no, la pantalla de inicio del rol.
 */
export function destinoTrasLogin(siguiente: string | null, rol: Rol = "estudiante"): string {
  const interna = siguiente !== null && /^\/(?![/\\])/.test(siguiente);
  if (interna && rolDeRuta(siguiente) === rol) return siguiente;
  return rutaInicial(rol);
}
