// modules/comercial/frontend/pages/ConvenioForm.jsx
// Alta/edición mínima de un convenio de compra (Fase 1: captura manual, sin catálogos de MBA3).
// Edición solo es posible mientras el convenio está pendiente_autorizacion (lo hace cumplir el backend).

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  obtenerConvenio, crearConvenio, actualizarConvenio,
  buscarFichaClienteMba3, buscarVendedorMba3, buscarProductoMba3, buscarProductoPorNombreMba3,
} from '../services/convenios.service';
import PageHeader from '../../../portal/frontend/components/PageHeader';
import '../styles/comercial.css';

const PERIODOS = ['mensual', 'bimestral', 'trimestral', 'unico'];

// Fase 2 (autocompletar al teclear un código): igual que el backend, el nombre exacto de campo
// que devuelve MBA3 por registro no está confirmado (solo el body de ficha-cliente lo está), así
// que se intentan varios nombres plausibles en orden. Ver mba3Catalogo.service.js en el backend.
function extraerCampo(registro, nombres) {
  if (!registro || typeof registro !== 'object') return null;
  for (const nombre of nombres) {
    const valor = registro[nombre];
    if (valor !== undefined && valor !== null && String(valor).trim()) return String(valor).trim();
  }
  return null;
}

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

  // Búsqueda de producto por nombre (MBA3 no tiene "listar todos los productos" como sí hay para
  // vendedores — decisión humana 2026-11-10: buscar por código exacto Y por nombre). Estado por
  // línea: término tecleado, resultados encontrados, y si está buscando.
  const [terminoBusqueda, setTerminoBusqueda] = useState({});
  const [resultadosBusqueda, setResultadosBusqueda] = useState({});
  const [buscandoNombre, setBuscandoNombre] = useState({});

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

  // Autocompletar best-effort: un fallo (MBA3 no configurado/sin red/código inexistente) se
  // ignora en silencio aquí; el backend vuelve a intentarlo al guardar y nunca bloquea el envío
  // (ver convenio.controller.js#resolverSnapshots). Esto solo ahorra teclear el nombre a mano.
  async function autocompletarCliente(codigo) {
    if (!codigo || !codigo.trim()) return;
    try {
      const res = await buscarFichaClienteMba3(codigo.trim());
      const nombre = extraerCampo(res?.datos, ['nombre', 'cliente_nombre', 'razon_social', 'nombre_cliente']);
      if (nombre) setCabecera(c => ({ ...c, cliente_nombre: nombre }));
    } catch (_err) { /* best-effort */ }
  }

  // R-F2-1: antes se tomaba `res.datos[0]` sin verificar el código; ahora solo se acepta el
  // registro cuyo `codigo` coincide EXACTO con el buscado (defensa en profundidad: el backend ya
  // filtra exacto, pero esta capa no debe confiar ciegamente en "el primero que venga").
  function encontrarExacto(res, codigo) {
    const buscado = codigo.toLowerCase();
    const lista = Array.isArray(res?.datos) ? res.datos : (res?.datos ? [res.datos] : []);
    return lista.find((r) => String(r?.codigo ?? '').trim().toLowerCase() === buscado) || null;
  }

  async function autocompletarVendedor(codigo) {
    if (!codigo || !codigo.trim()) return;
    try {
      const res = await buscarVendedorMba3(codigo.trim());
      const registro = encontrarExacto(res, codigo.trim());
      const nombre = extraerCampo(registro, ['nombre', 'vendedor_nombre', 'nombre_vendedor']);
      if (nombre) setCabecera(c => ({ ...c, vendedor_nombre: nombre }));
    } catch (_err) { /* best-effort */ }
  }

  async function autocompletarProducto(i, codigo) {
    if (!codigo || !codigo.trim()) return;
    try {
      const res = await buscarProductoMba3(codigo.trim());
      const registro = encontrarExacto(res, codigo.trim());
      const descripcion = extraerCampo(registro, ['DESCRIPCION', 'NOM_PRODUCTO', 'descripcion', 'producto_descripcion', 'nombre', 'descripcion_producto']);
      if (descripcion) cambiarLinea(i, 'producto_descripcion', descripcion);
    } catch (_err) { /* best-effort */ }
  }

  // Búsqueda por nombre: MBA3 no tiene "listar todos los productos", así que esto es la única
  // forma de encontrar un producto sin saber ya su código exacto. Muestra una lista de
  // coincidencias para que el usuario elija (nunca se autocompleta solo, a diferencia del código).
  async function buscarProductoPorNombre(i) {
    const termino = (terminoBusqueda[i] || '').trim();
    if (!termino) return;
    setBuscandoNombre(b => ({ ...b, [i]: true }));
    setError('');
    try {
      const res = await buscarProductoPorNombreMba3(termino);
      const lista = Array.isArray(res?.datos) ? res.datos : [];
      setResultadosBusqueda(r => ({ ...r, [i]: lista }));
    } catch (err) {
      setError(err.message || 'No se pudo buscar el producto por nombre');
      setResultadosBusqueda(r => ({ ...r, [i]: [] }));
    } finally {
      setBuscandoNombre(b => ({ ...b, [i]: false }));
    }
  }

  function elegirProductoBuscado(i, registro) {
    const codigo = extraerCampo(registro, ['PRODUCTO', 'codigo', 'codigo_producto']);
    const descripcion = extraerCampo(registro, ['DESCRIPCION', 'NOM_PRODUCTO', 'descripcion', 'producto_descripcion', 'nombre', 'descripcion_producto']);
    if (codigo) cambiarLinea(i, 'producto_codigo', codigo);
    if (descripcion) cambiarLinea(i, 'producto_descripcion', descripcion);
    setResultadosBusqueda(r => ({ ...r, [i]: [] }));
    setTerminoBusqueda(t => ({ ...t, [i]: '' }));
  }

  function cambiarLinea(i, campo, valor) {
    setProductos(ps => ps.map((p, idx) => (idx === i ? { ...p, [campo]: valor } : p)));
  }

  function agregarLinea() {
    setProductos(ps => [...ps, { ...LINEA_VACIA }]);
  }

  function quitarLinea(i) {
    setProductos(ps => (ps.length > 1 ? ps.filter((_, idx) => idx !== i) : ps));
    // Los índices de las líneas se recorren tras quitar una: la búsqueda por nombre es estado
    // transitorio de UI, así que es más simple limpiarla toda que reindexarla.
    setTerminoBusqueda({});
    setResultadosBusqueda({});
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
          <label>Código de cliente (opcional, autocompleta el nombre desde MBA3)
            <input
              value={cabecera.cliente_codigo}
              onChange={e => cambiarCabecera('cliente_codigo', e.target.value)}
              onBlur={e => autocompletarCliente(e.target.value)}
            />
          </label>
          <label>Nombre del cliente *
            <input required value={cabecera.cliente_nombre} onChange={e => cambiarCabecera('cliente_nombre', e.target.value)} />
          </label>
          <label>Código de vendedor (opcional, autocompleta el nombre desde MBA3)
            <input
              value={cabecera.vendedor_codigo}
              onChange={e => cambiarCabecera('vendedor_codigo', e.target.value)}
              onBlur={e => autocompletarVendedor(e.target.value)}
            />
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
            <input
              placeholder="Código de producto"
              value={p.producto_codigo}
              onChange={e => cambiarLinea(i, 'producto_codigo', e.target.value)}
              onBlur={e => autocompletarProducto(i, e.target.value)}
            />
            <span style={{ display: 'inline-flex', gap: '0.3rem' }}>
              <input
                placeholder="Buscar producto por nombre"
                value={terminoBusqueda[i] || ''}
                onChange={e => setTerminoBusqueda(t => ({ ...t, [i]: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); buscarProductoPorNombre(i); } }}
              />
              <button type="button" className="btn-secundario" onClick={() => buscarProductoPorNombre(i)} disabled={buscandoNombre[i]}>
                {buscandoNombre[i] ? 'Buscando…' : 'Buscar'}
              </button>
            </span>
            {Array.isArray(resultadosBusqueda[i]) && resultadosBusqueda[i].length > 0 && (
              <ul className="convenio-resultados-busqueda">
                {resultadosBusqueda[i].map((registro, idx) => {
                  const codigo = extraerCampo(registro, ['PRODUCTO', 'codigo', 'codigo_producto']);
                  const descripcion = extraerCampo(registro, ['DESCRIPCION', 'NOM_PRODUCTO', 'descripcion', 'producto_descripcion', 'nombre', 'descripcion_producto']);
                  return (
                    <li key={codigo || idx}>
                      <button type="button" className="btn-secundario" onClick={() => elegirProductoBuscado(i, registro)}>
                        {codigo || '(sin código)'} — {descripcion || '(sin descripción)'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {Array.isArray(resultadosBusqueda[i]) && resultadosBusqueda[i].length === 0 && (
              <p className="convenio-sin-resultados">Sin resultados para esa búsqueda</p>
            )}
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
