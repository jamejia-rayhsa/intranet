/* eslint-env jest */
// Escenario simulado de la ingesta sobre fakeAsistenciaDb: una llave válida, empleados, marcas ya guardadas
// y los lotes/estado. Todo es mutable para que cada prueba lo ajuste (las reglas leen el estado al ejecutarse).
const { crearBD } = require("./fakeAsistenciaDb");
const { generarLlave } = require("../utils/llaveIngesta");

const fechaMexico = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date(iso));

function crearEscenario() {
  const bd = crearBD();
  const { llave, prefijo, hash } = generarLlave();
  const e = {
    bd,
    llave,
    prefijo,
    // Fila que devuelve buscarPorPrefijo; null = el prefijo no existe
    fila: {
      id: 7,
      nombre: "BioTime (prueba)",
      origen: "biotime",
      prefijo,
      hash_llave: hash,
      estado: "activa",
      ips_permitidas: [],
      vigente_ahora: true,
    },
    empleados: [], // { numero_nomina, id, fecha_ingreso?, fecha_baja? }
    existentes: new Set(), // id_externo ya guardados (conflicto -> duplicada)
    guardadas: [], // marcas realmente insertadas por la simulación
    idLote: 812,
    cursor: "1000622",
    estado: null, // fila de asistencia_sync_estado devuelta a GET /estado
    totalMarcas: 0,
    falla: null, // { re, error }: lanza ese error al ejecutar el SQL que coincida
  };

  // Espejo de la regla SQL de vinculación (empleadoVigenteSql): UNA coincidencia exacta de numero_nomina cuyo
  // periodo de empleo contiene la fecha de la marca en America/Mexico_City (fechas NULL = abierto)
  e.empleadoPara = (codigo, marcaTs) => {
    const dia = fechaMexico(marcaTs);
    const coincide = e.empleados.filter(
      (x) =>
        x.numero_nomina === codigo &&
        (!x.fecha_ingreso || x.fecha_ingreso <= dia) &&
        (!x.fecha_baja || x.fecha_baja >= dia),
    );
    return coincide.length === 1 ? coincide[0].id : null;
  };

  const regla = (re, respuesta) =>
    bd.cuando(re, (sql, params) => {
      if (e.falla && e.falla.re.test(sql)) throw e.falla.error;
      return typeof respuesta === "function"
        ? respuesta(sql, params)
        : respuesta;
    });

  // bd.reiniciar() borra las reglas: e.reiniciar() las vuelve a instalar
  e.instalar = () => {
    regla(/^(BEGIN|COMMIT|ROLLBACK)/, { rows: [] });
    // e.filas (opcional) permite varias llaves a la vez (solape de rotación); se busca por prefijo como la BD
    regla(/FROM asistencia_llaves WHERE prefijo = \$1/, (_sql, params) => ({
      rows: (e.filas || [e.fila]).filter((f) => f && f.prefijo === params[0]),
    }));
    regla(/UPDATE asistencia_llaves SET ultimo_uso/, { rows: [] });
    regla(/INSERT INTO asistencia_sync_lotes .*'en_curso'/s, () => ({
      rows: [{ id: e.idLote }],
    }));
    regla(/INSERT INTO asistencia_marcas/, (_sql, params) => {
      const [origen, loteId, ids, codigos, marcasTs] = params;
      const rows = [];
      ids.forEach((id, i) => {
        if (e.existentes.has(id) || rows.some((r) => r.id_externo === id))
          return;
        const empleadoId = e.empleadoPara(codigos[i], marcasTs[i]);
        rows.push({ id_externo: id, empleado_id: empleadoId });
        e.guardadas.push({
          origen,
          loteId,
          id_externo: id,
          codigo_empleado: codigos[i],
          empleado_id: empleadoId,
        });
      });
      rows.forEach((r) => e.existentes.add(r.id_externo));
      return { rows, rowCount: rows.length };
    });
    regla(/UPDATE asistencia_sync_lotes SET estatus = 'ok'/, { rows: [] });
    regla(
      /INSERT INTO asistencia_sync_estado .*RETURNING ultimo_id_externo/s,
      () => ({ rows: [{ ultimo_id_externo: e.cursor }] }),
    );
    regla(/INSERT INTO asistencia_sync_lotes .*'error'/s, { rows: [] });
    regla(/INSERT INTO asistencia_sync_estado .*ultimo_error = EXCLUDED/s, {
      rows: [],
    });
    regla(/FROM asistencia_sync_estado WHERE origen = \$1/, () => ({
      rows: e.estado ? [e.estado] : [],
    }));
    regla(/COUNT\(\*\) AS total FROM asistencia_marcas WHERE origen/, () => ({
      rows: [{ total: String(e.totalMarcas) }],
    }));
  };
  e.reiniciar = () => {
    bd.reiniciar();
    e.instalar();
  };
  e.instalar();

  return e;
}

module.exports = { crearEscenario };
