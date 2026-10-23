const Convenio = require('../models/convenio.model');
const Autorizador = require('../models/autorizador.model');
const Usuario = require('../../../portal/backend/models/usuario.model');
const { registrarAccion } = require('../../../auditoria/backend/services/auditoria.service');
const { idValido, fechaValida, numeroValido } = require('../utils/validacion');

// Lista corta validada en el backend (periodo es texto libre en BD, no hay CHECK): cantidad a
// facturar al cliente por periodo.
const PERIODOS_VALIDOS = ['mensual', 'bimestral', 'trimestral', 'unico'];
const ESTATUS_VALIDOS = ['pendiente_autorizacion', 'autorizado', 'rechazado', 'cancelado'];

const MSG_PROPIA = 'No puedes autorizar ni rechazar tu propio convenio';
const MSG_SIN_AUTORIDAD = 'No tienes autoridad para autorizar o rechazar convenios';
const MSG_ID_INVALIDO = 'id inválido';

function usuarioId(req) {
  return req.user?.usuario_id || req.user?.id;
}

async function nombreUsuario(id) {
  const usuario = await Usuario.buscarPorId(id);
  if (!usuario) return null;
  return [usuario.nombre, usuario.apellido].filter(Boolean).join(' ').trim() || null;
}

// Nunca lo propio (igual que vacaciones); después, super_admin o alguien activo en la lista de
// autorizadores. Devuelve el motivo de rechazo (403) o null si puede autorizar/rechazar.
async function motivoSinAutoridad(convenio, idUsuario, rolNombre) {
  if (String(convenio.creado_por_id) === String(idUsuario)) return MSG_PROPIA;
  if (rolNombre === 'super_admin') return null;
  const activo = await Autorizador.esActivo(idUsuario);
  return activo ? null : MSG_SIN_AUTORIDAD;
}

function validarProductos(productos) {
  if (!Array.isArray(productos) || productos.length === 0) {
    return 'Se requiere al menos una línea de producto';
  }
  for (const [i, p] of productos.entries()) {
    // R-7: un elemento null/no-objeto (p. ej. productos: [null]) lanzaba TypeError -> 500.
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      return `Línea ${i + 1}: formato inválido`;
    }
    if (!p.producto_descripcion || !String(p.producto_descripcion).trim()) {
      return `Línea ${i + 1}: producto_descripcion es requerido`;
    }
    if (p.cantidad_periodica === undefined || p.cantidad_periodica === null || p.cantidad_periodica === '') {
      return `Línea ${i + 1}: cantidad_periodica es requerida`;
    }
    if (Number.isNaN(Number(p.cantidad_periodica)) || Number(p.cantidad_periodica) <= 0) {
      return `Línea ${i + 1}: cantidad_periodica debe ser un número mayor a 0`;
    }
    if (!p.periodo || !PERIODOS_VALIDOS.includes(p.periodo)) {
      return `Línea ${i + 1}: periodo debe ser uno de: ${PERIODOS_VALIDOS.join(', ')}`;
    }
    // R-3: empaque/precio_compra/precio_venta/factor son opcionales (null) pero si vienen deben
    // ser números finitos >= 0; texto no numérico o negativos antes llegaban tal cual a Postgres.
    if (!numeroValido(p.empaque)) {
      return `Línea ${i + 1}: empaque debe ser un número mayor o igual a 0`;
    }
    if (!numeroValido(p.precio_compra)) {
      return `Línea ${i + 1}: precio_compra debe ser un número mayor o igual a 0`;
    }
    if (!numeroValido(p.precio_venta)) {
      return `Línea ${i + 1}: precio_venta debe ser un número mayor o igual a 0`;
    }
    if (!numeroValido(p.factor)) {
      return `Línea ${i + 1}: factor debe ser un número mayor o igual a 0`;
    }
  }
  return null;
}

