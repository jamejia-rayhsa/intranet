// Error de negocio del módulo de asistencia: lleva el estado HTTP y un mensaje seguro para el cliente.
class ErrorAsistencia extends Error {
  constructor(estado, mensaje) {
    super(mensaje);
    this.name = "ErrorAsistencia";
    this.estado = estado;
  }
}

module.exports = { ErrorAsistencia };
