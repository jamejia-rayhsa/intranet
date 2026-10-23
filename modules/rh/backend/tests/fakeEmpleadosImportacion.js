// BD en memoria para las pruebas del importador de empleados: interpreta solo las consultas que hace
// Empleado.importarLote / asignarJefes y el controlador (catálogos, búsqueda por claves, INSERT, UPDATE, jefes, transacciones).
function crearBd({ empleados = [], puestos = [], departamentos = [], ubicaciones = [], fallaEn } = {}) {
  const estado = {
    empleados: empleados.map((e) => ({ ...e })),
    sigId: Math.max(0, ...empleados.map((e) => e.id || 0)) + 1,
    sentencias: [],
    transacciones: { begin: 0, commit: 0, rollback: 0 },
    candados: [],
    abortada: false,
    puntos: [],
    liberados: 0,
  };
  let respaldo = null;

  const ejecutar = async (sql, params = []) => {
    const q = sql.replace(/\s+/g, " ").trim();
    estado.sentencias.push({ sql: q, params });
    // Como PostgreSQL: tras un error la transacción queda abortada y solo ROLLBACK [TO SAVEPOINT] la rehabilita
    if (estado.abortada && !/^(ROLLBACK|COMMIT)/.test(q)) throw new Error("current transaction is aborted, commands ignored until end of transaction block");
    if (fallaEn && fallaEn(q, params)) { estado.abortada = true; throw new Error("fallo simulado de PostgreSQL (detalle interno)"); }
    if (/^ROLLBACK/.test(q)) estado.abortada = false;
    if (q === "BEGIN") { estado.transacciones.begin++; respaldo = JSON.stringify(estado.empleados); return { rows: [] }; }
    if (q === "COMMIT") { estado.transacciones.commit++; respaldo = null; return { rows: [] }; }
    if (q === "ROLLBACK") { estado.transacciones.rollback++; if (respaldo) estado.empleados = JSON.parse(respaldo); return { rows: [] }; }
    if (/^SELECT pg_advisory_xact_lock/.test(q)) { estado.candados.push(params); return { rows: [] }; }
    let m = /^SAVEPOINT (\w+)/.exec(q);
    if (m) { estado.puntos.push([m[1], JSON.stringify(estado.empleados)]); return { rows: [] }; }
    m = /^ROLLBACK TO SAVEPOINT (\w+)/.exec(q);
    if (m) { estado.empleados = JSON.parse(estado.puntos.find((x) => x[0] === m[1])[1]); return { rows: [] }; }
    if (/^RELEASE SAVEPOINT/.test(q)) return { rows: [] };
    m = /^SELECT id, nombre FROM (puestos|departamentos|ubicaciones)/.exec(q);
    if (m) return { rows: { puestos, departamentos, ubicaciones }[m[1]] };
    if (/FROM empleados WHERE LOWER\(curp\) = ANY\(\$1\) OR LOWER\(numero_nomina\) = ANY\(\$2\) OR LTRIM\(LOWER\(numero_nomina\), '0'\) = ANY\(\$3\)/.test(q)) {
      const [curps, nominas, nominasSC] = params;
      return {
        rows: estado.empleados
          .filter((e) => (e.curp && curps.includes(e.curp.toLowerCase())) || (e.numero_nomina && nominas.includes(e.numero_nomina.toLowerCase()))
            || (e.numero_nomina && nominasSC.includes(e.numero_nomina.toLowerCase().replace(/^0+/, ""))))
          .sort((a, b) => a.id - b.id)
          .map((e) => ({ ...e, curp_l: e.curp ? e.curp.toLowerCase() : null, nomina_l: e.numero_nomina ? e.numero_nomina.toLowerCase() : null })),
      };
    }
    m = /^INSERT INTO empleados \(([^)]*)\) VALUES/.exec(q);
    if (m) {
      const columnas = m[1].split(",").map((c) => c.trim());
      const fila = { id: estado.sigId++, usuario_id: null };
      columnas.forEach((c, i) => { fila[c] = params[i]; });
      estado.empleados.push(fila);
      return { rows: [{ id: fila.id }] };
    }
    m = /^UPDATE empleados SET (.*), fecha_actualizacion = NOW\(\) WHERE id = \$(\d+)$/.exec(q);
    if (m) {
      const columnas = m[1].split(",").map((c) => c.split("=")[0].trim());
      const e = estado.empleados.find((x) => x.id === params[columnas.length]);
      columnas.forEach((c, i) => { e[c] = params[i]; });
      return { rows: [] };
    }
    if (/^SELECT id, nombre, apellido_paterno, apellido_materno, LOWER\(curp\) AS curp_l/.test(q)) {
      return {
        rows: estado.empleados.map((e) => ({
          id: e.id, nombre: e.nombre, apellido_paterno: e.apellido_paterno, apellido_materno: e.apellido_materno || null,
          curp_l: e.curp ? e.curp.toLowerCase() : null, nomina_l: e.numero_nomina ? e.numero_nomina.toLowerCase() : null,
          jefe_inmediato_id: e.jefe_inmediato_id || null, estatus: e.estatus || "activo",
        })),
      };
    }
    if (/^UPDATE empleados e SET jefe_inmediato_id = v.jefe/.test(q)) {
      params[0].forEach((id, i) => { estado.empleados.find((e) => e.id === id).jefe_inmediato_id = params[1][i]; });
      return { rows: [] };
    }
    return { rows: [] };
  };

  const cliente = { query: ejecutar, release: () => { estado.liberados++; } };
  return { estado, query: ejecutar, connect: async () => cliente };
}

module.exports = { crearBd };
