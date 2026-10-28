import { solicitar } from "../../../portal/frontend/utils/api";

export async function obtenerEmpleados(filtros = {}) {
  const parametros = new URLSearchParams();

  if (filtros.pagina) parametros.append("pagina", filtros.pagina);
  if (filtros.limite) parametros.append("limite", filtros.limite);
  if (filtros.estatus) parametros.append("estatus", filtros.estatus);
  if (filtros.departamento)
    parametros.append("departamento", filtros.departamento);
  if (filtros.busqueda) parametros.append("busqueda", filtros.busqueda);

  return solicitar(`/empleados?${parametros.toString()}`);
}

export async function obtenerEmpleado(id) {
  return solicitar(`/empleados/${id}`);
}

export async function obtenerMiPerfil() {
  return solicitar("/empleados/mi-perfil");
}

export async function crearEmpleado(datos) {
  return solicitar("/empleados", {
    method: "POST",
    body: JSON.stringify(datos),
  });
}

export async function actualizarEmpleado(id, datos) {
  return solicitar(`/empleados/${id}`, {
    method: "PUT",
    body: JSON.stringify(datos),
  });
}

export async function marcarBaja(id, motivo = "") {
  return solicitar(`/empleados/${id}/baja`, {
    method: "PUT",
    body: JSON.stringify({ motivo }),
  });
}

export async function obtenerSubordinados(jefeId) {
  return solicitar(`/empleados/jefe/${jefeId}/subordinados`);
}

export async function obtenerRoles() {
  return solicitar("/roles");
}

// Relación cuenta de usuario <-> empleado (solo empleados.usuario_id; solo RH)
export async function obtenerCuentasDisponibles({ busqueda = "", pagina = 1, limite = 10 } = {}) {
  const parametros = new URLSearchParams({ pagina, limite });
  if (busqueda) parametros.append("busqueda", busqueda);
  return solicitar(`/empleados/cuentas/disponibles?${parametros.toString()}`);
}

export async function obtenerVistaPreviaCuentas({ pagina = 1, limite = 25, estado = "" } = {}) {
  const parametros = new URLSearchParams({ pagina, limite });
  if (estado) parametros.append("estado", estado);
  return solicitar(`/empleados/cuentas/vista-previa?${parametros.toString()}`);
}

export async function vincularCuentas(pares, { confirmarPrivilegiadas = false } = {}) {
  return solicitar("/empleados/cuentas/vincular", {
    method: "POST",
    body: JSON.stringify({ pares, confirmar: true, confirmar_privilegiadas: confirmarPrivilegiadas }),
  });
}

// usuarioId null = desvincular
export async function cambiarCuentaEmpleado(empleadoId, usuarioId, { confirmarPrivilegiada = false } = {}) {
  return solicitar(`/empleados/${empleadoId}/cuenta`, {
    method: "POST",
    body: JSON.stringify(
      usuarioId === null
        ? { usuario_id: null, confirmar: true }
        : { usuario_id: usuarioId, confirmar_privilegiada: confirmarPrivilegiada },
    ),
  });
}
