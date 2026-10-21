// Administración de las llaves de la ingesta (JWT + permiso Ingesta; rh_admin y super_admin) y consulta de
// lotes / re-vinculación de marcas huérfanas. La llave en claro SOLO viaja en la respuesta del alta y de la
// rotación (Cache-Control: no-store): no se guarda, no se audita y no se registra en logs.
const Llave = require("../models/llaveIngesta.model");
const Ingesta = require("../models/ingesta.model");
const Auditoria = require("../../../auditoria/backend/models/auditoria.model");
const { ErrorAsistencia } = require("../utils/erroresAsistencia");
const { esIdValido, tieneControl } = require("../utils/turnoValidacion");
const { validarListaIps } = require("../utils/ipPermitida");
const { interpretarInstante } = require("../utils/marcaValidacion");
const { ipDeLaPeticion } = require("../middleware/llaveIngesta.middleware");

const MSG_ID = "El identificador debe ser un número entero positivo";
const ORIGENES_VALIDOS = ["biotime"];
const SOLAPE_POR_DEFECTO_HORAS = 24;
const SOLAPE_MAXIMO_HORAS = 720;
const LIMITE_LOTES_MAXIMO = 200;
const LIMITE_REVINCULAR_MAXIMO = 50000;

// Lo único que llega a la bitácora: nunca hash_llave ni la llave
const resumen = (fila) =>
  fila && {
    id: fila.id,
    nombre: fila.nombre,
    origen: fila.origen,
    prefijo: fila.prefijo,
    estado: fila.estado,
    vigente_desde: fila.vigente_desde,
    vigente_hasta: fila.vigente_hasta,
    ips_permitidas: fila.ips_permitidas,
  };

// Se usa el modelo de auditoría y la IP resuelta por Express (trust proxy), recortada a 45: con
// registrarAccion una X-Forwarded-For larga haría fallar el INSERT y se perdería el registro (F-AS2-3).
async function auditar(req, accion, registroId, previos, nuevos, tabla = "asistencia_llaves") {
  try {
    const ip = ipDeLaPeticion(req);
    await Auditoria.crear({
      usuario_id: req.user && (req.user.usuario_id || req.user.id),
      modulo: "rh",
      tabla,
      registro_id: String(registroId),
      accion,
      valores_previos: previos || null,
      valores_nuevos: nuevos || null,
      ip_origen: ip ? ip.slice(0, 45) : null,
      user_agent: req.headers["user-agent"] ? String(req.headers["user-agent"]).slice(0, 255) : null,
    });
  } catch (error) {
    console.error("[Llaves] Error al registrar auditoría:", error.message);
  }
}

function responderError(res, contexto, error) {
  if (error instanceof ErrorAsistencia) {
    return res.status(error.estado).json({ exito: false, mensaje: error.message });
  }
  console.error(`[Llaves] ${contexto}:`, error.message);
  return res.status(500).json({ exito: false, mensaje: `Error al ${contexto}` });
}

const quienCrea = (req) => req.user && (req.user.usuario_id || req.user.id);

function validarNombre(valor, obligatorio) {
  if (valor === undefined && !obligatorio) return { valor: undefined };
  if (typeof valor !== "string") return { error: "nombre es obligatorio y debe ser texto" };
  const nombre = valor.trim();
  if (nombre === "" || nombre.length > 100) return { error: "nombre debe tener entre 1 y 100 caracteres" };
  if (tieneControl(nombre)) return { error: "nombre contiene caracteres no permitidos" };
  return { valor: nombre };
}

/** vigente_hasta opcional: ISO 8601 con zona y en el futuro. */
function validarVencimiento(valor) {
  if (valor === undefined || valor === null) return { valor: null };
  const r = interpretarInstante(valor, "vigente_hasta");
  if (r.motivo) return { error: r.motivo };
  if (r.fecha.getTime() <= Date.now()) return { error: "vigente_hasta debe ser una fecha futura" };
  return { valor: r.fecha.toISOString() };
}

