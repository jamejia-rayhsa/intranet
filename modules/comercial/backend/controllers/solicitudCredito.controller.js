const axios = require('axios');
const SolicitudCredito = require('../models/solicitudCredito.model');
const { registrarAccion } = require('../../../auditoria/backend/services/auditoria.service');

// Mapea una solicitud de crédito al string TEXTO2_X de MBA3 (CODE_s=05, Clientes)
// Formato: 66 campos separados por pipe |
// Ref: MBA3_API.md — Sección "CREACIÓN Y ACTUALIZACIÓN DE CLIENTES"
function construirTexto2xCliente(s) {
  const df = s.domicilio_fiscal || {};
  const contactos = s.contactos || [];
  const cond = s.condiciones_comerciales || {};
  const primerContacto = contactos[0] || {};

  const codigoCliente = (s.numero_solicitud || s.id.substring(0, 8)).replace(/-/g, '').substring(0, 8);
  const nombreCliente = (s.razon_social || '').substring(0, 30);
  const rfc = (s.rfc || '').substring(0, 15);
  const tel1 = (primerContacto.telefono || '').substring(0, 14);
  const tel2 = (primerContacto.celular || '').substring(0, 14);
  const dir1 = ([df.calle, df.numero_exterior].filter(Boolean).join(' ')).substring(0, 80);
  const dir2 = (df.colonia || '').substring(0, 80);
  const dir3 = (df.municipio || '').substring(0, 80);
  const cp = (df.codigo_postal || '').substring(0, 10);
  const email = (primerContacto.email || '').substring(0, 30);
  const limCred1 = cond.monto_credito || 0;
  const terminos = cond.dias_credito || 0;
  const moneda = s.moneda === 'USD' ? 'DO' : 'MN';
  const fechaCreacion = s.fecha_creacion
    ? new Date(s.fecha_creacion).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : '';
  const sucursal = (s.sucursal || 'PRI').substring(0, 3);
  const nombreExtenso = (s.razon_social || '').substring(0, 60);
  const municipio = (df.municipio || '').substring(0, 30);
  const colonia = (df.colonia || '').substring(0, 15);
  const giro = (s.giro_negocio || '').substring(0, 5);
  const regimen = (s.regimen_fiscal || '').substring(0, 5);

  // 66 campos (campos vacíos = string vacío entre pipes)
  const campos = [
    codigoCliente,   // 1 Código Cliente
    nombreCliente,   // 2 Nombre Cliente
    rfc,             // 3 Identificación (RFC)
    tel1,            // 4 Teléfono 1
    tel2,            // 5 Teléfono 2
    '',              // 6 Fax
    dir1,            // 7 Dirección 1
    dir2,            // 8 Dirección 2
    dir3,            // 9 Dirección 3
    'MEX',           // 10 Código País
    '',              // 11 Código Estado
    '',              // 12 Código Ciudad
    '',              // 13 Código Sector
    cp,              // 14 Código Postal
    email,           // 15 E-Mail
    limCred1,        // 16 Límite Crédito 1
    0,               // 17 Límite Crédito 2
    terminos,        // 18 Término de Pagos (días)
    moneda,          // 19 Código Moneda
    '',              // 20 Código Zona
    '',              // 21 Código Precio Negociado
    '',              // 22 Código Tipo Cliente
    '',              // 23 Código Vendedor
    '',              // 24 Responsable de la Cuenta
    '',              // 25 Memo
    fechaCreacion,   // 26 Fecha Creación
    'L',             // 27 Localización (L=Local)
    nombreExtenso,   // 28 Nombre Extenso (Razón Social)
    sucursal,        // 29 Código Sucursal
    '',              // 30 Código Cuenta Contable
    1,               // 31 Lista de Precios
    6,               // 32 Nivel de Riesgo (6=ninguno)
    '',              // 33 Código Transporte
    '0;0;0;0;0;',   // 34 Impuestos
    '',              // 35 Código cliente relacionado
    '',              // 36 Código Grupo Descuentos
    0,               // 37 Fecha Acuse
    0,               // 38 Productos sin Negociación
    0,               // 39 Grupo Impresión Facturas
    0,               // 40 Precio Convertido 1
    0,               // 41 Precio Convertido 2
    0,               // 42 Nombre Extenso (para impresión)
    '',              // 43 Número Exterior
    '',              // 44 Número Interior
    colonia,         // 45 Colonia
    '',              // 46 Localidad
    '',              // 47 Número Global Cliente
    '',              // 48 Código Secundario Cliente
    municipio,       // 49 Municipio
    0,               // 50 Moneda Única
    '',              // 51 Identificación Fiscal 2
    '',              // 52 Código Categoría
    giro,            // 53 Código Giro del Negocio
    regimen,         // 54 Código Régimen Fiscal
    0,               // 55 Cobro contra Entrega
    '',              // 56 Código Grupo de Impuestos
    0,               // 57 Cliente Inactivo
    0,               // 58 Cliente Control
    0,               // 59 Estatus No Venta
    '',              // 60 Motivo
    1,               // 61 Visualización (1 = Sí visualiza)
    '',              // 62 Tipo de Agrupación en Impresión
    '',              // 63 Código de Agrupación de Impresión
    email,           // 64 Email Fiscal
    '',              // 65 Cuenta Contable Reserva
    '',              // 66 Referencia / Ubigeo
  ];

  return campos.join('|');
}

