const ServicioNotificacionRH = {
  async enviarCorreo(destinatario, asunto, cuerpo) {
    if (process.env.NODE_ENV === "development") {
      console.log(
        `[Correo Simulado - RH] Para: ${destinatario} | Asunto: ${asunto}`,
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

  async notificarPermisoAprobado(correoEmpleado, tipo, fechaInicio, fechaFin) {
    const asunto = "Permiso de ausencia aprobado";
    const cuerpo = `Tu solicitud de permiso ha sido aprobada:

Tipo: ${tipo}
Fecha inicio: ${fechaInicio}
Fecha fin: ${fechaFin}

Recuerda coordinarte con tu equipo antes de tu ausencia.`;

    return this.enviarCorreo(correoEmpleado, asunto, cuerpo);
  },

  async notificarPermisoRechazado(correoEmpleado, tipo, motivo) {
    const asunto = "Permiso de ausencia rechazado";
    const cuerpo = `Tu solicitud de permiso ha sido rechazada:

Tipo: ${tipo}
Motivo: ${motivo || "No especificado"}

Si tienes dudas, comunícate con tu jefe inmediato o con RH.`;

    return this.enviarCorreo(correoEmpleado, asunto, cuerpo);
  },

  async notificarNuevoPermiso(
    correoJefe,
    nombreEmpleado,
    tipo,
    fechaInicio,
    fechaFin,
  ) {
    const asunto = `Nueva solicitud de permiso: ${nombreEmpleado}`;
    const cuerpo = `${nombreEmpleado} ha solicitado un permiso de ausencia:

Tipo: ${tipo}
Fecha inicio: ${fechaInicio}
Fecha fin: ${fechaFin}

Por favor revisa y aprueba o rechaza desde el módulo de RH.`;

    return this.enviarCorreo(correoJefe, asunto, cuerpo);
  },
};

module.exports = ServicioNotificacionRH;
