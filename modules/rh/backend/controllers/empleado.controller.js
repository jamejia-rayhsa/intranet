const Empleado = require("../models/empleado.model");
const { auditarImportacion } = require("../utils/auditoriaImportacion");
const { describirErrorSql } = require("../utils/logSeguro");
const { esImportacionEnCurso, responderImportacionEnCurso } = require("../utils/candadosImportacion");
const {
  validarCuerpoImportacion, validarParesJefes, normalizarClave,
} = require("../utils/importarEmpleados");
const Ubicacion = require("../models/ubicacion.model");
const Usuario = require("../../../portal/backend/models/usuario.model");
const SupabaseAdmin = require("../../../portal/backend/services/supabaseAdmin.service");
const {
  generarContraseñaTemporal,
} = require("../../../portal/backend/utils/contrasenaTemporal");
const Delegacion = require("../../../portal/backend/services/delegacionPermisos");
const { grupo } = require("../config/database");
const {
  registrarAccion,
} = require("../../../auditoria/backend/services/auditoria.service");

// Deshace el alta de usuario si el alta del empleado no se completó.
async function compensarUsuario(authUid, usuarioId) {
  if (usuarioId) {
    try {
      await Usuario.eliminar(usuarioId);
    } catch (e) {
      console.error("No se pudo revertir el usuario local:", e.message);
    }
  }
  if (authUid) {
    try {
      await SupabaseAdmin.eliminarUsuario(authUid);
    } catch (e) {
      console.error("No se pudo revertir el usuario en Supabase Auth:", e.message);
    }
  }
}

