const ServicioNotificacion = {
  async enviarCorreoTicket(destinatario, asunto, cuerpo) {
    if (process.env.NODE_ENV === "development") {
      console.log(
        `[Correo Simulado - Tickets] Para: ${destinatario} | Asunto: ${asunto}`,
      );
      return { exito: true, mensaje: "Correo simulado enviado (desarrollo)" };
    }

    if (!process.env.SMTP_HOST) {
      console.warn("SMTP no configurado, omitiendo envío de correo");
      return { exito: false, mensaje: "SMTP no configurado" };
    }

    const nodemailer = require("nodemailer");

    const transportador = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_PORT === "465",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    await transportador.sendMail({
      from: process.env.SMTP_DE_DEFAECTO || "no-responder@intranet.local",
      to: destinatario,
      subject: asunto,
      text: cuerpo,
    });

    return { exito: true, mensaje: "Correo enviado exitosamente" };
  },

  async notificarNuevoTicket(ticket, correoUsuario) {
    const asunto = `Nuevo ticket de soporte: ${ticket.titulo}`;
    const cuerpo = `Se ha creado un nuevo ticket:

Título: ${ticket.titulo}
Descripción: ${ticket.descripcion || "Sin descripción"}
Nivel: ${ticket.nivel_atencion}
Categoría: ${ticket.categoria || "Sin categoría"}

El ticket será atendido a la brevedad.`;

    return this.enviarCorreoTicket(correoUsuario, asunto, cuerpo);
  },

  async notificarCambioEstado(
    ticket,
    correoUsuario,
    estadoAnterior,
    estadoNuevo,
  ) {
    const asunto = `Ticket "${ticket.titulo}" cambió a: ${estadoNuevo}`;
    const cuerpo = `El estado de tu ticket ha cambiado:

Título: ${ticket.titulo}
Estado anterior: ${estadoAnterior}
Nuevo estado: ${estadoNuevo}

${estadoNuevo === "resuelto" ? "Tu ticket ha sido resuelto. Por favor confirma si estás satisfecho con la atención." : ""}`;

    return this.enviarCorreoTicket(correoUsuario, asunto, cuerpo);
  },

  async notificarAsignacionTecnico(ticket, correoTecnico) {
    const asunto = `Ticket asignado: ${ticket.titulo}`;
    const cuerpo = `Se te ha asignado un nuevo ticket:

Título: ${ticket.titulo}
Descripción: ${ticket.descripcion || "Sin descripción"}
Nivel: ${ticket.nivel_atencion}
Categoría: ${ticket.categoria || "Sin categoría"}

Por favor atiéndelo a la brevedad.`;

    return this.enviarCorreoTicket(correoTecnico, asunto, cuerpo);
  },
};

module.exports = ServicioNotificacion;