function respuestaConLlave(res, estado, fila, llave, mensaje, extra = {}) {
  res.set("Cache-Control", "no-store");
  return res.status(estado).json({
    exito: true,
    datos: { ...fila, llave, ...extra },
    mensaje,
    aviso: "Guarda la llave ahora en un gestor de contraseñas: no se vuelve a mostrar",
  });
}

const LlaveControlador = {
  async listar(_req, res) {
    try {
      res.json({ exito: true, datos: await Llave.listar() });
    } catch (error) {
      responderError(res, "listar las llaves", error);
    }
  },

  async crear(req, res) {
    const cuerpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const nombre = validarNombre(cuerpo.nombre, true);
    if (nombre.error) return res.status(400).json({ exito: false, mensaje: nombre.error });
    const origen = cuerpo.origen === undefined ? "biotime" : cuerpo.origen;
    if (!ORIGENES_VALIDOS.includes(origen)) {
      return res.status(400).json({ exito: false, mensaje: `origen debe ser uno de: ${ORIGENES_VALIDOS.join(", ")}` });
    }
    const ips = validarListaIps(cuerpo.ips_permitidas === undefined ? [] : cuerpo.ips_permitidas);
    if (ips.error) return res.status(400).json({ exito: false, mensaje: ips.error });
    const vence = validarVencimiento(cuerpo.vigente_hasta);
    if (vence.error) return res.status(400).json({ exito: false, mensaje: vence.error });

    try {
      const { fila, llave } = await Llave.enTransaccion((cliente) =>
        Llave.insertar(
          { nombre: nombre.valor, origen, ips_permitidas: ips.lista, vigente_hasta: vence.valor, creado_por: quienCrea(req) },
          cliente,
        ),
      );
      await auditar(req, "CREAR_LLAVE", fila.id, null, resumen(fila));
      return respuestaConLlave(res, 201, fila, llave, "Llave creada");
    } catch (error) {
      return responderError(res, "crear la llave", error);
    }
  },

  // Crea una llave nueva y fija la vigencia de la anterior (solape configurable en horas, 0 = termina ya).
  async rotar(req, res) {
    const { id } = req.params;
    if (!esIdValido(id)) return res.status(400).json({ exito: false, mensaje: MSG_ID });
    const cuerpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    let solape = SOLAPE_POR_DEFECTO_HORAS;
    if (cuerpo.solape_horas !== undefined) {
      solape = cuerpo.solape_horas;
      if (typeof solape !== "number" || !Number.isFinite(solape) || solape < 0 || solape > SOLAPE_MAXIMO_HORAS) {
        return res.status(400).json({ exito: false, mensaje: `solape_horas debe ser un número entre 0 y ${SOLAPE_MAXIMO_HORAS}` });
      }
    }
    const nombre = validarNombre(cuerpo.nombre, false);
    if (nombre.error) return res.status(400).json({ exito: false, mensaje: nombre.error });
    let ips = { lista: undefined };
    if (cuerpo.ips_permitidas !== undefined) {
      ips = validarListaIps(cuerpo.ips_permitidas);
      if (ips.error) return res.status(400).json({ exito: false, mensaje: ips.error });
    }

    try {
      const resultado = await Llave.enTransaccion(async (cliente) => {
        const previa = await Llave.obtenerPorId(Number(id), cliente, true);
        if (!previa) throw new ErrorAsistencia(404, "Llave no encontrada");
        if (previa.estado_efectivo !== "activa") {
          throw new ErrorAsistencia(409, "Solo se puede rotar una llave activa y vigente");
        }
        const nueva = await Llave.insertar(
          {
            nombre: nombre.valor || previa.nombre,
            origen: previa.origen,
            ips_permitidas: ips.lista || previa.ips_permitidas,
            vigente_hasta: null,
            creado_por: quienCrea(req),
            reemplaza_a: previa.id,
          },
          cliente,
        );
        const anterior = await Llave.acotarVigencia(previa.id, solape * 3600, cliente);
        return { previa, nueva, anterior };
      });
      await auditar(req, "ROTAR_LLAVE", resultado.nueva.fila.id, resumen(resultado.previa), {
        nueva: resumen(resultado.nueva.fila),
        anterior: resumen(resultado.anterior),
        solape_horas: solape,
      });
      return respuestaConLlave(res, 201, resultado.nueva.fila, resultado.nueva.llave, "Llave rotada", {
        anterior: { id: resultado.anterior.id, prefijo: resultado.anterior.prefijo, vigente_hasta: resultado.anterior.vigente_hasta },
      });
    } catch (error) {
      return responderError(res, "rotar la llave", error);
    }
  },

  async revocar(req, res) {
    const { id } = req.params;
    if (!esIdValido(id)) return res.status(400).json({ exito: false, mensaje: MSG_ID });
    try {
      const previa = await Llave.obtenerPorId(Number(id));
      if (!previa) return res.status(404).json({ exito: false, mensaje: "Llave no encontrada" });
      const fila = await Llave.revocar(Number(id), quienCrea(req));
      if (!fila) return res.status(409).json({ exito: false, mensaje: "La llave ya estaba revocada" });
      await auditar(req, "REVOCAR_LLAVE", fila.id, resumen(previa), resumen(fila));
      return res.json({ exito: true, datos: fila, mensaje: "Llave revocada" });
    } catch (error) {
      return responderError(res, "revocar la llave", error);
    }
  },

  async editarIps(req, res) {
    const { id } = req.params;
    if (!esIdValido(id)) return res.status(400).json({ exito: false, mensaje: MSG_ID });
    const cuerpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const ips = validarListaIps(cuerpo.ips_permitidas);
    if (ips.error) return res.status(400).json({ exito: false, mensaje: ips.error });
    try {
      const previa = await Llave.obtenerPorId(Number(id));
      if (!previa) return res.status(404).json({ exito: false, mensaje: "Llave no encontrada" });
      const fila = await Llave.actualizarIps(Number(id), ips.lista);
      if (!fila) return res.status(409).json({ exito: false, mensaje: "No se pueden cambiar las IP de una llave revocada" });
      await auditar(req, "EDITAR_IPS_LLAVE", fila.id, resumen(previa), resumen(fila));
      return res.json({ exito: true, datos: fila, mensaje: "IP permitidas actualizadas" });
    } catch (error) {
      return responderError(res, "actualizar las IP de la llave", error);
    }
  },

  // Últimos lotes recibidos (para ver el estado de la sincronización sin acceso a la BD)
  async lotes(req, res) {
    let limite = 50;
    if (req.query.limite !== undefined) {
      if (!esIdValido(req.query.limite) || Number(req.query.limite) > LIMITE_LOTES_MAXIMO) {
        return res.status(400).json({ exito: false, mensaje: `limite debe ser un entero entre 1 y ${LIMITE_LOTES_MAXIMO}` });
      }
      limite = Number(req.query.limite);
    }
    try {
      res.json({ exito: true, datos: await Ingesta.lotes({ limite }) });
    } catch (error) {
      responderError(res, "listar los lotes", error);
    }
  },

  // Re-vincula marcas huérfanas por numero_nomina (la Fase 4 la llamará periódicamente)
  async revincular(req, res) {
    const cuerpo = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    let limite = 5000;
    if (cuerpo.limite !== undefined) {
      if (!esIdValido(cuerpo.limite) || Number(cuerpo.limite) > LIMITE_REVINCULAR_MAXIMO) {
        return res.status(400).json({ exito: false, mensaje: `limite debe ser un entero entre 1 y ${LIMITE_REVINCULAR_MAXIMO}` });
      }
      limite = Number(cuerpo.limite);
    }
    try {
      const datos = await Ingesta.vincularHuerfanas({ limite });
      if (datos.vinculadas > 0) {
        await auditar(req, "REVINCULAR_MARCAS", "marcas", null, datos, "asistencia_marcas");
      }
      return res.json({ exito: true, datos });
    } catch (error) {
      return responderError(res, "re-vincular las marcas", error);
    }
  },
};

module.exports = LlaveControlador;
module.exports.resumen = resumen;
