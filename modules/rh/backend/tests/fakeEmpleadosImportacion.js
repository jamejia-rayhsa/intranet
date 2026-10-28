// BD en memoria para las pruebas del importador de empleados: interpreta solo las consultas que hace
// Empleado.importarLote / asignarJefes y el controlador (catálogos, búsqueda por claves, INSERT, UPDATE, jefes, transacciones).
function crearBd({ empleados = [], puestos = [], departamentos = [], ubicaciones = [], usuarios = [], fallaEn } = {}) {
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
    const falla = fallaEn && fallaEn(q, params);
    if (falla) { estado.abortada = true; throw falla instanceof Error ? falla : new Error("fallo simulado de PostgreSQL (detalle interno)"); }
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
    // Cuentas de usuario por correo (columna "Correo de la cuenta") y vínculo guardado
    if (/WHERE LOWER\(u\.correo\) = ANY\(\$1::text\[\]\)/.test(q)) {
      return {
        rows: usuarios
          .filter((u) => params[0].includes(u.correo.toLowerCase()))
          .map((u) => ({ id: u.id, correo: u.correo, nombre: u.nombre || "X", apellido: u.apellido || "", activo: u.activo !== false, roles: u.roles || [], con_acceso_asistencia: u.con_acceso_asistencia !== false })),
      };
    }
    if (/^SELECT usuario_id, id FROM empleados WHERE usuario_id = ANY\(\$1::int\[\]\)/.test(q)) {
      return { rows: estado.empleados.filter((e) => e.usuario_id && params[0].includes(e.usuario_id)).map((e) => ({ usuario_id: e.usuario_id, id: e.id })) };
    }
    if (/^UPDATE empleados SET usuario_id = \$1, fecha_actualizacion = NOW\(\) WHERE id = \$2 AND usuario_id IS NULL$/.test(q)) {
      const e = estado.empleados.find((x) => x.id === params[1]);
      if (!e || e.usuario_id) return { rows: [], rowCount: 0 };
      if (estado.empleados.some((x) => x.usuario_id === params[0])) {
        throw Object.assign(new Error("duplicate key value violates unique constraint (detalle interno)"), { code: "23505", constraint: "empleados_usuario_id_unique" });
      }
      e.usuario_id = params[0];
      return { rows: [], rowCount: 1 };
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
