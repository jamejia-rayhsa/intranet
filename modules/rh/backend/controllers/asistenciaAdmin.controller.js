// Lectura para las pantallas de administración de Asistencia. Todas las rutas llevan JWT y permiso (Turnos o
// Ingesta, consulta) en asistencia.routes.js. Entradas validadas con tope; los errores inesperados responden
// un 500 genérico (el texto de la BD solo va al log del servidor).
const AsistenciaAdmin = require("../models/asistenciaAdmin.model");
const { esFechaValida, esIdValido, tieneControl } = require("../utils/turnoValidacion");

const ORIGEN = "biotime";
const MAX_RANGO_DIAS = 93;
const MAX_TEXTO = 100;
const LIMITE_MARCAS_MAXIMO = 500;
const LIMITE_MARCAS_DEFECTO = 50;
const LIMITE_EMPLEADOS_MAXIMO = 50;
const LIMITE_LOTES_MAXIMO = 100;
const LIMITE_CODIGOS = 200;
const LIMITE_SIN_NOMINA = 200;
const PAGINA_MAXIMA = 100000;

const MS_DIA = 86400000;

/** Días entre dos fechas AAAA-MM-DD ya validadas (aritmética UTC: sin desfase de zona). */
function diasEntre(desde, hasta) {
  const t = (f) => {
    const [a, m, d] = f.split("-").map(Number);
    return Date.UTC(a, m - 1, d);
  };
  return Math.round((t(hasta) - t(desde)) / MS_DIA);
}

function errorInterno(res, contexto, error) {
  console.error(`[AsistenciaAdmin] ${contexto}:`, error.message);
  return res.status(500).json({ exito: false, mensaje: `Error al ${contexto}` });
}

const rechazo = (res, mensaje) => res.status(400).json({ exito: false, mensaje });

/** Entero positivo de la consulta (con tope); undefined -> por defecto; inválido -> null. */
function entero(valor, defecto, maximo) {
  if (valor === undefined) return defecto;
  if (!esIdValido(valor) || Number(valor) > maximo) return null;
  return Number(valor);
}

/** Texto opcional de una línea. undefined/"" -> undefined; arreglo, control o demasiado largo -> null. */
function texto(valor) {
  if (valor === undefined) return undefined;
  if (typeof valor !== "string") return null;
  const limpio = valor.trim();
  if (limpio === "") return undefined;
  if (limpio.length > MAX_TEXTO || tieneControl(limpio)) return null;
  return limpio;
}

function paginacion(query, { limiteDefecto, limiteMaximo }) {
  const pagina = entero(query.pagina, 1, PAGINA_MAXIMA);
  if (pagina === null) return { error: `pagina debe ser un entero entre 1 y ${PAGINA_MAXIMA}` };
  const limite = entero(query.limite, limiteDefecto, limiteMaximo);
  if (limite === null) return { error: `limite debe ser un entero entre 1 y ${limiteMaximo}` };
  return { pagina, limite };
}

const respuestaPaginada = (clave, filas, total, pagina, limite) => ({
  exito: true,
  datos: {
    [clave]: filas,
    total,
    pagina,
    limite,
    paginas_totales: total === null ? null : Math.ceil(total / limite),
  },
});