const ControladorEmpleado = {
  async crear(req, res) {
    // Para compensar si falla algo después de crear el usuario
    let authUidCreado = null;
    let usuarioIdCreado = null;
    try {
      const {
        nombre,
        apellido_paterno,
        apellido_materno,
        fecha_nacimiento,
        curp,
        rfc,
        nss,
        genero,
        estado_civil,
        escolaridad,
        estado_nacimiento,
        celular_personal,
        correo_personal,
        telefono_emergencia,
        parentesco_emergencia,
        contacto_emergencia,
        calle,
        colonia,
        codigo_postal,
        municipio,
        estado_residencia,
        numero_nomina,
        fecha_imss,
        fecha_renovacion,
        tipo_contrato,
        celular_corporativo,
        jefe_inmediato_id,
        banco,
        clabe,
        cp_fiscal,
        infonavit,
        fonacot,
        puesto_id,
        departamento_id,
        ubicacion_id,
        fecha_ingreso,
        estatus,
        crear_usuario,
        correo,
        contraseña,
        rol_id,
        roles,
      } = req.body;

      if (!nombre || !apellido_paterno) {
        return res.status(400).json({
          exito: false,
          mensaje: "Nombre y apellido paterno son obligatorios",
        });
      }

      let usuarioId = null;
      let contraseñaTemporalGenerada = null;

      if (crear_usuario) {
        if (!correo) {
          return res.status(400).json({
            exito: false,
            mensaje: "El correo es obligatorio para crear un usuario",
          });
        }

        // Los roles iniciales siguen la MISMA regla que el alta de usuarios del portal (nadie que no
        // sea super_admin asigna super_admin/rh_admin/tickets_admin). Se validan ANTES de crear nada
        // (ni GoTrue ni fila local).
        if (rol_id !== undefined && rol_id !== null && rol_id !== "" && !Delegacion.esEnteroInt4(rol_id)) {
          return res.status(400).json({ exito: false, mensaje: "rol_id no válido" });
        }
        if (roles !== undefined && roles !== null && !Array.isArray(roles)) {
          return res.status(400).json({ exito: false, mensaje: "roles debe ser un array" });
        }
        const rolesAAsignar = await Delegacion.validarRolesAsignables(
          grupo,
          req.user,
          rol_id ? [rol_id] : roles || [],
        );

        const existente = await Usuario.buscarPorCorreo(correo);
        if (existente) {
          return res.status(400).json({
            exito: false,
            mensaje: "Ya existe un usuario con ese correo",
          });
        }

        // Contraseña: la del admin o una temporal aleatoria (se devuelve una sola vez)
        const contraseñaInicial = contraseña || generarContraseñaTemporal();
        if (!contraseña) contraseñaTemporalGenerada = contraseñaInicial;

        // GoTrue primero (única fuente de la contraseña); luego el INSERT local
        const nuevoAuth = await SupabaseAdmin.crearUsuario({
          correo: correo.trim().toLowerCase(),
          password: contraseñaInicial,
          metadata: { nombre, apellido: apellido_paterno },
        });
        authUidCreado = nuevoAuth.id;

        const usuario = await Usuario.crear({
          correo,
          nombre,
          apellido: apellido_paterno,
          auth_tipo: "local",
          auth_uid: authUidCreado,
          activo: true,
        });
        usuarioIdCreado = usuario.id;
        await Usuario.actualizar(usuario.id, {
          requiere_cambio_password: true,
        });

        usuarioId = usuario.id;

        // Asignar rol (acepta rol_id individual o array roles; ya validados arriba)
        if (rolesAAsignar.length > 0) {
          const client = await grupo.connect();
          try {
            await client.query("BEGIN");
            for (const rolId of rolesAAsignar) {
              await client.query(
                "INSERT INTO usuario_rol (usuario_id, rol_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                [usuarioId, rolId],
              );
            }
            await client.query("COMMIT");
          } catch (error) {
            await client.query("ROLLBACK");
            throw error;
          } finally {
            client.release();
          }
        }
      }

      let folioAsignado = numero_nomina || null;
      if (!folioAsignado && ubicacion_id) {
        folioAsignado = await Ubicacion.siguienteFolio(ubicacion_id);
      }

      const empleado = await Empleado.crear({
        usuario_id: usuarioId,
        nombre,
        apellido_paterno,
        apellido_materno,
        fecha_nacimiento,
        curp,
        rfc,
        nss,
        genero,
        estado_civil,
        escolaridad,
        estado_nacimiento,
        celular_personal,
        correo_personal,
        telefono_emergencia,
        parentesco_emergencia,
        contacto_emergencia,
        calle,
        colonia,
        codigo_postal,
        municipio,
        estado_residencia,
        numero_nomina: folioAsignado,
        fecha_imss,
        fecha_renovacion,
        tipo_contrato,
        celular_corporativo,
        jefe_inmediato_id,
        banco,
        clabe,
        cp_fiscal,
        infonavit,
        fonacot,
        puesto_id: puesto_id || null,
        departamento_id: departamento_id || null,
        ubicacion_id: ubicacion_id || null,
        fecha_ingreso,
        estatus,
      });

      try {
        await registrarAccion(
          req,
          "rh",
          "empleados",
          empleado.id.toString(),
          "INSERT",
          null,
          empleado,
        );
      } catch (error) {
        console.error("Error al registrar auditoría:", error.message);
      }

      res.status(201).json({
        exito: true,
        datos: empleado,
        ...(contraseñaTemporalGenerada && {
          contraseña_temporal: contraseñaTemporalGenerada,
        }),
        mensaje: "Empleado creado exitosamente",
      });
    } catch (error) {
      if (Delegacion.responderErrorDelegacion(res, error)) return;
      await compensarUsuario(authUidCreado, usuarioIdCreado);
      res.status(400).json({
        exito: false,
        mensaje: "Error al crear empleado",
        error: error.message,
      });
    }
  },

  async listar(req, res) {
    try {
      const {
        pagina = 1,
        limite = 20,
        estatus,
        departamento,
        busqueda,
      } = req.query;

      const filtros = {
        pagina: parseInt(pagina),
        limite: parseInt(limite),
        estatus,
        departamento,
        busqueda,
      };

      const empleados = await Empleado.listar(filtros);
      const total = await Empleado.contar(filtros);

      res.json({
        exito: true,
        datos: {
          empleados,
          total,
          pagina: parseInt(pagina),
          limite: parseInt(limite),
          paginas_totales: Math.ceil(total / limite),
        },
      });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al listar empleados",
        error: error.message,
      });
    }
  },

  async obtener(req, res) {
    try {
      const empleado = await Empleado.obtenerPorId(req.params.id);

      if (!empleado) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Empleado no encontrado" });
      }

      res.json({ exito: true, datos: empleado });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al obtener empleado",
        error: error.message,
      });
    }
  },

  async obtenerPorUsuario(req, res) {
    try {
      const empleado = await Empleado.obtenerPorUsuarioId(req.user.usuario_id);

      if (!empleado) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "No se encontró perfil de empleado" });
      }

      res.json({ exito: true, datos: empleado });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al obtener perfil",
        error: error.message,
      });
    }
  },

  async actualizar(req, res) {
    try {
      const anterior = await Empleado.obtenerPorId(req.params.id);

      if (!anterior) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Empleado no encontrado" });
      }

      const empleado = await Empleado.actualizar(req.params.id, req.body);

      try {
        await registrarAccion(
          req,
          "rh",
          "empleados",
          empleado.id.toString(),
          "UPDATE",
          anterior,
          empleado,
        );
      } catch (error) {
        console.error("Error al registrar auditoría:", error.message);
      }

      res.json({
        exito: true,
        datos: empleado,
        mensaje: "Empleado actualizado exitosamente",
      });
    } catch (error) {
      res.status(400).json({
        exito: false,
        mensaje: "Error al actualizar empleado",
        error: error.message,
      });
    }
  },

  async marcarBaja(req, res) {
    try {
      const { motivo } = req.body;

      const anterior = await Empleado.obtenerPorId(req.params.id);

      if (!anterior) {
        return res
          .status(404)
          .json({ exito: false, mensaje: "Empleado no encontrado" });
      }

      const empleado = await Empleado.marcarBaja(req.params.id, motivo);

      try {
        await registrarAccion(
          req,
          "rh",
          "empleados",
          empleado.id.toString(),
          "UPDATE",
          { estatus: anterior.estatus },
          { estatus: "baja", motivo_baja: motivo },
        );
      } catch (error) {
        console.error("Error al registrar auditoría:", error.message);
      }

      res.json({
        exito: true,
        datos: empleado,
        mensaje: "Empleado dado de baja exitosamente",
      });
    } catch (error) {
      res.status(400).json({
        exito: false,
        mensaje: "Error al dar de baja empleado",
        error: error.message,
      });
    }
  },

  async listarSubordinados(req, res) {
    try {
      const subordinados = await Empleado.listarPorJefe(req.params.jefeId);
      res.json({ exito: true, datos: subordinados });
    } catch (error) {
      res.status(500).json({
        exito: false,
        mensaje: "Error al listar subordinados",
        error: error.message,
      });
    }
  },

  async importar(req, res) {
    try {
      const { filas, modo } = req.body || {};
      const problema = validarCuerpoImportacion(filas);
      if (problema) return res.status(400).json({ exito: false, mensaje: problema });
      if (modo !== undefined && modo !== "omitir" && modo !== "actualizar") {
        return res.status(400).json({ exito: false, mensaje: "Modo de importación no válido (usa 'omitir' o 'actualizar')" });
      }

      // Catálogos completos (son tablas pequeñas): la comparación sin acentos ni mayúsculas se hace en JS.
      const [resPuestos, resDeptos, resUbicaciones] = await Promise.all([
        grupo.query("SELECT id, nombre FROM puestos ORDER BY id"),
        grupo.query("SELECT id, nombre FROM departamentos ORDER BY id"),
        grupo.query("SELECT id, nombre FROM ubicaciones WHERE activo IS NOT FALSE ORDER BY id"),
      ]);
      const mapa = (filasCatalogo) => {
        const m = {};
        for (const r of filasCatalogo.rows) {
          const k = normalizarClave(r.nombre);
          if (k && m[k] === undefined) m[k] = r.id;
        }
        return m;
      };

      const resultado = await Empleado.importarLote(
        filas,
        { puestos: mapa(resPuestos), departamentos: mapa(resDeptos), ubicaciones: mapa(resUbicaciones) },
        { modo: modo || "omitir" }
      );

      await auditarImportacion(req, "empleados", "IMPORTAR_EMPLEADOS", {
        filas_recibidas: filas.length,
        modo: modo || "omitir",
        insertados: resultado.insertados,
        actualizados: resultado.actualizados,
        sin_cambios: resultado.sin_cambios,
        cuentas_vinculadas: resultado.cuentas_vinculadas,
        duplicados: resultado.duplicados,
        errores: resultado.errores.length,
        advertencias: resultado.advertencias.length + resultado.advertencias_omitidas,
      });

      res.json({ exito: true, datos: resultado });
    } catch (error) {
      if (esImportacionEnCurso(error)) return responderImportacionEnCurso(res);
      console.error(`[empleados] importar: ${describirErrorSql(error)}`);
      res.status(500).json({ exito: false, mensaje: 'Error al importar empleados' });
    }
  },

  // Lista completa en el formato de la plantilla ("Descargar empleados actuales"). Contiene CURP, NSS, RFC y CLABE:
  // mismo permiso que el listado de empleados y queda auditado (solo el número de filas).
  async exportarParaImportacion(req, res) {
    try {
      const empleados = await Empleado.listarParaExportar();
      await auditarImportacion(req, "empleados", "EXPORTAR_EMPLEADOS", { filas: empleados.length });
      res.json({ exito: true, datos: { empleados } });
    } catch (error) {
      console.error(`[empleados] exportar: ${describirErrorSql(error)}`);
      res.status(500).json({ exito: false, mensaje: "Error al exportar empleados" });
    }
  },

  // Segunda pasada de la importación: jefe inmediato por número de nómina o CURP (el jefe puede venir en otro lote).
  async importarJefes(req, res) {
    try {
      const { pares } = req.body || {};
      const { error, validos } = validarParesJefes(pares);
      if (error) return res.status(400).json({ exito: false, mensaje: error });

      const resultado = await Empleado.asignarJefes(validos);

      await auditarImportacion(req, "empleados", "IMPORTAR_EMP_JEFES", {
        pares_recibidos: pares.length,
        asignados: resultado.asignados,
        sin_cambios: resultado.sin_cambios,
        no_encontrados: resultado.no_encontrados,
        ciclos: resultado.ciclos,
        conflictos: resultado.conflictos,
      });

      res.json({ exito: true, datos: resultado });
    } catch (error) {
      if (esImportacionEnCurso(error)) return responderImportacionEnCurso(res);
      console.error(`[empleados] importar jefes: ${describirErrorSql(error)}`);
      res.status(500).json({ exito: false, mensaje: 'Error al asignar los jefes inmediatos' });
    }
  },
};

module.exports = ControladorEmpleado;
