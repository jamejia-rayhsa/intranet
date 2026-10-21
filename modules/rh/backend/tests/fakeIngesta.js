/* eslint-env jest */
// Escenario simulado de la ingesta sobre fakeAsistenciaDb: una llave válida, empleados, marcas ya guardadas
// y los lotes/estado. Todo es mutable para que cada prueba lo ajuste (las reglas leen el estado al ejecutarse).
const { crearBD } = require("./fakeAsistenciaDb");
const { generarLlave } = require("../utils/llaveIngesta");

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
    empleados: [], // { numero_nomina, id, coincidencias }
    existentes: new Set(), // id_externo ya guardados (conflicto -> duplicada)
    guardadas: [], // marcas realmente insertadas por la simulación
    idLote: 812,
    cursor: "1000622",
    estado: null, // fila de asistencia_sync_estado devuelta a GET /estado
    totalMarcas: 0,
    falla: null, // { re, error }: lanza ese error al ejecutar el SQL que coincida
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
    regla(/FROM empleados WHERE numero_nomina = ANY/, (_sql, params) => ({
      rows: e.empleados.filter((x) => params[0].includes(x.numero_nomina)),
    }));
    regla(/INSERT INTO asistencia_marcas/, (_sql, params) => {
      const [origen, loteId, ids, codigos, empleadoIds] = params;
      const rows = [];
      ids.forEach((id, i) => {
        if (e.existentes.has(id) || rows.some((r) => r.id_externo === id))
          return;
        rows.push({ id_externo: id, empleado_id: empleadoIds[i] });
        e.guardadas.push({
          origen,
          loteId,
          id_externo: id,
          codigo_empleado: codigos[i],
          empleado_id: empleadoIds[i],
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