function validarCabecera(datos) {
  if (!datos.cliente_nombre || !String(datos.cliente_nombre).trim()) {
    return 'cliente_nombre es requerido';
  }
  if (!datos.vendedor_nombre || !String(datos.vendedor_nombre).trim()) {
    return 'vendedor_nombre es requerido';
  }
  if (!datos.fecha_inicio) {
    return 'fecha_inicio es requerida';
  }
  // R-3: solo se verificaba que fecha_inicio existiera; un formato inválido llegaba a Postgres
  // (22007) y daba 500. Exige AAAA-MM-DD y que sea una fecha real (sin normalización de JS).
  if (!fechaValida(datos.fecha_inicio)) {
    return 'fecha_inicio debe tener formato AAAA-MM-DD y ser una fecha real';
  }
  if (datos.vigente_hasta) {
    if (!fechaValida(datos.vigente_hasta)) {
      return 'vigente_hasta debe tener formato AAAA-MM-DD y ser una fecha real';
    }
    if (datos.vigente_hasta < datos.fecha_inicio) {
      return 'vigente_hasta no puede ser anterior a fecha_inicio';
    }
  }
  return null;
}

const ControladorConvenio = {
  PERIODOS_VALIDOS,

  async listar(req, res) {
    try {
      // R-8: estatus de un valor fuera de la CHECK (o un arreglo, ?estatus=a&estatus=b) no debe
      // llegar a la query; antes podía dar 500.
      if (req.query.estatus && !ESTATUS_VALIDOS.includes(req.query.estatus)) {
        return res.status(400).json({ exito: false, mensaje: 'estatus inválido' });
      }
      const filtros = {
        estatus: req.query.estatus,
        cliente_codigo: req.query.cliente_codigo,
        cliente_nombre: req.query.cliente_nombre,
        vendedor_codigo: req.query.vendedor_codigo,
        vendedor_nombre: req.query.vendedor_nombre,
      };
      const convenios = await Convenio.listar(filtros);
      return res.json({ exito: true, datos: convenios });
    } catch (error) {
      console.error('Error al listar convenios:', error.message);
      return res.status(500).json({ exito: false, mensaje: 'Error al listar convenios' });
    }
  },

  async obtener(req, res) {
    try {
      if (!idValido(req.params.id)) return res.status(400).json({ exito: false, mensaje: MSG_ID_INVALIDO });
      const convenio = await Convenio.obtener(req.params.id);
      if (!convenio) return res.status(404).json({ exito: false, mensaje: 'Convenio no encontrado' });
      return res.json({ exito: true, datos: convenio });
    } catch (error) {
      console.error('Error al obtener convenio:', error.message);
      return res.status(500).json({ exito: false, mensaje: 'Error al obtener convenio' });
    }
  },

  async crear(req, res) {
    try {
      const { productos, ...datos } = req.body;
      const errorCabecera = validarCabecera(datos);
      if (errorCabecera) return res.status(400).json({ exito: false, mensaje: errorCabecera });
      const errorProductos = validarProductos(productos);
      if (errorProductos) return res.status(400).json({ exito: false, mensaje: errorProductos });

      const convenio = await Convenio.crear(datos, productos, usuarioId(req));

      await registrarAccion(req, 'comercial', 'comercial_convenios', convenio.id, 'crear', null, {
        cliente_nombre: convenio.cliente_nombre,
        vendedor_nombre: convenio.vendedor_nombre,
        estatus: convenio.estatus,
        productos: convenio.productos.length,
      });

      return res.status(201).json({ exito: true, datos: convenio });
    } catch (error) {
      console.error('Error al crear convenio:', error.message);
      return res.status(500).json({ exito: false, mensaje: 'Error al crear convenio' });
    }
  },

  async actualizar(req, res) {
    try {
      if (!idValido(req.params.id)) return res.status(400).json({ exito: false, mensaje: MSG_ID_INVALIDO });
      const { productos, ...datos } = req.body;
      const errorCabecera = validarCabecera(datos);
      if (errorCabecera) return res.status(400).json({ exito: false, mensaje: errorCabecera });
      const errorProductos = validarProductos(productos);
      if (errorProductos) return res.status(400).json({ exito: false, mensaje: errorProductos });

      // Decisión del humano [2026-10-23]: editar un convenio pendiente solo lo puede hacer el
      // creador o super_admin, aunque alguien más tenga el permiso general de edición de Convenios
      // (verificarPermiso ya pasó en la ruta; esto es una restricción adicional, no un sustituto).
      const existente = await Convenio.obtener(req.params.id);
      if (!existente) return res.status(404).json({ exito: false, mensaje: 'Convenio no encontrado' });
      const idUsuario = usuarioId(req);
      if (String(existente.creado_por_id) !== String(idUsuario) && req.user.rol_nombre !== 'super_admin') {
        return res.status(403).json({
          exito: false,
          mensaje: 'Solo el creador del convenio o super_admin puede editarlo',
        });
      }

      const { previo, convenio } = await Convenio.actualizar(req.params.id, datos, productos);
      if (!previo) return res.status(404).json({ exito: false, mensaje: 'Convenio no encontrado' });
      if (!convenio) {
        return res.status(409).json({
          exito: false,
          mensaje: 'Solo se puede editar un convenio mientras está pendiente de autorización',
        });
      }

      await registrarAccion(
        req,
        'comercial',
        'comercial_convenios',
        convenio.id,
        'actualizar',
        { cliente_nombre: previo.cliente_nombre, vendedor_nombre: previo.vendedor_nombre },
        { cliente_nombre: convenio.cliente_nombre, vendedor_nombre: convenio.vendedor_nombre },
      );

      return res.json({ exito: true, datos: convenio });
    } catch (error) {
      console.error('Error al actualizar convenio:', error.message);
      return res.status(500).json({ exito: false, mensaje: 'Error al actualizar convenio' });
    }
  },

  async autorizar(req, res) {
    try {
      if (!idValido(req.params.id)) return res.status(400).json({ exito: false, mensaje: MSG_ID_INVALIDO });
      const previo = await Convenio.obtener(req.params.id);
      if (!previo) return res.status(404).json({ exito: false, mensaje: 'Convenio no encontrado' });

      // R-5: la autoridad (403) se revisa ANTES del estado (409), para no revelar el estatus de
      // un convenio a quien de todos modos no podría autorizarlo ni rechazarlo.
      const idUsuario = usuarioId(req);
      const motivo = await motivoSinAutoridad(previo, idUsuario, req.user.rol_nombre);
      if (motivo) return res.status(403).json({ exito: false, mensaje: motivo });

      if (previo.estatus !== 'pendiente_autorizacion') {
        return res.status(409).json({
          exito: false,
          mensaje: 'Solo se puede autorizar un convenio pendiente de autorización',
        });
      }

      const autorizaNombre = (await nombreUsuario(idUsuario)) || req.user.nombre || req.user.correo;
      const convenio = await Convenio.autorizar(req.params.id, idUsuario, autorizaNombre);
      if (!convenio) {
        return res.status(409).json({
          exito: false,
          mensaje: 'Solo se puede autorizar un convenio pendiente de autorización',
        });
      }

      await registrarAccion(req, 'comercial', 'comercial_convenios', convenio.id, 'autorizar', { estatus: previo.estatus }, {
        estatus: convenio.estatus,
        autoriza_nombre: convenio.autoriza_nombre,
      });

      return res.json({ exito: true, datos: convenio });
    } catch (error) {
      console.error('Error al autorizar convenio:', error.message);
      return res.status(500).json({ exito: false, mensaje: 'Error al autorizar convenio' });
    }
  },

  async rechazar(req, res) {
    try {
      if (!idValido(req.params.id)) return res.status(400).json({ exito: false, mensaje: MSG_ID_INVALIDO });
      const { motivo_rechazo } = req.body;
      if (!motivo_rechazo || !String(motivo_rechazo).trim()) {
        return res.status(400).json({ exito: false, mensaje: 'El motivo de rechazo es obligatorio' });
      }

      const previo = await Convenio.obtener(req.params.id);
      if (!previo) return res.status(404).json({ exito: false, mensaje: 'Convenio no encontrado' });

      // R-5: igual que en autorizar(), 403 antes que 409.
      const idUsuario = usuarioId(req);
      const motivo = await motivoSinAutoridad(previo, idUsuario, req.user.rol_nombre);
      if (motivo) return res.status(403).json({ exito: false, mensaje: motivo });

      if (previo.estatus !== 'pendiente_autorizacion') {
        return res.status(409).json({
          exito: false,
          mensaje: 'Solo se puede rechazar un convenio pendiente de autorización',
        });
      }

      const autorizaNombre = (await nombreUsuario(idUsuario)) || req.user.nombre || req.user.correo;
      const convenio = await Convenio.rechazar(req.params.id, idUsuario, autorizaNombre, motivo_rechazo);
      if (!convenio) {
        return res.status(409).json({
          exito: false,
          mensaje: 'Solo se puede rechazar un convenio pendiente de autorización',
        });
      }

      await registrarAccion(req, 'comercial', 'comercial_convenios', convenio.id, 'rechazar', { estatus: previo.estatus }, {
        estatus: convenio.estatus,
        motivo_rechazo: convenio.motivo_rechazo,
      });

      return res.json({ exito: true, datos: convenio });
    } catch (error) {
      console.error('Error al rechazar convenio:', error.message);
      return res.status(500).json({ exito: false, mensaje: 'Error al rechazar convenio' });
    }
  },

  async cancelar(req, res) {
    try {
      if (!idValido(req.params.id)) return res.status(400).json({ exito: false, mensaje: MSG_ID_INVALIDO });
      const previo = await Convenio.obtener(req.params.id);
      if (!previo) return res.status(404).json({ exito: false, mensaje: 'Convenio no encontrado' });
      if (previo.estatus === 'cancelado') {
        return res.status(409).json({ exito: false, mensaje: 'El convenio ya está cancelado' });
      }

      // Decisión del humano [2026-10-23]: cancelar un convenio YA autorizado exige estar en la
      // lista de autorizadores activos o ser super_admin (mismo criterio que autorizar/rechazar,
      // "nunca lo propio" incluido); cancelar uno pendiente o rechazado no cambia (cualquiera con
      // permiso de edición, igual que antes). `tieneAutoridad` se calcula SIEMPRE (no solo cuando
      // previo.estatus === 'autorizado') para que la guarda del modelo sea atómica incluso si el
      // convenio pasa a autorizado entre esta lectura y el UPDATE (ver convenio.model.js#cancelar).
      const idUsuario = usuarioId(req);
      const motivo = await motivoSinAutoridad(previo, idUsuario, req.user.rol_nombre);
      const tieneAutoridad = !motivo;
      if (previo.estatus === 'autorizado' && !tieneAutoridad) {
        return res.status(403).json({
          exito: false,
          mensaje: 'Solo un autorizador activo o super_admin puede cancelar un convenio ya autorizado',
        });
      }

      const convenio = await Convenio.cancelar(req.params.id, tieneAutoridad);
      if (!convenio) {
        return res.status(409).json({ exito: false, mensaje: 'El convenio ya está cancelado' });
      }

      await registrarAccion(req, 'comercial', 'comercial_convenios', convenio.id, 'cancelar', { estatus: previo.estatus }, {
        estatus: convenio.estatus,
      });

      return res.json({ exito: true, datos: convenio });
    } catch (error) {
      console.error('Error al cancelar convenio:', error.message);
      return res.status(500).json({ exito: false, mensaje: 'Error al cancelar convenio' });
    }
  },
};

module.exports = ControladorConvenio;