const ControladorAsistenciaAdmin = {
  async usoDeTurnos(_req, res) {
    try {
      res.json({ exito: true, datos: await AsistenciaAdmin.usoDeTurnos() });
    } catch (error) {
      errorInterno(res, "consultar el uso de los turnos", error);
    }
  },

  async buscarEmpleados(req, res) {
    const pag = paginacion(req.query, { limiteDefecto: 20, limiteMaximo: LIMITE_EMPLEADOS_MAXIMO });
    if (pag.error) return rechazo(res, pag.error);
    const q = texto(req.query.q);
    if (q === null) return rechazo(res, `q debe ser texto de una línea de hasta ${MAX_TEXTO} caracteres`);
    try {
      const r = await AsistenciaAdmin.buscarEmpleados({ texto: q, pagina: pag.pagina, limite: pag.limite });
      res.json(respuestaPaginada("empleados", r.empleados, r.total, pag.pagina, pag.limite));
    } catch (error) {
      errorInterno(res, "buscar empleados", error);
    }
  },

  async marcas(req, res) {
    const { desde, hasta } = req.query;
    if (!esFechaValida(desde) || !esFechaValida(hasta)) {
      return rechazo(res, "desde y hasta son obligatorios y deben tener el formato YYYY-MM-DD de una fecha real");
    }
    if (hasta < desde) return rechazo(res, "hasta no puede ser anterior a desde");
    if (diasEntre(desde, hasta) + 1 > MAX_RANGO_DIAS) {
      return rechazo(res, `El rango no puede superar ${MAX_RANGO_DIAS} días por consulta`);
    }
    const pag = paginacion(req.query, { limiteDefecto: LIMITE_MARCAS_DEFECTO, limiteMaximo: LIMITE_MARCAS_MAXIMO });
    if (pag.error) return rechazo(res, pag.error);

    let empleadoId;
    if (req.query.empleado_id !== undefined) {
      if (!esIdValido(req.query.empleado_id)) return rechazo(res, "empleado_id debe ser un entero positivo");
      empleadoId = Number(req.query.empleado_id);
    }
    const buscar = texto(req.query.buscar);
    const codigo = texto(req.query.codigo);
    const terminal = texto(req.query.terminal);
    if (buscar === null) return rechazo(res, `buscar debe ser texto de una línea de hasta ${MAX_TEXTO} caracteres`);
    if (codigo === null) return rechazo(res, `codigo debe ser texto de una línea de hasta ${MAX_TEXTO} caracteres`);
    if (terminal === null) return rechazo(res, `terminal debe ser texto de una línea de hasta ${MAX_TEXTO} caracteres`);
    const vinculadas = req.query.vinculadas === undefined || req.query.vinculadas === "" ? "todas" : req.query.vinculadas;
    if (!["todas", "si", "no"].includes(vinculadas)) return rechazo(res, "vinculadas debe ser todas, si o no");
    const contarTexto = req.query.contar;
    if (contarTexto !== undefined && contarTexto !== "true" && contarTexto !== "false") {
      return rechazo(res, "contar debe ser true o false");
    }

    try {
      const r = await AsistenciaAdmin.marcas({
        desde,
        hasta,
        empleadoId,
        buscar,
        codigo,
        vinculadas,
        terminal,
        pagina: pag.pagina,
        limite: pag.limite,
        contar: contarTexto !== "false",
      });
      res.set("Cache-Control", "no-store");
      res.json(respuestaPaginada("marcas", r.marcas, r.total, pag.pagina, pag.limite));
    } catch (error) {
      errorInterno(res, "consultar las marcas", error);
    }
  },

  async codigosSinEmpleado(_req, res) {
    try {
      const datos = await AsistenciaAdmin.codigosSinEmpleado({ limite: LIMITE_CODIGOS });
      res.json({ exito: true, datos: { ...datos, limite: LIMITE_CODIGOS } });
    } catch (error) {
      errorInterno(res, "consultar los códigos sin empleado", error);
    }
  },

  async empleadosSinNomina(_req, res) {
    try {
      const datos = await AsistenciaAdmin.empleadosSinNomina({ limite: LIMITE_SIN_NOMINA });
      res.json({ exito: true, datos: { ...datos, limite: LIMITE_SIN_NOMINA } });
    } catch (error) {
      errorInterno(res, "consultar los empleados sin número de nómina", error);
    }
  },

  async estadoSincronizacion(_req, res) {
    try {
      res.set("Cache-Control", "no-store");
      res.json({ exito: true, datos: await AsistenciaAdmin.estadoSincronizacion(ORIGEN) });
    } catch (error) {
      errorInterno(res, "consultar el estado de la sincronización", error);
    }
  },

  async lotes(req, res) {
    const pag = paginacion(req.query, { limiteDefecto: 20, limiteMaximo: LIMITE_LOTES_MAXIMO });
    if (pag.error) return rechazo(res, pag.error);
    try {
      const r = await AsistenciaAdmin.lotes({ origen: ORIGEN, pagina: pag.pagina, limite: pag.limite });
      res.set("Cache-Control", "no-store");
      res.json(respuestaPaginada("lotes", r.lotes, r.total, pag.pagina, pag.limite));
    } catch (error) {
      errorInterno(res, "consultar los lotes", error);
    }
  },
};

module.exports = ControladorAsistenciaAdmin;
module.exports.diasEntre = diasEntre;
