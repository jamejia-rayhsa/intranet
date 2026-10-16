const Usuario = require("../models/usuario.model");
const Delegacion = require("../services/delegacionPermisos");
const { grupo } = require("../config/database");
const supabaseAdmin = require("../services/supabaseAdmin.service");
const sinSecretos = require("../utils/sinSecretos");
const {
  generarContraseñaTemporal,
} = require("../utils/contrasenaTemporal");

const ControladorUsuario = {
  async listar(req, res) {
    try {
      const usuarios = await Usuario.obtenerTodos();
      res.json({ exito: true, datos: usuarios });
    } catch (error) {
      console.error("Error al listar usuarios:", error.message);
      res.status(500).json({ exito: false, mensaje: "Error al listar usuarios" });
    }
  },

  async obtener(req, res) {
    try {
      const usuario = await Usuario.buscarPorId(req.params.id);
      if (!usuario) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Usuario no encontrado" });
      }
      res.json({ exito: true, datos: sinSecretos(usuario) });
    } catch (error) {
      console.error("Error al obtener usuario:", error.message);
      res.status(500).json({ exito: false, mensaje: "Error al obtener usuario" });
    }
  },

  async crear(req, res) {
    try {
      const { correo, nombre, apellido, contraseña, rol_id, activo } = req.body;

      if (!correo || !nombre || !contraseña) {
        return res.status(400).json({
          exito: false,
          mensaje: "Correo, nombre y contraseña son obligatorios",
        });
      }

      // El rol inicial se valida ANTES de crear nada (ni GoTrue ni fila local)
      if (rol_id) {
        await Delegacion.validarRolesAsignables(grupo, req.user, [rol_id]);
      }

      const existente = await Usuario.buscarPorCorreo(correo);
      if (existente) {
        return res.status(400).json({
          exito: false,
          mensaje: "Ya existe un usuario con ese correo",
        });
      }

      // 1) Crear primero en GoTrue (única fuente de la contraseña);
      // 2) guardar auth_uid en el INSERT local (sin hash_password).
      const nuevoAuth = await supabaseAdmin.crearUsuario({
        correo: correo.trim().toLowerCase(),
        password: contraseña,
        metadata: { nombre, apellido },
      });

      let usuario;
      try {
        usuario = await Usuario.crear({
          correo,
          nombre,
          apellido,
          auth_tipo: "local",
          auth_uid: nuevoAuth.id,
          activo: activo !== undefined ? activo : true,
        });
      } catch (errorInsert) {
        // Compensacion: no dejar huerfano en GoTrue
        try {
          await supabaseAdmin.eliminarUsuario(nuevoAuth.id);
        } catch (errorComp) {
          console.error(
            "No se pudo compensar el alta en Supabase Auth:",
            errorComp.message,
          );
        }
        throw errorInsert;
      }

      if (rol_id) {
        await grupo.query(
          "INSERT INTO usuario_rol (usuario_id, rol_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
          [usuario.id, rol_id],
        );
      }

      res.status(201).json({
        exito: true,
        datos: sinSecretos(usuario),
        mensaje: "Usuario creado exitosamente",
      });
    } catch (error) {
      if (Delegacion.responderErrorDelegacion(res, error)) return;
      console.error("Error al crear usuario:", error.message);
      res.status(400).json({ exito: false, mensaje: "Error al crear usuario" });
    }
  },

  async actualizar(req, res) {
    try {
      const {
        nombre,
        apellido,
        contraseña,
        rol_id,
        activo,
        requiere_cambio_password,
      } = req.body;

      // Validación y escritura en UNA transacción con el usuario bloqueado (FOR UPDATE): la regla se
      // evalúa contra el estado FINAL (roles tras el cambio) y el actual, sin ventana frente a un ascenso
      // concurrente. Si el estado final es tomable solo por super_admin: 403 sin NINGÚN cambio (ni rol,
      // ni contraseña, ni llamada a GoTrue). Un rol_id ausente (undefined) no borra el rol; para
      // quitarlo se envía null o "".
      const datos = {};
      if (nombre !== undefined) datos.nombre = nombre;
      if (apellido !== undefined) datos.apellido = apellido;
      if (activo !== undefined) datos.activo = activo;
      if (requiere_cambio_password !== undefined)
        datos.requiere_cambio_password = requiere_cambio_password;
      if (contraseña) {
        datos.requiere_cambio_password = true;
      }

      // TODO(supabase): este endpoint no permite cambiar correo; si se agrega,
      // sincronizarlo en GoTrue (el contrato de supabaseAdmin aun no lo ofrece).
      let authUid = null;
      const { encontrado, valor: usuario } = await Delegacion.operarSobreUsuario(
        grupo,
        req.user,
        req.params.id,
        {
          rolId: rol_id === undefined ? undefined : rol_id || null,
          tomaCuenta: Boolean(contraseña),
          // Solo BD, dentro de la transacción (con el usuario bloqueado)
          escribir: async (cliente) => {
            if (contraseña) {
              const actual = await Usuario.buscarPorId(req.params.id, cliente);
              if (!actual) return null;
              if (!actual.auth_uid) {
                throw new Delegacion.ErrorDelegacion(
                  409,
                  "El usuario no tiene cuenta en Supabase Auth",
                );
              }
              authUid = actual.auth_uid;
            }
            // Sin otros campos (p. ej. solo rol_id) no hay UPDATE que hacer: se devuelve el usuario tal cual
            return Object.keys(datos).length > 0
              ? Usuario.actualizar(req.params.id, datos, cliente)
              : Usuario.buscarPorId(req.params.id, cliente);
          },
          // GoTrue DESPUÉS del COMMIT y sin conexión del pool; si falla, se compensa la BD
          externo: contraseña
            ? () => supabaseAdmin.actualizarPassword(authUid, contraseña)
            : undefined,
        },
      );
      if (!encontrado || !usuario) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Usuario no encontrado" });
      }

      res.json({
        exito: true,
        datos: sinSecretos(usuario),
        mensaje: "Usuario actualizado exitosamente",
      });
    } catch (error) {
      if (Delegacion.responderErrorDelegacion(res, error)) return;
      console.error("Error al actualizar usuario:", error.message);
      res.status(400).json({ exito: false, mensaje: "Error al actualizar usuario" });
    }
  },

  async resetearPassword(req, res) {
    try {
      const { id } = req.params;
      const contraseñaTemporal = generarContraseñaTemporal();

      // Resetear la contraseña equivale a tomar la cuenta: solo si el actor posee los permisos del rol.
      // Valida y escribe en BD bajo el bloqueo del usuario; GoTrue va DESPUÉS del COMMIT (con compensación).
      let authUid = null;
      const { encontrado } = await Delegacion.operarSobreUsuario(grupo, req.user, id, {
        tomaCuenta: true,
        escribir: async (cliente) => {
          const usuario = await Usuario.buscarPorId(id, cliente);
          if (!usuario) return null;
          if (usuario.auth_tipo !== "local") {
            throw new Delegacion.ErrorDelegacion(
              400,
              "Solo se puede resetear contraseña de usuarios locales",
            );
          }
          if (!usuario.auth_uid) {
            throw new Delegacion.ErrorDelegacion(
              409,
              "El usuario no tiene cuenta en Supabase Auth",
            );
          }
          authUid = usuario.auth_uid;
          await Usuario.actualizar(id, { requiere_cambio_password: true }, cliente);
          return true;
        },
        // La contraseña vive solo en GoTrue
        externo: () => supabaseAdmin.actualizarPassword(authUid, contraseñaTemporal),
      });
      if (!encontrado) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Usuario no encontrado" });
      }

      res.json({
        exito: true,
        datos: { contraseña_temporal: contraseñaTemporal },
        mensaje: "Contraseña reseteada exitosamente",
      });
    } catch (error) {
      if (Delegacion.responderErrorDelegacion(res, error)) return;
      console.error("Error al resetear contraseña:", error.message);
      res.status(500).json({ exito: false, mensaje: "Error al resetear contraseña" });
    }
  },

  async eliminar(req, res) {
    try {
      // Orden deliberado: primero la fila local, despues GoTrue. El middleware
      // autoriza por la fila local, asi que una identidad huerfana en GoTrue
      // recibe 403; invertirlo seria irrecuperable si fallara el borrado local.
      // Un fallo de limpieza en GoTrue se registra y no bloquea la respuesta.
      // Valida (no privilegiado) y borra bajo el mismo bloqueo del usuario
      const { encontrado, valor } = await Delegacion.operarSobreUsuario(
        grupo,
        req.user,
        req.params.id,
        {
          escribir: async (cliente) => {
            const previo = await Usuario.buscarPorId(req.params.id, cliente);
            const usuario = await Usuario.eliminar(req.params.id, cliente);
            return { previo, usuario };
          },
        },
      );
      const previo = valor && valor.previo;
      if (!encontrado || !valor.usuario) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Usuario no encontrado" });
      }
      if (previo && previo.auth_uid) {
        try {
          await supabaseAdmin.eliminarUsuario(previo.auth_uid);
        } catch (e) {
          console.warn(
            `Usuario ${req.params.id} eliminado local; fallo limpieza en Supabase Auth: ${e.message}`,
          );
        }
      }
      res.json({ exito: true, mensaje: "Usuario eliminado exitosamente" });
    } catch (error) {
      if (Delegacion.responderErrorDelegacion(res, error)) return;
      console.error("Error al eliminar usuario:", error.message);
      res.status(500).json({ exito: false, mensaje: "Error al eliminar usuario" });
    }
  },

  async asignarRol(req, res) {
    try {
      const { id } = req.params;
      const { rol_id } = req.body;

      if (!rol_id) {
        return res.status(400).json({
          exito: false,
          mensaje: "rol_id es obligatorio",
        });
      }

      // Valida (rol asignable por quien lo pide, usuario no privilegiado) y escribe en una transacción
      const existe = await Delegacion.cambiarRolDeUsuario(grupo, req.user, id, rol_id);
      if (!existe) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Usuario no encontrado" });
      }

      res.json({
        exito: true,
        mensaje: "Rol asignado exitosamente",
      });
    } catch (error) {
      if (Delegacion.responderErrorDelegacion(res, error)) return;
      console.error("Error al asignar rol:", error.message);
      res.status(500).json({ exito: false, mensaje: "Error al asignar rol" });
    }
  },
};

module.exports = ControladorUsuario;
module.exports.generarContraseñaTemporal = generarContraseñaTemporal;
