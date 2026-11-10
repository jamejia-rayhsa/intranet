import { useEffect, useState } from "react";
import { usarAuth } from "../../../portal/frontend/context/AuthContext";
import { obtenerMisPermisos } from "../services/calendario.service";
import { nivelDePermiso } from "../utils/asistenciaPermisos";

/**
 * Nivel de acceso del usuario a una opción de RH (Turnos / Ingesta) para decidir qué se muestra.
 * Mientras carga `nivel` es undefined; si los permisos no se pueden leer se deja pasar (nivel 'consulta'):
 * el servidor responde 403 y la pantalla lo muestra, así un fallo de red no esconde la pantalla.
 */
export default function useAccesoAsistencia(opcion) {
  const { usuario } = usarAuth();
  const [nivel, setNivel] = useState(undefined);

  useEffect(() => {
    let activo = true;
    obtenerMisPermisos()
      .then((r) => { if (activo) setNivel(nivelDePermiso(usuario, r && r.exito ? r.datos : [], opcion)); })
      .catch(() => { if (activo) setNivel(nivelDePermiso(usuario, [], opcion) || "consulta"); });
    return () => { activo = false; };
  }, [usuario, opcion]);

  return nivel;
}
