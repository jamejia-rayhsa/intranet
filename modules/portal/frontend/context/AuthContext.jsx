import { createContext, useState, useEffect, useContext } from "react";
import { obtenerPerfil } from "../services/auth.service";

const AuthContexto = createContext(null);

export function ProveedorAuth({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      obtenerPerfil()
        .then((respuesta) => {
          if (respuesta.exito) {
            setUsuario(respuesta.datos);
          }
        })
        .catch(() => {
          localStorage.removeItem("token");
        })
        .finally(() => {
          setCargando(false);
        });
    } else {
      setCargando(false);
    }
  }, []);

  function iniciarSesion(token, datosUsuario) {
    localStorage.setItem("token", token);
    setUsuario(datosUsuario);
  }

  function cerrarSesion() {
    localStorage.removeItem("token");
    setUsuario(null);
  }

  return (
    <AuthContexto.Provider
      value={{ usuario, cargando, iniciarSesion, cerrarSesion }}
    >
      {children}
    </AuthContexto.Provider>
  );
}

export function usarAuth() {
  const contexto = useContext(AuthContexto);
  if (!contexto) {
    throw new Error("usarAuth debe usarse dentro de un ProveedorAuth");
  }
  return contexto;
}
