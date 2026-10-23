// modules/comercial/frontend/pages/ConvenioForm.jsx
// Alta/edición mínima de un convenio de compra (Fase 1: captura manual, sin catálogos de MBA3).
// Edición solo es posible mientras el convenio está pendiente_autorizacion (lo hace cumplir el backend).

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { obtenerConvenio, crearConvenio, actualizarConvenio } from '../services/convenios.service';
import PageHeader from '../../../portal/frontend/components/PageHeader';
import '../styles/comercial.css';

const PERIODOS = ['mensual', 'bimestral', 'trimestral', 'unico'];

const LINEA_VACIA = {
  producto_codigo: '', producto_descripcion: '', empaque: '', unidad_medida: '',
  cantidad_periodica: '', periodo: 'mensual', precio_compra: '', precio_venta: '', factor: '',
};

export default function ConvenioForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editando = Boolean(id);

  const [cabecera, setCabecera] = useState({
    folio_origen: '', cliente_codigo: '', cliente_nombre: '', vendedor_codigo: '', vendedor_nombre: '',
    fecha_inicio: '', vigente_hasta: '', observaciones: '',
  });
  const [productos, setProductos] = useState([{ ...LINEA_VACIA }]);
  const [cargando, setCargando] = useState(editando);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  // R-11: sin esto, un error de red/404 dejaba el formulario vacío sin aviso y, al "Guardar", la
  // actualización sobrescribía el convenio real con datos en blanco. `cargaFallida` bloquea el envío.
  const [cargaFallida, setCargaFallida] = useState(false);

  useEffect(() => {
    if (!editando) return;
    obtenerConvenio(id).then(res => {
      if (res?.exito) {
        const c = res.datos;
        setCabecera({
          folio_origen: c.folio_origen || '', cliente_codigo: c.cliente_codigo || '', cliente_nombre: c.cliente_nombre || '',
          vendedor_codigo: c.vendedor_codigo || '', vendedor_nombre: c.vendedor_nombre || '',
          fecha_inicio: (c.fecha_inicio || '').slice(0, 10), vigente_hasta: (c.vigente_hasta || '').slice(0, 10),
          observaciones: c.observaciones || '',
        });
        setProductos((c.productos || []).map(p => ({
          producto_codigo: p.producto_codigo || '', producto_descripcion: p.producto_descripcion || '',
          empaque: p.empaque ?? '', unidad_medida: p.unidad_medida || '', cantidad_periodica: p.cantidad_periodica ?? '',
          periodo: p.periodo || 'mensual', precio_compra: p.precio_compra ?? '', precio_venta: p.precio_venta ?? '',
          factor: p.factor ?? '',
        })));
      } else {
        setCargaFallida(true);
        setError('No se pudo cargar el convenio a editar');
      }
    }).catch(err => {
      setCargaFallida(true);
      setError(err.message || 'No se pudo cargar el convenio a editar');
    }).finally(() => setCargando(false));
  }, [id, editando]);

  function cambiarCabecera(campo, valor) {
    setCabecera(c => ({ ...c, [campo]: valor }));
  }

  function cambiarLinea(i, campo, valor) {
    setProductos(ps => ps.map((p, idx) => (idx === i ? { ...p, [campo]: valor } : p)));
  }

  function agregarLinea() {
    setProductos(ps => [...ps, { ...LINEA_VACIA }]);
  }

  function quitarLinea(i) {
    setProductos(ps => (ps.length > 1 ? ps.filter((_, idx) => idx !== i) : ps));
  }

  async function guardar(e) {
    e.preventDefault();
    if (cargaFallida) return; // no sobrescribir el convenio real con un formulario que no se cargó
    setError('');
    setGuardando(true);
    const datos = {
      ...cabecera,
      vigente_hasta: cabecera.vigente_hasta || null,
      productos: productos.map(p => ({
        ...p,
        empaque: p.empaque === '' ? null : Number(p.empaque),
        cantidad_periodica: Number(p.cantidad_periodica),
        precio_compra: p.precio_compra === '' ? null : Number(p.precio_compra),
        precio_venta: p.precio_venta === '' ? null : Number(p.precio_venta),
        factor: p.factor === '' ? null : Number(p.factor),
      })),
    };
    try {
      if (editando) {
        await actualizarConvenio(id, datos);
      } else {
        await crearConvenio(datos);
      }
      navigate('/comercial/convenios');
    } catch (err) {
      setError(err.message || 'Error al guardar el convenio');
    } finally {
      setGuardando(false);
    }
  }

  if (cargando) return <p style={{ color: 'var(--color-texto-claro)' }}>Cargando…</p>;

  return (
    <>
      <PageHeader
        eyebrow="Módulo · Comercial"
        title={editando ? 'Editar convenio' : 'Nuevo convenio de compra'}
        subtitle="Cliente, vendedor y una o más líneas de producto a comprar en mínimos de paquete"
      />

      {error && <p style={{ color: 'var(--color-error)' }}>{error}</p>}

      <form onSubmit={guardar} className="credito-tabs" style={{ display: 'block' }}>
        <div className="convenio-grid">
          <label>Folio de origen (opcional)
            <input value={cabecera.folio_origen} onChange={e => cambiarCabecera('folio_origen', e.target.value)} />
          </label>
          <label>Código de cliente (opcional)
            <input value={cabecera.cliente_codigo} onChange={e => cambiarCabecera('cliente_codigo', e.target.value)} />
          </label>
          <label>Nombre del cliente *
            <input required value={cabecera.cliente_nombre} onChange={e => cambiarCabecera('cliente_nombre', e.target.value)} />
          </label>
          <label>Código de vendedor (opcional)
            <input value={cabecera.vendedor_codigo} onChange={e => cambiarCabecera('vendedor_codigo', e.target.value)} />
          </label>
          <label>Nombre del vendedor *
            <input required value={cabecera.vendedor_nombre} onChange={e => cambiarCabecera('vendedor_nombre', e.target.value)} />
          </label>
          <label>Fecha de inicio *
            <input required type="date" value={cabecera.fecha_inicio} onChange={e => cambiarCabecera('fecha_inicio', e.target.value)} />
          </label>
          <label>Vigente hasta (vacío = abierta)
            <input type="date" value={cabecera.vigente_hasta} onChange={e => cambiarCabecera('vigente_hasta', e.target.value)} />
          </label>
          <label style={{ gridColumn: '1 / -1' }}>Observaciones
            <textarea value={cabecera.observaciones} onChange={e => cambiarCabecera('observaciones', e.target.value)} />
          </label>
        </div>

        <h3 style={{ marginTop: '1.5rem' }}>Líneas de producto</h3>
        {productos.map((p, i) => (
          <div key={i} className="convenio-linea">
            <input placeholder="Código de producto" value={p.producto_codigo} onChange={e => cambiarLinea(i, 'producto_codigo', e.target.value)} />
            <input placeholder="Descripción *" required value={p.producto_descripcion} onChange={e => cambiarLinea(i, 'producto_descripcion', e.target.value)} />
            <input placeholder="Empaque" type="number" value={p.empaque} onChange={e => cambiarLinea(i, 'empaque', e.target.value)} />
            <input placeholder="Unidad (ej. PZ)" value={p.unidad_medida} onChange={e => cambiarLinea(i, 'unidad_medida', e.target.value)} />
            <input placeholder="Cantidad a facturar *" type="number" required min="0.0001" step="any" value={p.cantidad_periodica} onChange={e => cambiarLinea(i, 'cantidad_periodica', e.target.value)} />
            <select value={p.periodo} onChange={e => cambiarLinea(i, 'periodo', e.target.value)}>
              {PERIODOS.map(per => <option key={per} value={per}>{per}</option>)}
            </select>
            <input placeholder="Precio compra" type="number" value={p.precio_compra} onChange={e => cambiarLinea(i, 'precio_compra', e.target.value)} />
            <input placeholder="Precio venta" type="number" value={p.precio_venta} onChange={e => cambiarLinea(i, 'precio_venta', e.target.value)} />
            <input placeholder="Factor" type="number" value={p.factor} onChange={e => cambiarLinea(i, 'factor', e.target.value)} />
            <button type="button" className="btn-secundario" onClick={() => quitarLinea(i)} disabled={productos.length === 1}>Quitar</button>
          </div>
        ))}
        <button type="button" className="btn-secundario" onClick={agregarLinea}>+ Agregar línea</button>

        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.6rem' }}>
          <button type="submit" className="btn-primario" disabled={guardando || cargaFallida}>
            {guardando ? 'Guardando…' : 'Guardar convenio'}
          </button>
          <button type="button" className="btn-secundario" onClick={() => navigate('/comercial/convenios')}>Cancelar</button>
        </div>
      </form>
    </>
  );
}
