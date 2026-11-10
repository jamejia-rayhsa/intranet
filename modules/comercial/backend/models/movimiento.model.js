const { grupo } = require('../../../portal/backend/config/database');

// Duración aproximada en días de cada periodo (para proyectar una fecha estimada de agotamiento,
// no para cálculos financieros). "unico" no tiene periodicidad: no se proyecta fecha, solo stock.
const DIAS_POR_PERIODO = { mensual: 30, bimestral: 60, trimestral: 90 };

// El driver de pg devuelve una columna DATE como objeto Date (medianoche UTC), no como texto —
// probado contra Postgres real: `new Date(\`${dateObj}T00:00:00Z\`)` da "Invalid time value" más
// abajo si no se normaliza primero. Acepta también texto (pruebas unitarias, por si ya viene así).
function aFechaTexto(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor).slice(0, 10);
}

const Movimiento = {
  async listar(convenioProductoId, cliente = grupo) {
    const res = await cliente.query(
      `
      SELECT m.*, u.nombre AS registrado_por_nombre, u.apellido AS registrado_por_apellido
      FROM comercial_convenio_movimientos m
      LEFT JOIN usuarios u ON u.id = m.registrado_por_id
      WHERE m.convenio_producto_id = $1
      ORDER BY m.fecha_movimiento, m.id
    `,
      [convenioProductoId],
    );
    return res.rows;
  },

  async existeCompraInicial(convenioProductoId, cliente = grupo) {
    const res = await cliente.query(
      `SELECT 1 FROM comercial_convenio_movimientos WHERE convenio_producto_id = $1 AND tipo = 'compra_inicial'`,
      [convenioProductoId],
    );
    return res.rows.length > 0;
  },

  // Código de error de Postgres para violación de restricción única (índice parcial de
  // compra_inicial): el controlador lo traduce a 409, nunca a un 500 genérico.
  ERROR_UNICIDAD: '23505',

  async registrar(convenioProductoId, datos, registradoPorId) {
    const res = await grupo.query(
      `
      INSERT INTO comercial_convenio_movimientos (
        convenio_producto_id, tipo, cantidad, fecha_movimiento, orden_compra, comentario, registrado_por_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING *
    `,
      [
        convenioProductoId,
        datos.tipo,
        datos.cantidad,
        datos.fecha_movimiento,
        datos.orden_compra || null,
        datos.comentario || null,
        registradoPorId,
      ],
    );
    return res.rows[0];
  },

  // Decisión del humano (2026-11-10): el ritmo de consumo para el estimado es el promedio REAL de
  // los movimientos de consumo ya registrados; si todavía no hay ninguno, el llamador (que tiene
  // cantidad_periodica/periodo de la línea) decide el respaldo — este cálculo no lo conoce.
  async calcularEstado(convenioProductoId, cliente = grupo) {
    const movimientos = await Movimiento.listar(convenioProductoId, cliente);
    const compraInicial = movimientos.find((m) => m.tipo === 'compra_inicial') || null;
    const consumos = movimientos.filter((m) => m.tipo === 'consumo');

    const stockComprado = compraInicial ? Number(compraInicial.cantidad) : 0;
    const stockConsumido = consumos.reduce((acc, m) => acc + Number(m.cantidad), 0);
    const stockRestante = stockComprado - stockConsumido;
    const ritmoPromedioReal = consumos.length
      ? consumos.reduce((acc, m) => acc + Number(m.cantidad), 0) / consumos.length
      : null;
    const ultimoMovimiento = movimientos.length ? movimientos[movimientos.length - 1] : null;

    return {
      tiene_compra_inicial: Boolean(compraInicial),
      stock_comprado: stockComprado,
      stock_consumido: stockConsumido,
      stock_restante: stockRestante,
      movimientos_consumo: consumos.length,
      ritmo_promedio_real: ritmoPromedioReal,
      fecha_ultimo_movimiento: ultimoMovimiento ? aFechaTexto(ultimoMovimiento.fecha_movimiento) : null,
      movimientos,
    };
  },

  // Combina calcularEstado() (lo que sabe la tabla de movimientos) con el plan de la línea
  // (cantidad_periodica/periodo) para dar el estimado final: ritmo real si ya hay consumos
  // registrados, si no el plan original; proyecta una fecha solo si el periodo tiene duración
  // conocida (no "unico") y el ritmo usado es mayor a 0.
  proyectarEstimado(estado, productoLinea) {
    const ritmoUsado = estado.ritmo_promedio_real ?? Number(productoLinea.cantidad_periodica);
    const ritmoEsReal = estado.ritmo_promedio_real !== null;

    let periodosRestantes = null;
    let fechaEstimadaAgotamiento = null;
    if (estado.stock_restante <= 0) {
      periodosRestantes = 0;
    } else if (ritmoUsado > 0) {
      periodosRestantes = estado.stock_restante / ritmoUsado;
      const diasPorPeriodo = DIAS_POR_PERIODO[productoLinea.periodo];
      if (diasPorPeriodo) {
        const base = estado.fecha_ultimo_movimiento ? new Date(`${estado.fecha_ultimo_movimiento}T00:00:00Z`) : new Date();
        const dias = Math.ceil(periodosRestantes * diasPorPeriodo);
        const fecha = new Date(base.getTime() + dias * 24 * 60 * 60 * 1000);
        fechaEstimadaAgotamiento = fecha.toISOString().slice(0, 10);
      }
    }

    return {
      ...estado,
      ritmo_usado: ritmoUsado,
      ritmo_es_real: ritmoEsReal,
      periodos_restantes_estimados: periodosRestantes,
      fecha_estimada_agotamiento: fechaEstimadaAgotamiento,
    };
  },
};

module.exports = Movimiento;
