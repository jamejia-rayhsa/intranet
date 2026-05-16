import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { obtenerSolicitud, crearSolicitud, actualizarSolicitud, cambiarEstado } from '../services/solicitudesCredito.service';
import '../styles/comercial.css';

const GIROS_INDUSTRIA = ['Aeroespacial', 'Farmacéutica', 'Petróleo', 'Alimenticia', 'Textil', 'Minería', 'Automotriz', 'Madera', 'Química', 'Construcción', 'Metalmecánica'];
const GIROS_DISTRIBUCION = ['Ferretería', 'Construcción', 'Distribuidor', 'Casa de Materiales'];
const SUCURSALES_INDUSTRIA = ['Corporativo', 'Querétaro', 'Puebla'];
const SUCURSALES_DISTRIBUCION = ['Corporativo', 'Querétaro', 'Puebla'];
const REGIMENES_FISCALES = ['Persona Física', 'Persona Moral', 'Otro'];
const METODOS_PAGO = ['PUE - Pago en una sola exhibición', 'PPD - Pago en parcialidades'];
const USOS_CFDI = ['G01 - Adquisición de mercancias', 'G03 - Gastos en general', 'Otro'];
const FORMAS_PAGO = ['Efectivo', 'Cheque nominativo', 'Transferencia electrónica', 'Tarjeta de crédito', 'Tarjeta de débito'];
const TIPOS_CUENTA = ['Corriente', 'Ahorro'];
const TIPO_REVISION = ['Presencial', 'Email', 'Portal'];

const PESTANAS = [
  { label: 'Datos Generales' },
  { label: 'Domicilios' },
  { label: 'Datos Bancarios' },
  { label: 'Condiciones Comerciales' },
  { label: 'Contactos' },
  { label: 'Referencias Comerciales' },
  { label: 'Revisión y PDF' },
];

const bancarioNacionalVacio = () => ({ banco: '', cuenta: '', tipo_cuenta: '', sucursal_banco: '', clabe: '' });
const bancarioExtranjeroVacio = () => ({ banco: '', cuenta: '', tipo_cuenta: '', swift: '', divisa: '' });
const contactoVacio = (tipo) => ({ tipo, nombre: '', email: '', telefono: '', extension: '', celular: '' });
const referenciaVacia = () => ({ empresa: '', nombre_contacto: '', telefono: '', email: '', pagina_web: '', calle: '', colonia: '', delegacion: '', estado: '', poblacion: '' });

const formularioInicial = {
  razon_social: '',
  rfc: '',
  tipo_cliente: '',
  sucursal: '',
  regimen_fiscal: '',
  moneda: 'MN',
  giro_negocio: '',
  metodo_pago: '',
  uso_cfdi: '',
  forma_pago: [],
  domicilio_fiscal: { calle: '', colonia: '', delegacion: '', estado: '', codigo_postal: '', pais: 'México' },
  domicilio_entrega: { calle: '', colonia: '', delegacion: '', estado: '', codigo_postal: '', pais: 'México', igual_fiscal: false },
  datos_bancarios_nacionales: [],
  datos_bancarios_extranjeros: [],
  condiciones_comerciales: {},
  contactos: [],
  referencias_comerciales: [],
  datos_proporcionados_nombre: '',
  datos_proporcionados_puesto: '',
  estado: 'borrador',
};

function Campo({ label, children, requerido }) {
  return (
    <div className="credito-campo">
      <label>{label}{requerido && <span style={{ color: 'var(--color-error)' }}> *</span>}</label>
      {children}
    </div>
  );
}