const ControladorSolicitudCredito = {
  async listar(req, res) {
    try {
      const filtros = {
        estado: req.query.estado,
        tipo_cliente: req.query.tipo_cliente,
        buscar: req.query.buscar,
        pagina: req.query.pagina,
        limite: req.query.limite,
      };
      const resultado = await SolicitudCredito.listar(filtros);
      return res.json({ exito: true, datos: resultado });
    } catch (error) {
      return res.status(500).json({ exito: false, mensaje: 'Error al listar solicitudes', error: error.message });
    }
  },

  async obtener(req, res) {
    try {
      const solicitud = await SolicitudCredito.obtener(req.params.id);
      if (!solicitud) return res.status(404).json({ exito: false, mensaje: 'Solicitud no encontrada' });
      return res.json({ exito: true, datos: solicitud });
    } catch (error) {
      return res.status(500).json({ exito: false, mensaje: 'Error al obtener solicitud', error: error.message });
    }
  },

  async crear(req, res) {
    try {
      const { razon_social, rfc, tipo_cliente } = req.body;
      if (!razon_social || !rfc || !tipo_cliente) {
        return res.status(400).json({ exito: false, mensaje: 'Razón social, RFC y tipo de cliente son requeridos' });
      }
      if (!['INDUSTRIA', 'DISTRIBUCION'].includes(tipo_cliente)) {
        return res.status(400).json({ exito: false, mensaje: 'tipo_cliente debe ser INDUSTRIA o DISTRIBUCION' });
      }
      if (rfc.length !== 12 && rfc.length !== 13) {
        return res.status(400).json({ exito: false, mensaje: 'RFC debe tener 12 (moral) o 13 (física) caracteres' });
      }

      const solicitud = await SolicitudCredito.crear({
        ...req.body,
        usuario_creador_id: req.user?.usuario_id || req.user?.id,
      });

      await registrarAccion(req, 'comercial', 'solicitudes_credito', solicitud.id, 'crear', null, {
        numero_solicitud: solicitud.numero_solicitud,
        razon_social: solicitud.razon_social,
        rfc: solicitud.rfc,
        tipo_cliente: solicitud.tipo_cliente,
        estado: solicitud.estado,
      });

      return res.status(201).json({ exito: true, datos: solicitud });
    } catch (error) {
      return res.status(500).json({ exito: false, mensaje: 'Error al crear solicitud', error: error.message });
    }
  },

  async actualizar(req, res) {
    try {
      const previa = await SolicitudCredito.obtener(req.params.id);
      if (!previa) return res.status(404).json({ exito: false, mensaje: 'Solicitud no encontrada' });

      const usuario_id = req.user?.usuario_id || req.user?.id;
      const actualizada = await SolicitudCredito.actualizar(req.params.id, req.body, usuario_id);

      await registrarAccion(req, 'comercial', 'solicitudes_credito', req.params.id, 'actualizar', {
        razon_social: previa.razon_social,
        estado: previa.estado,
      }, {
        razon_social: actualizada.razon_social,
        estado: actualizada.estado,
      });

      return res.json({ exito: true, datos: actualizada });
    } catch (error) {
      return res.status(500).json({ exito: false, mensaje: 'Error al actualizar solicitud', error: error.message });
    }
  },

  async cambiarEstado(req, res) {
    try {
      const { estado } = req.body;
      const estadosValidos = ['borrador', 'guardada', 'enviada_mba3', 'aprobada', 'rechazada'];
      if (!estadosValidos.includes(estado)) {
        return res.status(400).json({ exito: false, mensaje: 'Estado inválido' });
      }
      const previa = await SolicitudCredito.obtener(req.params.id);
      if (!previa) return res.status(404).json({ exito: false, mensaje: 'Solicitud no encontrada' });

      const usuario_id = req.user?.usuario_id || req.user?.id;
      const actualizada = await SolicitudCredito.actualizar(req.params.id, { estado }, usuario_id);

      await registrarAccion(req, 'comercial', 'solicitudes_credito', req.params.id, 'cambiar_estado',
        { estado: previa.estado }, { estado });

      return res.json({ exito: true, datos: actualizada });
    } catch (error) {
      return res.status(500).json({ exito: false, mensaje: 'Error al cambiar estado', error: error.message });
    }
  },

  async estadisticas(req, res) {
    try {
      const stats = await SolicitudCredito.estadisticas();
      return res.json({ exito: true, datos: stats });
    } catch (error) {
      return res.status(500).json({ exito: false, mensaje: 'Error al obtener estadísticas', error: error.message });
    }
  },

  async obtenerHtmlPdf(req, res) {
    try {
      const solicitud = await SolicitudCredito.obtener(req.params.id);
      if (!solicitud) return res.status(404).json({ exito: false, mensaje: 'Solicitud no encontrada' });

      return res.json({ exito: true, datos: solicitud });
    } catch (error) {
      return res.status(500).json({ exito: false, mensaje: 'Error', error: error.message });
    }
  },

  async sincronizarMba3(req, res) {
    try {
      const MBA3_URL = process.env.MBA3_URL;
      const MBA3_CORP = process.env.MBA3_CORP;
      const MBA3_PASSWORD = process.env.MBA3_PASSWORD;
      const MBA3_SUCURSAL = process.env.MBA3_SUCURSAL_ORIGEN || 'PRI';
      const MBA3_USUARIO = process.env.MBA3_USUARIO_API || '2';

      if (!MBA3_URL || !MBA3_CORP || !MBA3_PASSWORD) {
        return res.status(503).json({
          exito: false,
          mensaje: 'Integración MBA3 no configurada. Configure MBA3_URL, MBA3_CORP y MBA3_PASSWORD en las variables de entorno.',
        });
      }

      const solicitud = await SolicitudCredito.obtener(req.params.id);
      if (!solicitud) return res.status(404).json({ exito: false, mensaje: 'Solicitud no encontrada' });

      if (!['guardada', 'aprobada'].includes(solicitud.estado)) {
        return res.status(400).json({
          exito: false,
          mensaje: 'Solo se pueden sincronizar solicitudes en estado "guardada" o "aprobada"',
        });
      }

      const texto2x = construirTexto2xCliente(solicitud);
      const idConsulta = `${MBA3_CORP}_${solicitud.numero_solicitud}`.substring(0, 50);
      const esActualizacion = solicitud.sincronizado_mba3 ? 1 : 0;

      // Web Service MBA3: wsAPIS/api_wr — CODE_s=05 (Clientes)
      // Ref: MBA3_API.md sección "CREACIÓN Y ACTUALIZACIÓN DE CLIENTES"
      const params = new URLSearchParams({
        CORP_s: MBA3_CORP,
        ap_pass: MBA3_PASSWORD,
        CODE_s: '05',
        GROUP_CATEGORY_s: 'API',
        INTEGER_1: '1',
        TEXTO1_10: MBA3_USUARIO,
        TEXTO1_24: req.socket?.remoteAddress || '0.0.0.0',
        TEXTO2_X: texto2x,
        NumDoc_s: solicitud.numero_solicitud,
        Local_origen: MBA3_SUCURSAL,
        Local_destino: MBA3_SUCURSAL,
        ORIGIN: MBA3_SUCURSAL,
        IDConsulta_s: idConsulta,
        Opcion_i: String(esActualizacion),
      });

      const respuesta = await axios.get(`${MBA3_URL}/wsAPIS/api_wr`, {
        params,
        timeout: 15000,
      });

      const usuario_id = req.user?.usuario_id || req.user?.id;

      if (respuesta.status === 200) {
        await SolicitudCredito.actualizar(req.params.id, {
          sincronizado_mba3: true,
          referencia_mba3: idConsulta,
          estado: 'enviada_mba3',
        }, usuario_id);

        await registrarAccion(req, 'comercial', 'solicitudes_credito', req.params.id, 'sincronizar_mba3', null, {
          referencia_mba3: idConsulta,
          estado: 'enviada_mba3',
        });

        return res.json({
          exito: true,
          datos: { referencia_mba3: idConsulta, mensaje: 'Solicitud enviada a MBA3 correctamente' },
        });
      }

      return res.status(502).json({ exito: false, mensaje: 'MBA3 no procesó la solicitud', detalle: respuesta.data });
    } catch (error) {
      const esConexion = ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].includes(error.code);
      return res.status(esConexion ? 503 : 500).json({
        exito: false,
        mensaje: esConexion
          ? 'No se pudo conectar con el servidor MBA3. Verifique que el servicio esté disponible.'
          : 'Error al sincronizar con MBA3',
        error: error.message,
      });
    }
  },
};

module.exports = ControladorSolicitudCredito;
