import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { solicitar } from "../utils/api";
import { usarAuth } from "../context/AuthContext";

export default function PortalCambiarPassword() {
  const { recargarPerfil } = usarAuth();
  const navigate = useNavigate();
  const [contraseñaActual, setContraseñaActual] = useState("");
  const [contraseñaNueva, setContraseñaNueva] = useState("");
  const [confirmarContraseña, setConfirmarContraseña] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function manejarEnvio(evento) {
    evento.preventDefault();
    setError("");

    if (contraseñaNueva !== confirmarContraseña) {
      setError("Las contraseñas nuevas no coinciden");
      return;
    }

    if (contraseñaNueva.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    setCargando(true);

    try {
      const respuesta = await solicitar("/auth/cambiar-password", {
        metodo: "POST",
        cuerpo: JSON.stringify({
          contraseña_actual: contraseñaActual,
          contraseña_nueva: contraseñaNueva,
        }),
      });

      if (respuesta.exito) {
        await recargarPerfil();
        navigate("/");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="cambiar-password-contenedor">
      <h1>Cambiar Contraseña</h1>
      <p className="cambiar-password-aviso">
        Debes cambiar tu contraseña antes de continuar.
      </p>

      {error && <div className="mensaje-error">{error}</div>}

      <form onSubmit={manejarEnvio}>
        <div className="campo">
          <label htmlFor="contraseña-actual">Contraseña actual</label>
          <input
            type="password"
            id="contraseña-actual"
            value={contraseñaActual}
            onChange={(e) => setContraseñaActual(e.target.value)}
            required
          />
        </div>

        <div className="campo">
          <label htmlFor="contraseña-nueva">Nueva contraseña</label>
          <input
            type="password"
            id="contraseña-nueva"
            value={contraseñaNueva}
            onChange={(e) => setContraseñaNueva(e.target.value)}
            required
            minLength={6}
          />
        </div>

        <div className="campo">
          <label htmlFor="confirmar-contraseña">
            Confirmar nueva contraseña
          </label>
          <input
            type="password"
            id="confirmar-contraseña"
            value={confirmarContraseña}
            onChange={(e) => setConfirmarContraseña(e.target.value)}
            required
            minLength={6}
          />
        </div>

        <button type="submit" disabled={cargando}>
          {cargando ? "Guardando..." : "Cambiar Contraseña"}
        </button>
      </form>
    </div>
  );
}
