import { useCallback, useEffect, useState } from "react";
import { usarAuth } from "../../../portal/frontend/context/AuthContext";
import { miContexto, mensajeDeError } from "../services/asistencia.service";

// Caché corta en cliente (módulo) de GET /asistencia/mi-contexto: el menú y las dos pantallas lo leen sin repetir la
// petición. Se descarta al cambiar de usuario, al vencer (TTL) o al pedir una lectura nueva (`reintentar`).
export const TTL_CONTEXTO_MS = 20 * 1000; // corto: un cambio de jefe o de estatus se nota pronto
let cache = { clave: null, ts: 0, datos: null, promesa: null };

export function invalidarContextoAsistencia() {
  cache = { clave: null, ts: 0, datos: null, promesa: null };
}

function leerContexto(clave, forzar) {
  if (!forzar && cache.clave === clave) {
    if (cache.datos && Date.now() - cache.ts < TTL_CONTEXTO_MS) return Promise.resolve(cache.datos);
    if (cache.promesa) return cache.promesa;
  }
  const promesa = miContexto().then((r) => {
    if (!r || !r.exito || !r.datos) throw new Error("No se pudo leer tu contexto de asistencia");
    if (cache.promesa === promesa) cache = { clave, ts: Date.now(), datos: r.datos, promesa: null };
    return r.datos;
  });
  cache = { clave, ts: 0, datos: null, promesa };
  promesa.catch(() => {
    if (cache.promesa === promesa) cache = { clave: null, ts: 0, datos: null, promesa: null };
  });
  return promesa;
}

/**
 * Contexto de asistencia del usuario (empleado vinculado, si es jefe, turno, periodo actual). `refrescarCon` vuelve a leer (dentro del TTL, de la caché) cuando cambia. `habilitado` = false no hace
 * ninguna petición (p. ej. el menú de quien no tiene Asistencia:consulta). Un fallo deja `datos` en null y `error` con el mensaje.
 * @returns {{cargando:boolean, error:string, datos:object|null, reintentar:Function}}
 */
export default function useContextoAsistencia({ habilitado = true, refrescarCon = "" } = {}) {
  const { usuario } = usarAuth();
  const clave = usuario ? String(usuario.id ?? usuario.usuario_id ?? usuario.correo ?? "") : "";
  const [estado, setEstado] = useState({ cargando: habilitado, error: "", datos: null });
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (!habilitado || !clave) {
      setEstado({ cargando: false, error: "", datos: null });
      return undefined;
    }
    let activo = true;
    setEstado((e) => ({ ...e, cargando: true, error: "" }));
    leerContexto(clave, intento > 0)
      .then((datos) => { if (activo) setEstado({ cargando: false, error: "", datos }); })
      .catch((err) => { if (activo) setEstado({ cargando: false, error: mensajeDeError(err, "No se pudo cargar tu información de asistencia"), datos: null }); });
    return () => { activo = false; };
  }, [habilitado, clave, intento, refrescarCon]); // `refrescarCon` (p. ej. la ruta) relee al navegar: la caché evita repetir la petición

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  return { ...estado, reintentar };
}
