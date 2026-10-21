const { grupo } = require("../config/database");
const Turno = require("./turno.model");
const { ErrorAsistencia } = require("../utils/erroresAsistencia");

// Espacios de claves de los candados de aplicación (pg_advisory_xact_lock(int, int)); el de
// vacaciones es 4217. Serializan las altas del MISMO departamento / empleado.
const ESPACIO_ASIGNACION = { departamento: 4301, empleado: 4302 };

// Tablas y columnas fijas (nunca vienen del cliente)
const TIPOS = {
  departamento: { tabla: "turno_departamento", columna: "departamento_id", padre: "departamentos", nombrePadre: "Departamento" },
  empleado: { tabla: "turno_empleado", columna: "empleado_id", padre: "empleados", nombrePadre: "Empleado" },
};

const fechas = `to_char(a.vigente_desde, 'YYYY-MM-DD') AS vigente_desde,
  to_char(a.vigente_hasta, 'YYYY-MM-DD') AS vigente_hasta`;

const TurnoAsignacion = {
  TIPOS,
  ESPACIO_ASIGNACION,

  async listar(tipo, { padreId, turnoId } = {}, cliente = grupo) {
    const { tabla, columna } = TIPOS[tipo];
    const condiciones = [];
    const valores = [];
    if (padreId) {
      valores.push(padreId);
      condiciones.push(`a.${columna} = $${valores.length}`);
    }
    if (turnoId) {
      valores.push(turnoId);
      condiciones.push(`a.turno_id = $${valores.length}`);
    }
    const donde = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
    const r = await cliente.query(
      `SELECT a.id, a.${columna}, a.turno_id, t.nombre AS turno_nombre, ${fechas}, a.creado_por, a.fecha_creacion
       FROM ${tabla} a JOIN turnos t ON t.id = a.turno_id
       ${donde}
       ORDER BY a.${columna}, a.vigente_desde DESC, a.id DESC`,
      valores,
    );
    return r.rows;
  },

  async obtenerPorId(tipo, id, cliente = grupo) {
    const { tabla, columna } = TIPOS[tipo];
    const r = await cliente.query(
      `SELECT a.id, a.${columna}, a.turno_id, ${fechas} FROM ${tabla} a WHERE a.id = $1`,
      [id],
    );
    return r.rows[0] || null;
  },

  /**
   * Asigna un turno a un departamento o empleado con vigencia. Una transacción con candado del
   * departamento/empleado: comprueba que existan, que el turno exista y esté activo y que no se
   * traslape con otra vigencia (409). La restricción EXCLUDE de la BD es la última barrera.
   */
  async asignar(tipo, datos) {
    const { tabla, columna, padre, nombrePadre } = TIPOS[tipo];
    return Turno.enTransaccion(async (cliente) => {
      await cliente.query("SELECT pg_advisory_xact_lock($1::int, $2::int)", [
        ESPACIO_ASIGNACION[tipo],
        datos[columna],
      ]);
      const existePadre = await cliente.query(`SELECT id FROM ${padre} WHERE id = $1`, [datos[columna]]);
      if (!existePadre.rows[0]) throw new ErrorAsistencia(404, `${nombrePadre} no encontrado`);
      // FOR SHARE: el turno no se desactiva ni se borra mientras se asigna
      const turno = await cliente.query("SELECT id, activo FROM turnos WHERE id = $1 FOR SHARE", [datos.turno_id]);
      if (!turno.rows[0]) throw new ErrorAsistencia(404, "Turno no encontrado");
      if (!turno.rows[0].activo) throw new ErrorAsistencia(409, "El turno está inactivo y no se puede asignar");

      const choque = await cliente.query(
        `SELECT a.id, ${fechas}
         FROM ${tabla} a
         WHERE a.${columna} = $1
           AND daterange(a.vigente_desde, a.vigente_hasta, '[]') && daterange($2::date, $3::date, '[]')
         ORDER BY a.vigente_desde
         LIMIT 1`,
        [datos[columna], datos.vigente_desde, datos.vigente_hasta],
      );
      if (choque.rows[0]) {
        const c = choque.rows[0];
        const hasta = c.vigente_hasta || "sin fecha final";
        throw new ErrorAsistencia(
          409,
          `La vigencia se traslapa con otra asignación (${c.vigente_desde} a ${hasta}); termínala antes o elige otras fechas`,
        );
      }
      const insertado = await cliente.query(
        `INSERT INTO ${tabla} (${columna}, turno_id, vigente_desde, vigente_hasta, creado_por)
         VALUES ($1, $2, $3::date, $4::date, $5)
         RETURNING id`,
        [datos[columna], datos.turno_id, datos.vigente_desde, datos.vigente_hasta, datos.creado_por || null],
      );
      return TurnoAsignacion.obtenerPorId(tipo, insertado.rows[0].id, cliente);
    });
  },

  /**
   * Termina una asignación fijando vigente_hasta. Solo acorta (la abierta o una con fecha final
   * posterior): alargar podría traslapar. Devuelve {previo, actual} o null si no existe.
   */
  async terminar(tipo, id, vigenteHasta) {
    const { tabla } = TIPOS[tipo];
    return Turno.enTransaccion(async (cliente) => {
      const bloqueada = await cliente.query(`SELECT id FROM ${tabla} WHERE id = $1 FOR UPDATE`, [id]);
      if (!bloqueada.rows[0]) return null;
      const previo = await TurnoAsignacion.obtenerPorId(tipo, id, cliente);
      if (vigenteHasta < previo.vigente_desde) {
        throw new ErrorAsistencia(400, "vigente_hasta no puede ser anterior a vigente_desde");
      }
      if (previo.vigente_hasta !== null && vigenteHasta >= previo.vigente_hasta) {
        throw new ErrorAsistencia(
          409,
          `La asignación ya termina el ${previo.vigente_hasta}; solo se puede acortar su vigencia`,
        );
      }
      await cliente.query(`UPDATE ${tabla} SET vigente_hasta = $2::date WHERE id = $1`, [id, vigenteHasta]);
      const actual = await TurnoAsignacion.obtenerPorId(tipo, id, cliente);
      return { previo, actual };
    });
  },

  // Datos mínimos para decidir el acceso (jefe vigente) y el departamento actual; null si no existe
  async obtenerEmpleadoBasico(empleadoId, cliente = grupo) {
    const r = await cliente.query(
      "SELECT id, jefe_inmediato_id, departamento_id FROM empleados WHERE id = $1",
      [empleadoId],
    );
    return r.rows[0] || null;
  },

  // Historial del empleado: sus asignaciones individuales y las de su departamento actual
  async historialEmpleado(empleadoId, cliente = grupo) {
    const basico = await TurnoAsignacion.obtenerEmpleadoBasico(empleadoId, cliente);
    if (!basico) return null;
    const individuales = await TurnoAsignacion.listar("empleado", { padreId: empleadoId }, cliente);
    const departamento = basico.departamento_id
      ? await TurnoAsignacion.listar("departamento", { padreId: basico.departamento_id }, cliente)
      : [];
    return { empleado_id: basico.id, departamento_id: basico.departamento_id, individuales, departamento };
  },
};

module.exports = TurnoAsignacion;
