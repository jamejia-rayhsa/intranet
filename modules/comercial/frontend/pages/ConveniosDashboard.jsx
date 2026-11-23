// modules/comercial/frontend/pages/ConveniosDashboard.jsx
// Dashboard de convenios — KPIs globales (activos, por vencer, vencidos, sin ventas recientes;
// umbrales decididos por el humano: 30 días para "por vencer", 60 días sin movimiento) y, por
// convenio, comprado / vendido / existencia de MBA3, cumplimiento del plan y vigencia. Los datos
// de MBA3 salen de una foto guardada que se recalcula con el botón "Actualizar desde MBA3".

import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { obtenerDashboardConvenios, actualizarDashboardConvenios } from '../services/convenios.service';
import PageHeader from '../../../portal/frontend/components/PageHeader';
import TarjetaKPI from '../../../portal/frontend/components/TarjetaKPI';
import BarraProgreso from '../../../portal/frontend/components/BarraProgreso';
import '../styles/comercial.css';

function fmt(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('es-MX', { maximumFractionDigits: 2 });
}

function badgeClass(estatus) {
  return `credito-badge credito-badge-${estatus === 'pendiente_autorizacion' ? 'guardada' : estatus === 'autorizado' ? 'aprobada' : estatus === 'rechazado' ? 'rechazada' : 'borrador'}`;
}

// Ventas contra lo comprado (OC recibidas): sin foto o sin compras = neutral; muy vendido = rojo
// (se agota lo comprado); acercándose = ámbar; holgado = verde.
function estadoVentas(c) {
  if (!c.calculado_en) {
    return { color: 'var(--color-texto-claro)', porcentaje: 0, etiqueta: 'Sin datos de MBA3 (actualiza)' };
  }
  const comprado = Number(c.comprado) || 0;
  const vendido = Number(c.vendido) || 0;
  if (comprado <= 0) {
    return { color: 'var(--color-texto-claro)', porcentaje: 0, etiqueta: 'Sin órdenes de compra' };
  }
  const pct = Math.min(100, (vendido / comprado) * 100);
  const color = pct >= 90 ? 'var(--color-error)' : pct >= 70 ? 'var(--color-advertencia)' : 'var(--color-exito)';
  return { color, porcentaje: pct, etiqueta: `${fmt(vendido)} vendido de ${fmt(comprado)} comprado` };
}

// Cumplimiento del plan: vendido contra lo esperado a la fecha (cantidad periódica × periodos).
function estadoCumplimiento(c) {
  if (c.cumplimiento_plan === null || c.cumplimiento_plan === undefined) {
    return { color: 'var(--color-texto-claro)', porcentaje: 0, etiqueta: '—' };
  }
  const pct = c.cumplimiento_plan * 100;
  const color = pct < 50 ? 'var(--color-error)' : pct < 80 ? 'var(--color-advertencia)' : 'var(--color-exito)';
  return { color, porcentaje: Math.min(100, pct), etiqueta: `${fmt(pct)}% del plan` };
}

// Semáforo de vigencia: vencido = rojo; dentro de la ventana de "por vencer" (30 días) = ámbar;
// resto (o abierta, sin vigente_hasta) = verde.
function estadoVigencia(c) {
  if (c.vencido) {
    return { color: 'var(--color-error)', porcentaje: 100, etiqueta: 'Vencido' };
  }
  if (c.dias_para_vencer === null || c.dias_para_vencer === undefined) {
    return { color: 'var(--color-exito)', porcentaje: 0, etiqueta: 'Abierta' };
  }
  const dias = Number(c.dias_para_vencer);
  if (dias <= 30) {
    return { color: 'var(--color-advertencia)', porcentaje: Math.max(0, 100 - (dias / 30) * 100), etiqueta: `Vence en ${dias} día(s)` };
  }
  return { color: 'var(--color-exito)', porcentaje: 0, etiqueta: `Vence en ${dias} días` };
}

