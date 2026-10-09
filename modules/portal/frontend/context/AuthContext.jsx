import { createContext, useState, useEffect, useContext, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { obtenerPerfil } from "../services/auth.service";

const AuthContexto = createContext(null);

const MENSAJE_SIN_ACCESO =
  "Tu cuenta no tiene acceso a la intranet. Contacta al administrador.";

export function ProveedorAuth({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorAuth, setErrorAuth] = useState(null);
  const uidActual = useRef(null);

  // Devuelve el perfil; si el backend rechaza la sesión, la cierra y lanza el error.
  const cargarPerfil = useCallback(async (uid) => {
    try {
      const respuesta = await obtenerPerfil();
      if (!respuesta.exito) throw new Error(respuesta.mensaje || MENSAJE_SIN_ACCESO);
      uidActual.current = uid;
      setUsuario(respuesta.datos);
      setErrorAuth(null);
      return respuesta.datos;
    } catch (err) {
      const sinAcceso = err.status === 401 || err.status === 403;
      if (sinAcceso) {
        await supabase.auth.signOut();
        uidActual.current = null;
        setUsuario(null);
        setErrorAuth(MENSAJE_SIN_ACCESO);
        throw new Error(MENSAJE_SIN_ACCESO);
      }
      throw err;
    }
  }, []);

  useEffect(() => {
    localStorage.removeItem("token");
    let activo = true;

    supabase.auth.getSession().then(async ({ data }) => {
      const sesion = data.session;
      if (sesion) {
        try {
          await cargarPerfil(sesion.user.id);
        } catch {
          // errorAuth ya fue establecido si correspondía
        }
      }
      if (activo) setCargando(false);
    });

    const { data: suscripcion } = supabase.auth.onAuthStateChange((evento, sesion) => {
      // Sin await de llamadas a supabase dentro del callback (riesgo de deadlock).
      setTimeout(() => {
        if (!activo) return;
        if (evento === "SIGNED_OUT") {
          uidActual.current = null;
          setUsuario(null);
        } else if (
          (evento === "SIGNED_IN" || evento === "TOKEN_REFRESHED") &&
          sesion &&
          sesion.user.id !== uidActual.current
        ) {
          cargarPerfil(sesion.user.id).catch(() => {});
        }
      }, 0);
    });

    return () => {
      activo = false;
      suscripcion.subscription.unsubscribe();
    };
  }, [cargarPerfil]);

  async function iniciarSesion(correo, contraseña) {
    setErrorAuth(null);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: correo,
      password: contraseña,
    });
    if (error) {
      throw new Error(
        error.status === 400 || error.status === 401 || /invalid/i.test(error.message)
          ? "Correo o contraseña incorrectos"
          : "Error al conectar con el servidor",
      );
    }
    return cargarPerfil(data.user.id);
  }

  async function iniciarSesionMicrosoft() {
    setErrorAuth(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        redirectTo: window.location.origin + "/auth/callback",
        scopes: "email",
      },
    });
    if (error) throw new Error("No se pudo iniciar sesión con Microsoft");
  }

  async function cerrarSesion() {
    await supabase.auth.signOut();
    uidActual.current = null;
    setUsuario(null);
  }

  async function recargarPerfil() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return null;
    return cargarPerfil(data.session.user.id);
  }

  return (
    <AuthContexto.Provider
      value={{
        usuario,
        cargando,
        errorAuth,
        iniciarSesion,
        iniciarSesionMicrosoft,
        cerrarSesion,
        recargarPerfil,
      }}
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
