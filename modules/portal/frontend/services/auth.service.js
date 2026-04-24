import { solicitar } from '../utils/api';

export async function registrarse(datos) {
  return solicitar('/auth/registro', {
    metodo: 'POST',
    cuerpo: JSON.stringify(datos),
  });
}

export async function iniciarSesion(correo, contraseña) {
  return solicitar('/auth/inicio-sesion', {
    metodo: 'POST',
    cuerpo: JSON.stringify({ correo, contraseña }),
  });
}

export async function obtenerPerfil() {
  return solicitar('/auth/perfil');
}

export async function recuperarContraseña(correo) {
  return solicitar('/auth/recuperar-password', {
    metodo: 'POST',
    cuerpo: JSON.stringify({ correo }),
  });
}
