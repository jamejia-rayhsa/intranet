const ServicioCorreo = {
  async enviar(destinatario, asunto, cuerpo) {
    if (process.env.NODE_ENV === "development") {
      console.log(
        `[Correo Simulado] Para: ${destinatario} | Asunto: ${asunto}`,
      );
      return { exito: true, mensaje: "Correo simulado enviado (desarrollo)" };
    }

    // TODO: Implementar con Nodemailer cuando se configure SMTP
    throw new Error(
      "Servicio de correo no configurado. Configure las variables SMTP_*",
    );
  },

  async enviarRecuperacionPassword(correo, token) {
    const enlace = `${process.env.FRONTEND_URL || "http://localhost:3000"}/recuperar-password?token=${token}`;
    const asunto = "Recuperación de contraseña - Intranet";
    const cuerpo = `Haz clic en el siguiente enlace para restablecer tu contraseña: ${enlace}`;

    return this.enviar(correo, asunto, cuerpo);
  },

  async enviarBienvenida(correo, nombre) {
    const asunto = "Bienvenido a la Intranet Corporativa";
    const cuerpo = `Hola ${nombre}, bienvenido a la intranet corporativa.`;

    return this.enviar(correo, asunto, cuerpo);
  },
};

module.exports = ServicioCorreo;