export default function ConveniosDashboard() {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const res = await obtenerDashboardConvenios();
      if (res?.exito) setDatos(res.datos);
      else setError(res?.mensaje || 'No se pudo cargar el dashboard');
    } catch (err) {
      setError(err.message || 'No se pudo cargar el dashboard');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Mientras MBA3 se recalcula, se revisa el avance cada 5 s y se recarga al terminar.
  const enCurso = datos?.actualizacion?.en_curso;
  useEffect(() => {
    if (!enCurso) return undefined;
    const t = setInterval(async () => {
      try {
        const res = await obtenerDashboardConvenios();
        if (res?.exito) setDatos(res.datos);
      } catch { /* se reintenta en el siguiente ciclo */ }
    }, 5000);
    return () => clearInterval(t);
  }, [enCurso]);

  async function actualizar() {
    setError('');
    try {
      await actualizarDashboardConvenios();
      await cargar();
    } catch (err) {
      setError(err.message || 'No se pudo iniciar la actualización');
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Módulo · Comercial"
        title="Convenios de compra — Dashboard"
        subtitle="Estado global de los convenios: comprado, vendido y existencias de MBA3, plan y vigencia"
        actions={(
          <>
            <button className="btn-secundario" onClick={actualizar} disabled={enCurso}>
              {enCurso ? 'Actualizando…' : 'Actualizar desde MBA3'}
            </button>
            <Link to="/comercial/convenios" className="btn-secundario">Ver listado</Link>
          </>
        )}
      />

      {error && <p style={{ color: 'var(--color-error)' }}>{error}</p>}

      {cargando ? (
        <p style={{ color: 'var(--color-texto-claro)' }}>Cargando…</p>
      ) : datos && (
        <>
          <p style={{ color: 'var(--color-texto-claro)', fontSize: '0.85rem' }}>
            {enCurso
              ? `Actualizando desde MBA3: ${datos.actualizacion.procesadas} de ${datos.actualizacion.total} líneas…`
              : datos.actualizacion?.ultima_ejecucion_ok
                ? `Datos de MBA3 al ${new Date(datos.actualizacion.ultima_ejecucion_ok).toLocaleString('es-MX')}`
                : 'Aún no hay datos de MBA3: pulsa «Actualizar desde MBA3» (tarda varios minutos).'}
            {datos.actualizacion?.ultimo_resultado?.con_error > 0 && !enCurso
              ? ` · ${datos.actualizacion.ultimo_resultado.con_error} línea(s) con error en la última corrida`
              : ''}
          </p>
          <div className="grid-kpis" style={{ marginBottom: '1.5rem' }}>
            <TarjetaKPI titulo="Activos" valor={datos.kpis.activos} color="var(--color-primario)" />
            <TarjetaKPI titulo="Por vencer (30 días)" valor={datos.kpis.por_vencer} color="var(--color-advertencia)" />
            <TarjetaKPI titulo="Vencidos" valor={datos.kpis.vencidos} color="var(--color-error)" />
            <TarjetaKPI titulo="Sin ventas (60 días)" valor={datos.kpis.sin_movimientos_recientes} color="var(--color-advertencia)" />
            <TarjetaKPI titulo="Líneas con diferencia vs existencia" valor={datos.kpis.lineas_con_diferencia} color="var(--color-advertencia)" />
            <TarjetaKPI titulo="Líneas sin OC" valor={datos.kpis.lineas_sin_oc} color="var(--color-advertencia)" />
            <TarjetaKPI titulo="Líneas sin facturas" valor={datos.kpis.lineas_sin_facturas} color="var(--color-advertencia)" />
          </div>

          {datos.convenios.length === 0 ? (
            <p style={{ color: 'var(--color-texto-claro)', padding: '1rem' }}>No hay convenios que mostrar.</p>
          ) : (
            <table className="credito-tabla">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Vendedor</th>
                  <th>Estatus</th>
                  <th>Vendido vs. comprado</th>
                  <th>Existencia</th>
                  <th>Cumplimiento del plan</th>
                  <th>Vigencia</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {datos.convenios.map((c) => {
                  const ventas = estadoVentas(c);
                  const plan = estadoCumplimiento(c);
                  const dif = (Number(c.existencia) || 0) - ((Number(c.comprado) || 0) - (Number(c.vendido) || 0));
                  const vigencia = estadoVigencia(c);
                  return (
                    <tr key={c.id}>
                      <td>{c.cliente_nombre}</td>
                      <td>{c.vendedor_nombre}</td>
                      <td><span className={badgeClass(c.estatus)}>{c.estatus}</span></td>
                      <td><BarraProgreso porcentaje={ventas.porcentaje} color={ventas.color} etiqueta={ventas.etiqueta} /></td>
                      <td>
                        {c.calculado_en ? (
                          <>
                            {fmt(c.existencia)}
                            {Number(c.lineas_con_diferencia) > 0 && (
                              <span style={{ color: 'var(--color-advertencia)', fontSize: '0.78rem' }}>
                                {' '}· dif. {fmt(dif)} ({c.lineas_con_diferencia} línea(s))
                              </span>
                            )}
                          </>
                        ) : '—'}
                      </td>
                      <td><BarraProgreso porcentaje={plan.porcentaje} color={plan.color} etiqueta={plan.etiqueta} /></td>
                      <td><BarraProgreso porcentaje={vigencia.porcentaje} color={vigencia.color} etiqueta={vigencia.etiqueta} /></td>
                      <td>
                        <button className="btn-secundario" onClick={() => navigate(`/comercial/convenios/${c.id}`)}>Ver</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </>
  );
}