export default function SolicitudCreditoForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [pestanaActiva, setPestanaActiva] = useState(0);
  const [formulario, setFormulario] = useState(formularioInicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(!!id);

  const claveLS = `credito_borrador_${id || 'nueva'}`;

  useEffect(() => {
    if (id) {
      cargarSolicitud();
    } else {
      const guardado = localStorage.getItem(claveLS);
      if (guardado) {
        try { setFormulario(JSON.parse(guardado)); } catch (_) {}
      }
    }
  }, [id]);

  const autoguardar = useCallback(() => {
    const timer = setTimeout(() => {
      localStorage.setItem(claveLS, JSON.stringify(formulario));
    }, 1000);
    return () => clearTimeout(timer);
  }, [formulario, claveLS]);

  useEffect(() => {
    if (!id) return autoguardar();
  }, [formulario, autoguardar, id]);

  async function cargarSolicitud() {
    setCargando(true);
    const res = await obtenerSolicitud(id);
    if (res?.exito) {
      const d = res.datos;
      setFormulario({
        razon_social: d.razon_social || '',
        rfc: d.rfc || '',
        tipo_cliente: d.tipo_cliente || '',
        sucursal: d.sucursal || '',
        regimen_fiscal: d.regimen_fiscal || '',
        moneda: d.moneda || 'MN',
        giro_negocio: d.giro_negocio || '',
        metodo_pago: d.metodo_pago || '',
        uso_cfdi: d.uso_cfdi || '',
        forma_pago: d.forma_pago || [],
        domicilio_fiscal: d.domicilio_fiscal || formularioInicial.domicilio_fiscal,
        domicilio_entrega: d.domicilio_entrega || formularioInicial.domicilio_entrega,
        datos_bancarios_nacionales: d.datos_bancarios_nacionales || [],
        datos_bancarios_extranjeros: d.datos_bancarios_extranjeros || [],
        condiciones_comerciales: d.condiciones_comerciales || {},
        contactos: d.contactos || [],
        referencias_comerciales: d.referencias_comerciales || [],
        datos_proporcionados_nombre: d.datos_proporcionados_nombre || '',
        datos_proporcionados_puesto: d.datos_proporcionados_puesto || '',
        estado: d.estado || 'borrador',
      });
    }
    setCargando(false);
  }

  function actualizarCampo(campo, valor) {
    setFormulario(f => ({ ...f, [campo]: valor }));
  }

  function actualizarDomicilio(tipo, campo, valor) {
    setFormulario(f => ({
      ...f,
      [tipo]: { ...f[tipo], [campo]: valor }
    }));
  }

  function actualizarCondicion(campo, valor) {
    setFormulario(f => ({
      ...f,
      condiciones_comerciales: { ...f.condiciones_comerciales, [campo]: valor }
    }));
  }

  function agregarBancarioNacional() {
    setFormulario(f => ({ ...f, datos_bancarios_nacionales: [...f.datos_bancarios_nacionales, bancarioNacionalVacio()] }));
  }

  function eliminarBancarioNacional(idx) {
    setFormulario(f => ({ ...f, datos_bancarios_nacionales: f.datos_bancarios_nacionales.filter((_, i) => i !== idx) }));
  }

  function actualizarBancarioNacional(idx, campo, valor) {
    setFormulario(f => {
      const arr = [...f.datos_bancarios_nacionales];
      arr[idx] = { ...arr[idx], [campo]: valor };
      return { ...f, datos_bancarios_nacionales: arr };
    });
  }

  function agregarBancarioExtranjero() {
    setFormulario(f => ({ ...f, datos_bancarios_extranjeros: [...f.datos_bancarios_extranjeros, bancarioExtranjeroVacio()] }));
  }

  function eliminarBancarioExtranjero(idx) {
    setFormulario(f => ({ ...f, datos_bancarios_extranjeros: f.datos_bancarios_extranjeros.filter((_, i) => i !== idx) }));
  }

  function actualizarBancarioExtranjero(idx, campo, valor) {
    setFormulario(f => {
      const arr = [...f.datos_bancarios_extranjeros];
      arr[idx] = { ...arr[idx], [campo]: valor };
      return { ...f, datos_bancarios_extranjeros: arr };
    });
  }

  function obtenerContacto(tipo) {
    return formulario.contactos.find(c => c.tipo === tipo) || contactoVacio(tipo);
  }

  function actualizarContacto(tipo, campo, valor) {
    setFormulario(f => {
      const existe = f.contactos.findIndex(c => c.tipo === tipo);
      const arr = [...f.contactos];
      if (existe >= 0) {
        arr[existe] = { ...arr[existe], [campo]: valor };
      } else {
        arr.push({ ...contactoVacio(tipo), [campo]: valor });
      }
      return { ...f, contactos: arr };
    });
  }

  function agregarReferencia() {
    setFormulario(f => ({ ...f, referencias_comerciales: [...f.referencias_comerciales, referenciaVacia()] }));
  }

  function eliminarReferencia(idx) {
    setFormulario(f => ({ ...f, referencias_comerciales: f.referencias_comerciales.filter((_, i) => i !== idx) }));
  }

  function actualizarReferencia(idx, campo, valor) {
    setFormulario(f => {
      const arr = [...f.referencias_comerciales];
      arr[idx] = { ...arr[idx], [campo]: valor };
      return { ...f, referencias_comerciales: arr };
    });
  }

  function toggleFormaPago(fp) {
    setFormulario(f => {
      const arr = f.forma_pago.includes(fp)
        ? f.forma_pago.filter(x => x !== fp)
        : [...f.forma_pago, fp];
      return { ...f, forma_pago: arr };
    });
  }

  function validarPestana(n) {
    if (n === 0) {
      if (!formulario.razon_social) return 'Razón social es requerida';
      if (!formulario.rfc || (formulario.rfc.length !== 12 && formulario.rfc.length !== 13)) return 'RFC inválido (12 o 13 caracteres)';
      if (!formulario.tipo_cliente) return 'Tipo de cliente es requerido';
    }
    if (n === 2) {
      if (formulario.datos_bancarios_nacionales.length === 0) return 'Agregue al menos un banco nacional';
    }
    if (n === 4) {
      const compras = obtenerContacto('Compras');
      if (!compras.email) return 'El contacto de Compras debe tener email';
    }
    if (n === 5) {
      if (formulario.referencias_comerciales.length < 3) return 'Se requieren al menos 3 referencias comerciales';
      const incompleta = formulario.referencias_comerciales.find(r => !r.empresa || !r.telefono);
      if (incompleta) return 'Cada referencia debe tener empresa y teléfono';
    }
    return null;
  }

  function avanzar() {
    const err = validarPestana(pestanaActiva);
    if (err) { setError(err); return; }
    setError('');
    setPestanaActiva(p => Math.min(p + 1, PESTANAS.length - 1));
  }

  function retroceder() {
    setError('');
    setPestanaActiva(p => Math.max(p - 1, 0));
  }

  async function manejarGuardar(estadoDestino) {
    setGuardando(true);
    setError('');
    const datos = { ...formulario, estado: estadoDestino };
    let res;
    if (id) {
      res = await actualizarSolicitud(id, datos);
    } else {
      res = await crearSolicitud(datos);
    }
    if (res?.exito) {
      localStorage.removeItem(claveLS);
      if (!id && res.datos?.id) {
        navigate(`/comercial/creditos/${res.datos.id}/editar`, { replace: true });
      }
    } else {
      setError(res?.mensaje || 'Error al guardar la solicitud');
    }
    setGuardando(false);
  }

  async function manejarSincronizarMba3() {
    alert('Integración MBA3 pendiente de especificación. Contacte al administrador.');
  }

  const giros = formulario.tipo_cliente === 'INDUSTRIA' ? GIROS_INDUSTRIA : GIROS_DISTRIBUCION;
  const sucursales = formulario.tipo_cliente === 'INDUSTRIA' ? SUCURSALES_INDUSTRIA : SUCURSALES_DISTRIBUCION;
  const cc = formulario.condiciones_comerciales;

  if (cargando) {
    return <div className="pagina-contenedor"><p style={{ color: 'var(--color-texto-claro)' }}>Cargando solicitud...</p></div>;
  }

  return (
    <div className="pagina-contenedor">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--color-primario)' }}>
          {id ? 'Editar Solicitud de Crédito' : 'Nueva Solicitud de Crédito'}
        </h1>
        <button className="btn-secundario credito-sin-impresion" onClick={() => navigate('/comercial/creditos')}>
          Cancelar
        </button>
      </div>

      {error && (
        <div style={{ background: 'var(--color-error)', color: '#fff', padding: '0.6rem 1rem', borderRadius: 4, marginBottom: '1rem', fontSize: '0.88rem' }}>
          {error}
        </div>
      )}

      <nav className="credito-tabs-nav credito-sin-impresion">
        {PESTANAS.map((p, i) => (
          <button
            key={i}
            className={`credito-tab-btn${pestanaActiva === i ? ' activo' : ''}`}
            onClick={() => { setError(''); setPestanaActiva(i); }}
          >
            {i + 1}. {p.label}
          </button>
        ))}
      </nav>

      {/* PESTAÑA 0: Datos Generales */}
      {pestanaActiva === 0 && (
        <div className="credito-tab-content">
          <h3 className="credito-seccion-titulo">Datos Generales del Cliente</h3>
          <div className="credito-grid-2">
            <Campo label="Razón Social" requerido>
              <input type="text" value={formulario.razon_social} onChange={e => actualizarCampo('razon_social', e.target.value)} />
            </Campo>
            <Campo label="RFC" requerido>
              <input type="text" value={formulario.rfc} onChange={e => actualizarCampo('rfc', e.target.value.toUpperCase())} maxLength={13} />
            </Campo>
            <Campo label="Tipo de Cliente" requerido>
              <select value={formulario.tipo_cliente} onChange={e => actualizarCampo('tipo_cliente', e.target.value)}>
                <option value="">Seleccionar...</option>
                <option value="INDUSTRIA">INDUSTRIA</option>
                <option value="DISTRIBUCION">DISTRIBUCIÓN</option>
              </select>
            </Campo>
            <Campo label="Moneda">
              <select value={formulario.moneda} onChange={e => actualizarCampo('moneda', e.target.value)}>
                <option value="MN">MN (Pesos mexicanos)</option>
                <option value="USD">USD (Dólares)</option>
              </select>
            </Campo>
            {formulario.tipo_cliente && (
              <>
                <Campo label="Sucursal">
                  <select value={formulario.sucursal} onChange={e => actualizarCampo('sucursal', e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {sucursales.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Campo>
                <Campo label="Giro de Negocio">
                  <select value={formulario.giro_negocio} onChange={e => actualizarCampo('giro_negocio', e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {giros.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </Campo>
              </>
            )}
            <Campo label="Régimen Fiscal">
              <select value={formulario.regimen_fiscal} onChange={e => actualizarCampo('regimen_fiscal', e.target.value)}>
                <option value="">Seleccionar...</option>
                {REGIMENES_FISCALES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </Campo>
            <Campo label="Método de Pago">
              <select value={formulario.metodo_pago} onChange={e => actualizarCampo('metodo_pago', e.target.value)}>
                <option value="">Seleccionar...</option>
                {METODOS_PAGO.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Campo>
            <Campo label="Uso de CFDI">
              <select value={formulario.uso_cfdi} onChange={e => actualizarCampo('uso_cfdi', e.target.value)}>
                <option value="">Seleccionar...</option>
                {USOS_CFDI.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </Campo>
          </div>

          <h3 className="credito-seccion-titulo">Formas de Pago Aceptadas</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {FORMAS_PAGO.map(fp => (
              <label key={fp} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formulario.forma_pago.includes(fp)}
                  onChange={() => toggleFormaPago(fp)}
                />
                {fp}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* PESTAÑA 1: Domicilios */}
      {pestanaActiva === 1 && (
        <div className="credito-tab-content">
          <h3 className="credito-seccion-titulo">Domicilio Fiscal</h3>
          <div className="credito-grid-2">
            <Campo label="Calle y número">
              <input type="text" value={formulario.domicilio_fiscal.calle} onChange={e => actualizarDomicilio('domicilio_fiscal', 'calle', e.target.value)} />
            </Campo>
            <Campo label="Colonia">
              <input type="text" value={formulario.domicilio_fiscal.colonia} onChange={e => actualizarDomicilio('domicilio_fiscal', 'colonia', e.target.value)} />
            </Campo>
            <Campo label="Delegación / Municipio">
              <input type="text" value={formulario.domicilio_fiscal.delegacion} onChange={e => actualizarDomicilio('domicilio_fiscal', 'delegacion', e.target.value)} />
            </Campo>
            <Campo label="Estado">
              <input type="text" value={formulario.domicilio_fiscal.estado} onChange={e => actualizarDomicilio('domicilio_fiscal', 'estado', e.target.value)} />
            </Campo>
            <Campo label="Código Postal">
              <input type="text" value={formulario.domicilio_fiscal.codigo_postal} onChange={e => actualizarDomicilio('domicilio_fiscal', 'codigo_postal', e.target.value)} maxLength={5} />
            </Campo>
            <Campo label="País">
              <input type="text" value={formulario.domicilio_fiscal.pais} onChange={e => actualizarDomicilio('domicilio_fiscal', 'pais', e.target.value)} />
            </Campo>
          </div>

          <h3 className="credito-seccion-titulo">Domicilio de Entrega</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', marginBottom: '0.75rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!formulario.domicilio_entrega.igual_fiscal}
              onChange={e => {
                if (e.target.checked) {
                  setFormulario(f => ({ ...f, domicilio_entrega: { ...f.domicilio_fiscal, igual_fiscal: true } }));
                } else {
                  actualizarDomicilio('domicilio_entrega', 'igual_fiscal', false);
                }
              }}
            />
            Igual al domicilio fiscal
          </label>
          {!formulario.domicilio_entrega.igual_fiscal && (
            <div className="credito-grid-2">
              <Campo label="Calle y número">
                <input type="text" value={formulario.domicilio_entrega.calle} onChange={e => actualizarDomicilio('domicilio_entrega', 'calle', e.target.value)} />
              </Campo>
              <Campo label="Colonia">
                <input type="text" value={formulario.domicilio_entrega.colonia} onChange={e => actualizarDomicilio('domicilio_entrega', 'colonia', e.target.value)} />
              </Campo>
              <Campo label="Delegación / Municipio">
                <input type="text" value={formulario.domicilio_entrega.delegacion} onChange={e => actualizarDomicilio('domicilio_entrega', 'delegacion', e.target.value)} />
              </Campo>
              <Campo label="Estado">
                <input type="text" value={formulario.domicilio_entrega.estado} onChange={e => actualizarDomicilio('domicilio_entrega', 'estado', e.target.value)} />
              </Campo>
              <Campo label="Código Postal">
                <input type="text" value={formulario.domicilio_entrega.codigo_postal} onChange={e => actualizarDomicilio('domicilio_entrega', 'codigo_postal', e.target.value)} maxLength={5} />
              </Campo>
              <Campo label="País">
                <input type="text" value={formulario.domicilio_entrega.pais} onChange={e => actualizarDomicilio('domicilio_entrega', 'pais', e.target.value)} />
              </Campo>
            </div>
          )}
        </div>
      )}

      {/* PESTAÑA 2: Datos Bancarios */}
      {pestanaActiva === 2 && (
        <div className="credito-tab-content">
          <h3 className="credito-seccion-titulo">Bancos Nacionales</h3>
          <table className="credito-tabla-dinamica">
            <thead>
              <tr>
                <th>Banco</th>
                <th>No. Cuenta</th>
                <th>Tipo</th>
                <th>Sucursal</th>
                <th>CLABE</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {formulario.datos_bancarios_nacionales.map((b, i) => (
                <tr key={i}>
                  <td><input type="text" value={b.banco} onChange={e => actualizarBancarioNacional(i, 'banco', e.target.value)} placeholder="Nombre del banco" /></td>
                  <td><input type="text" value={b.cuenta} onChange={e => actualizarBancarioNacional(i, 'cuenta', e.target.value)} /></td>
                  <td>
                    <select value={b.tipo_cuenta} onChange={e => actualizarBancarioNacional(i, 'tipo_cuenta', e.target.value)}>
                      <option value="">...</option>
                      {TIPOS_CUENTA.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td><input type="text" value={b.sucursal_banco} onChange={e => actualizarBancarioNacional(i, 'sucursal_banco', e.target.value)} /></td>
                  <td><input type="text" value={b.clabe} onChange={e => actualizarBancarioNacional(i, 'clabe', e.target.value)} maxLength={18} /></td>
                  <td>
                    <button onClick={() => eliminarBancarioNacional(i)} style={{ background: 'var(--color-error)', color: '#fff', border: 'none', borderRadius: 3, padding: '0.2rem 0.5rem', cursor: 'pointer', fontSize: '0.75rem' }}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn-secundario" onClick={agregarBancarioNacional} style={{ fontSize: '0.82rem', marginBottom: '1.5rem' }}>
            + Agregar banco nacional
          </button>

          <h3 className="credito-seccion-titulo">Bancos Extranjeros</h3>
          <table className="credito-tabla-dinamica">
            <thead>
              <tr>
                <th>Banco</th>
                <th>No. Cuenta</th>
                <th>Tipo</th>
                <th>SWIFT</th>
                <th>Divisa</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {formulario.datos_bancarios_extranjeros.map((b, i) => (
                <tr key={i}>
                  <td><input type="text" value={b.banco} onChange={e => actualizarBancarioExtranjero(i, 'banco', e.target.value)} /></td>
                  <td><input type="text" value={b.cuenta} onChange={e => actualizarBancarioExtranjero(i, 'cuenta', e.target.value)} /></td>
                  <td>
                    <select value={b.tipo_cuenta} onChange={e => actualizarBancarioExtranjero(i, 'tipo_cuenta', e.target.value)}>
                      <option value="">...</option>
                      {TIPOS_CUENTA.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td><input type="text" value={b.swift} onChange={e => actualizarBancarioExtranjero(i, 'swift', e.target.value)} /></td>
                  <td><input type="text" value={b.divisa} onChange={e => actualizarBancarioExtranjero(i, 'divisa', e.target.value)} /></td>
                  <td>
                    <button onClick={() => eliminarBancarioExtranjero(i)} style={{ background: 'var(--color-error)', color: '#fff', border: 'none', borderRadius: 3, padding: '0.2rem 0.5rem', cursor: 'pointer', fontSize: '0.75rem' }}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn-secundario" onClick={agregarBancarioExtranjero} style={{ fontSize: '0.82rem' }}>
            + Agregar banco extranjero
          </button>
        </div>
      )}

      {/* PESTAÑA 3: Condiciones Comerciales */}
      {pestanaActiva === 3 && (
        <div className="credito-tab-content">
          <h3 className="credito-seccion-titulo">Condiciones Comerciales</h3>
          {formulario.tipo_cliente === 'INDUSTRIA' && (
            <div className="credito-grid-2">
              <Campo label="Días de crédito">
                <input type="number" min={0} value={cc.dias_credito || ''} onChange={e => actualizarCondicion('dias_credito', e.target.value)} />
              </Campo>
              <Campo label="Monto de crédito">
                <input type="number" min={0} value={cc.monto_credito || ''} onChange={e => actualizarCondicion('monto_credito', e.target.value)} />
              </Campo>
              <Campo label="Acepta facturas del mes anterior">
                <select value={cc.acepta_facturas_mes_anterior || ''} onChange={e => actualizarCondicion('acepta_facturas_mes_anterior', e.target.value)}>
                  <option value="">Seleccionar...</option>
                  <option value="Si">Sí</option>
                  <option value="No">No</option>
                </select>
              </Campo>
              <Campo label="Acepta entregas parciales">
                <select value={cc.acepta_entregas_parciales || ''} onChange={e => actualizarCondicion('acepta_entregas_parciales', e.target.value)}>
                  <option value="">Seleccionar...</option>
                  <option value="Si">Sí</option>
                  <option value="No">No</option>
                </select>
              </Campo>
              <Campo label="Tipo de revisión">
                <select value={cc.tipo_revision || ''} onChange={e => actualizarCondicion('tipo_revision', e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {TIPO_REVISION.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Campo>
              <Campo label="Horario de almacén">
                <input type="text" value={cc.horario_almacen || ''} onChange={e => actualizarCondicion('horario_almacen', e.target.value)} placeholder="Ej: Lunes a Viernes 8:00-17:00" />
              </Campo>
              <Campo label="No. empleados con EPP">
                <input type="number" min={0} value={cc.num_empleados_epp || ''} onChange={e => actualizarCondicion('num_empleados_epp', e.target.value)} />
              </Campo>
            </div>
          )}
          {formulario.tipo_cliente === 'DISTRIBUCION' && (
            <div className="credito-grid-2">
              <Campo label="Método de pago">
                <select value={cc.metodo_pago_condiciones || ''} onChange={e => actualizarCondicion('metodo_pago_condiciones', e.target.value)}>
                  <option value="">Seleccionar...</option>
                  <option value="PUE">PUE - Pago en una sola exhibición</option>
                  <option value="PPD">PPD - Pago en parcialidades</option>
                </select>
              </Campo>
              <Campo label="Línea fletera">
                <input type="text" value={cc.linea_fletera || ''} onChange={e => actualizarCondicion('linea_fletera', e.target.value)} />
              </Campo>
              <Campo label="Domicilio / Ocurre">
                <select value={cc.domicilio_ocurre || ''} onChange={e => actualizarCondicion('domicilio_ocurre', e.target.value)}>
                  <option value="">Seleccionar...</option>
                  <option value="Domicilio">Domicilio</option>
                  <option value="Ocurre">Ocurre</option>
                </select>
              </Campo>
            </div>
          )}
          {!formulario.tipo_cliente && (
            <p style={{ color: 'var(--color-texto-claro)', fontSize: '0.88rem' }}>
              Seleccione primero el tipo de cliente en la pestaña "Datos Generales".
            </p>
          )}
        </div>
      )}

      {/* PESTAÑA 4: Contactos */}
      {pestanaActiva === 4 && (
        <div className="credito-tab-content">
          {['Compras', 'CXP', ...(formulario.tipo_cliente === 'INDUSTRIA' ? ['Gerente de Ventas'] : []), ...(formulario.tipo_cliente === 'DISTRIBUCION' ? ['Almacén'] : [])].map(tipo => {
            const c = obtenerContacto(tipo);
            return (
              <div key={tipo}>
                <h3 className="credito-seccion-titulo">Contacto — {tipo}</h3>
                <div className="credito-grid-2">
                  <Campo label="Nombre">
                    <input type="text" value={c.nombre} onChange={e => actualizarContacto(tipo, 'nombre', e.target.value)} />
                  </Campo>
                  <Campo label="Email">
                    <input type="email" value={c.email} onChange={e => actualizarContacto(tipo, 'email', e.target.value)} />
                  </Campo>
                  <Campo label="Teléfono">
                    <input type="tel" value={c.telefono} onChange={e => actualizarContacto(tipo, 'telefono', e.target.value)} maxLength={10} />
                  </Campo>
                  <Campo label="Extensión">
                    <input type="text" value={c.extension} onChange={e => actualizarContacto(tipo, 'extension', e.target.value)} />
                  </Campo>
                  <Campo label="Celular">
                    <input type="tel" value={c.celular} onChange={e => actualizarContacto(tipo, 'celular', e.target.value)} maxLength={10} />
                  </Campo>
                </div>
              </div>
            );
          })}
          {!formulario.tipo_cliente && (
            <p style={{ color: 'var(--color-texto-claro)', fontSize: '0.88rem' }}>
              Seleccione primero el tipo de cliente en la pestaña "Datos Generales".
            </p>
          )}
        </div>
      )}

      {/* PESTAÑA 5: Referencias Comerciales */}
      {pestanaActiva === 5 && (
        <div className="credito-tab-content">
          <h3 className="credito-seccion-titulo">Referencias Comerciales (mínimo 3)</h3>
          {formulario.referencias_comerciales.map((r, i) => (
            <div key={i} style={{ border: '1px solid var(--color-borde)', borderRadius: 6, padding: '1rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <strong style={{ fontSize: '0.88rem' }}>Referencia {i + 1}</strong>
                <button onClick={() => eliminarReferencia(i)} style={{ background: 'var(--color-error)', color: '#fff', border: 'none', borderRadius: 3, padding: '0.2rem 0.6rem', cursor: 'pointer', fontSize: '0.78rem' }}>
                  Eliminar
                </button>
              </div>
              <div className="credito-grid-2">
                <Campo label="Empresa" requerido>
                  <input type="text" value={r.empresa} onChange={e => actualizarReferencia(i, 'empresa', e.target.value)} />
                </Campo>
                <Campo label="Nombre de contacto">
                  <input type="text" value={r.nombre_contacto} onChange={e => actualizarReferencia(i, 'nombre_contacto', e.target.value)} />
                </Campo>
                <Campo label="Teléfono" requerido>
                  <input type="tel" value={r.telefono} onChange={e => actualizarReferencia(i, 'telefono', e.target.value)} maxLength={10} />
                </Campo>
                <Campo label="Email">
                  <input type="email" value={r.email} onChange={e => actualizarReferencia(i, 'email', e.target.value)} />
                </Campo>
                <Campo label="Página web">
                  <input type="text" value={r.pagina_web} onChange={e => actualizarReferencia(i, 'pagina_web', e.target.value)} />
                </Campo>
                <Campo label="Calle">
                  <input type="text" value={r.calle} onChange={e => actualizarReferencia(i, 'calle', e.target.value)} />
                </Campo>
                <Campo label="Colonia">
                  <input type="text" value={r.colonia} onChange={e => actualizarReferencia(i, 'colonia', e.target.value)} />
                </Campo>
                <Campo label="Delegación / Municipio">
                  <input type="text" value={r.delegacion} onChange={e => actualizarReferencia(i, 'delegacion', e.target.value)} />
                </Campo>
                <Campo label="Estado">
                  <input type="text" value={r.estado} onChange={e => actualizarReferencia(i, 'estado', e.target.value)} />
                </Campo>
                <Campo label="Población">
                  <input type="text" value={r.poblacion} onChange={e => actualizarReferencia(i, 'poblacion', e.target.value)} />
                </Campo>
              </div>
            </div>
          ))}
          <button className="btn-secundario" onClick={agregarReferencia} style={{ fontSize: '0.85rem' }}>
            + Agregar referencia comercial
          </button>
        </div>
      )}

      {/* PESTAÑA 6: Revisión y PDF */}
      {pestanaActiva === 6 && (
        <div className="credito-tab-content">
          <h3 className="credito-seccion-titulo">Resumen de la Solicitud</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.88rem', marginBottom: '1.5rem' }}>
            {[
              ['Razón Social', formulario.razon_social],
              ['RFC', formulario.rfc],
              ['Tipo Cliente', formulario.tipo_cliente],
              ['Sucursal', formulario.sucursal],
              ['Moneda', formulario.moneda],
              ['Giro de Negocio', formulario.giro_negocio],
              ['Régimen Fiscal', formulario.regimen_fiscal],
              ['Método de Pago', formulario.metodo_pago],
              ['Uso CFDI', formulario.uso_cfdi],
              ['Bancos nacionales', formulario.datos_bancarios_nacionales.length],
              ['Bancos extranjeros', formulario.datos_bancarios_extranjeros.length],
              ['Referencias', formulario.referencias_comerciales.length],
              ['Estado actual', formulario.estado],
            ].map(([label, val]) => (
              <div key={label} style={{ display: 'flex', gap: '0.5rem', padding: '0.35rem', borderBottom: '1px solid var(--color-borde)' }}>
                <span style={{ fontWeight: 600, minWidth: 160, color: 'var(--color-texto-claro)' }}>{label}:</span>
                <span>{val || '—'}</span>
              </div>
            ))}
          </div>

          <h3 className="credito-seccion-titulo">Datos Proporcionados Por</h3>
          <div className="credito-grid-2">
            <Campo label="Nombre">
              <input type="text" value={formulario.datos_proporcionados_nombre} onChange={e => actualizarCampo('datos_proporcionados_nombre', e.target.value)} />
            </Campo>
            <Campo label="Puesto">
              <input type="text" value={formulario.datos_proporcionados_puesto} onChange={e => actualizarCampo('datos_proporcionados_puesto', e.target.value)} />
            </Campo>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.5rem' }} className="credito-sin-impresion">
            <button
              className="btn-secundario"
              onClick={() => manejarGuardar('borrador')}
              disabled={guardando}
            >
              {guardando ? 'Guardando...' : 'Guardar como Borrador'}
            </button>
            <button
              className="btn-primario"
              onClick={() => manejarGuardar('guardada')}
              disabled={guardando}
            >
              {guardando ? 'Guardando...' : 'Guardar Solicitud'}
            </button>
            <button
              className="btn-secundario"
              onClick={() => window.print()}
            >
              Imprimir / Descargar PDF
            </button>
            {(formulario.estado === 'guardada' || formulario.estado === 'aprobada') && (
              <button className="btn-secundario" onClick={manejarSincronizarMba3}>
                Sincronizar con MBA3
              </button>
            )}
          </div>
        </div>
      )}

      {/* Navegación entre pestañas */}
      <div className="credito-nav-botones credito-sin-impresion">
        <button className="btn-secundario" onClick={retroceder} disabled={pestanaActiva === 0}>
          Anterior
        </button>
        <button className="btn-primario" onClick={avanzar} disabled={pestanaActiva === PESTANAS.length - 1}>
          Siguiente
        </button>
      </div>

      {/* Vista de impresión — solo visible con @media print */}
      <div className="credito-impresion-solo" style={{ display: 'none' }}>
        <div className="credito-pdf-encabezado">
          <img src="/logo-rayhsa.png" alt="RAYHSA" style={{ height: 60, marginBottom: '0.5cm' }} onError={e => { e.target.style.display = 'none'; }} />
          <h2 style={{ margin: '0.2cm 0 0.1cm', fontSize: '14pt' }}>SOLICITUD DE CRÉDITO — {formulario.tipo_cliente}</h2>
          <p style={{ margin: 0, fontSize: '10pt' }}>Fecha: {new Date().toLocaleDateString('es-MX')}</p>
        </div>

        <div className="credito-pdf-seccion">
          <h3>Datos Generales</h3>
          <div className="credito-pdf-grid">
            {[['Razón Social', formulario.razon_social], ['RFC', formulario.rfc], ['Tipo Cliente', formulario.tipo_cliente], ['Sucursal', formulario.sucursal], ['Moneda', formulario.moneda], ['Giro', formulario.giro_negocio], ['Régimen Fiscal', formulario.regimen_fiscal], ['Método de Pago', formulario.metodo_pago]].map(([l, v]) => (
              <div key={l} className="credito-pdf-campo"><label>{l}</label><span>{v || ''}</span></div>
            ))}
          </div>
        </div>

        <div className="credito-pdf-seccion">
          <h3>Domicilio Fiscal</h3>
          <div className="credito-pdf-grid">
            {[['Calle', formulario.domicilio_fiscal.calle], ['Colonia', formulario.domicilio_fiscal.colonia], ['Delegación', formulario.domicilio_fiscal.delegacion], ['Estado', formulario.domicilio_fiscal.estado], ['C.P.', formulario.domicilio_fiscal.codigo_postal], ['País', formulario.domicilio_fiscal.pais]].map(([l, v]) => (
              <div key={l} className="credito-pdf-campo"><label>{l}</label><span>{v || ''}</span></div>
            ))}
          </div>
        </div>

        {formulario.datos_bancarios_nacionales.length > 0 && (
          <div className="credito-pdf-seccion">
            <h3>Datos Bancarios Nacionales</h3>
            {formulario.datos_bancarios_nacionales.map((b, i) => (
              <div key={i} className="credito-pdf-grid" style={{ marginBottom: '0.3cm' }}>
                {[['Banco', b.banco], ['Cuenta', b.cuenta], ['Tipo', b.tipo_cuenta], ['CLABE', b.clabe]].map(([l, v]) => (
                  <div key={l} className="credito-pdf-campo"><label>{l}</label><span>{v || ''}</span></div>
                ))}
              </div>
            ))}
          </div>
        )}

        {formulario.referencias_comerciales.length > 0 && (
          <div className="credito-pdf-seccion">
            <h3>Referencias Comerciales</h3>
            {formulario.referencias_comerciales.map((r, i) => (
              <div key={i} className="credito-pdf-grid" style={{ marginBottom: '0.3cm' }}>
                {[['Empresa', r.empresa], ['Contacto', r.nombre_contacto], ['Teléfono', r.telefono], ['Email', r.email]].map(([l, v]) => (
                  <div key={l} className="credito-pdf-campo"><label>{l}</label><span>{v || ''}</span></div>
                ))}
              </div>
            ))}
          </div>
        )}

        <div className="credito-pdf-firma-area">
          <div className="credito-pdf-firma-linea">
            {formulario.datos_proporcionados_nombre || '____________________________'}<br />
            Datos proporcionados por<br />
            Puesto: {formulario.datos_proporcionados_puesto || '____________________'}
          </div>
          <div className="credito-pdf-firma-linea">
            ____________________________<br />
            Autorización Crédito Rayhsa<br />
            Fecha: {new Date().toLocaleDateString('es-MX')}
          </div>
        </div>
      </div>
    </div>
  );
}
