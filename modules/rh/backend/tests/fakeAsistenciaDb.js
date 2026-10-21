/* eslint-env jest */
// BD simulada para las pruebas de asistencia: un pool (`grupo`) y un cliente de transacción que comparten
// el mismo manejador. Resuelve los permisos por opción (como verificarPermiso/tienePermiso reales) y el
// resto de consultas por reglas {re, respuesta}. Guarda cada consulta para comprobar orden y parámetros.
function crearBD() {
  const estado = { permisos: {}, reglas: [], llamadas: [] };

  const responder = async (sql, params) => {
    estado.llamadas.push({ sql, params });
    if (/rol_opcion_permisos/.test(sql)) {
      const [, , opcion, aceptados] = params;
      const tipos = estado.permisos[opcion] || [];
      return { rows: tipos.some((t) => aceptados.includes(t)) ? [{ existe: 1 }] : [] };
    }
    for (const regla of estado.reglas) {
      if (regla.re.test(sql)) {
        const r = typeof regla.respuesta === "function" ? regla.respuesta(sql, params) : regla.respuesta;
        if (r instanceof Error) throw r;
        return r;
      }
    }
    return { rows: [] };
  };

  const cliente = { query: jest.fn(responder), release: jest.fn() };
  const grupo = { query: jest.fn(responder), connect: jest.fn(async () => cliente) };

  return {
    grupo,
    cliente,
    estado,
    /** Regla nueva (las primeras registradas tienen prioridad) */
    cuando(re, respuesta) {
      estado.reglas.push({ re, respuesta });
    },
    reiniciar() {
      estado.permisos = {};
      estado.reglas = [];
      estado.llamadas = [];
      grupo.query.mockClear();
      grupo.connect.mockClear();
      cliente.query.mockClear();
      cliente.release.mockClear();
    },
    /** Consultas ejecutadas que no son de permisos */
    sqls() {
      return estado.llamadas.filter((l) => !/rol_opcion_permisos/.test(l.sql));
    },
    /** Posición de la primera consulta que cumple el patrón (-1 si no hubo) */
    indice(re) {
      return this.sqls().findIndex((l) => re.test(l.sql));
    },
    hubo(re) {
      return this.indice(re) !== -1;
    },
  };
}

module.exports = { crearBD };
