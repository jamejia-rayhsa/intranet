import { useCallback, useEffect, useState } from "react";
import { usarAuth } from "../../../portal/frontend/context/AuthContext";
import { obtenerMisPermisos } from "../services/calendario.service";
import { nivelDePermiso, accesoGestionAsistencia, OPCION_ASISTENCIA, OPCION_EMPLEADOS } from "../utils/asistenciaPermisos";

/**
 * Acceso a la gestión de asistencia (resultados, periodos, parámetros) con UNA lectura de permisos. A diferencia de
 * useAccesoAsistencia, un fallo al leer los permisos NO se confunde con «sin permiso»: devuelve error y reintentar.
 * @returns {{cargando:boolean, error:boolean, puedeLeer:boolean, puedeEscribir:boolean, reintentar:Function}}
 */
export default function useAccesoGestion() {
  const { usuario } = usarAuth();
  const [estado, setEstado] = useState({ cargando: true, error: false, niveles: null });
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let activo = true;
    setEstado((e) => ({ ...e, cargando: true, error: false }));
    obtenerMisPermisos()
      .then((r) => {
        if (!activo) return;
        if (!r || !r.exito) throw new Error("permisos");
        setEstado({ cargando: false, error: false, niveles: [nivelDePermiso(usuario, r.datos, OPCION_ASISTENCIA), nivelDePermiso(usuario, r.datos, OPCION_EMPLEADOS)] });
      })
      .catch(() => { if (activo) setEstado({ cargando: false, error: true, niveles: null }); });
    return () => { activo = false; };
  }, [usuario, intento]);

  const reintentar = useCallback(() => setIntento((n) => n + 1), []);
  if (estado.cargando) return { cargando: true, error: false, puedeLeer: false, puedeEscribir: false, reintentar };
  if (estado.error) return { cargando: false, error: true, puedeLeer: false, puedeEscribir: false, reintentar };
  const a = accesoGestionAsistencia(estado.niveles[0], estado.niveles[1]);
  return { cargando: false, error: false, puedeLeer: a.puedeLeer, puedeEscribir: a.puedeEscribir, reintentar };
}
