# Fase 1: Auditoría — Revisión + Dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revisar y estabilizar el módulo de auditoría, agregar endpoints de dashboard y crear el tablero visual con KPIs y gráficas.

**Architecture:** El dashboard de auditoría se compone de: (1) un nuevo endpoint `GET /api/auditoria/dashboard` en el backend que agrega datos de la tabla `auditoria`, y (2) tres componentes React reutilizables (`TarjetaKPI`, `GraficaBarras`, `GraficaDona`) creados en el frontend del portal que son consumidos por `AuditoriaDashboard.jsx`. El módulo de auditoría importa los componentes compartidos del portal.

**Tech Stack:** Node.js + Express + PostgreSQL (pg), React 18 + Vite, Recharts 2.x, Jest + Supertest.

---

## Archivos

**Crear:**
- `modules/auditoria/backend/controllers/auditoria.dashboard.controller.js`
- `modules/auditoria/backend/routes/auditoria.dashboard.routes.js`
- `modules/auditoria/frontend/pages/AuditoriaDashboard.jsx`
- `modules/portal/frontend/components/TarjetaKPI.jsx`
- `modules/portal/frontend/components/GraficaBarras.jsx`
- `modules/portal/frontend/components/GraficaDona.jsx`

**Modificar:**
- `modules/auditoria/backend/app.js` — montar ruta de dashboard
- `modules/portal/frontend/main.jsx` — ruta `/auditoria` → `AuditoriaDashboard` (actualmente apunta a `AuditoriaPage`)
- `modules/portal/frontend/package.json` — agregar recharts
- `modules/auditoria/backend/package.json` — agregar supertest a devDependencies

---

## Tarea 1: Instalar Recharts en el frontend

**Archivos:** `modules/portal/frontend/package.json`

- [ ] **Paso 1.1: Instalar recharts**

```bash
cd modules/portal/frontend && npm install recharts
```

Salida esperada: `added N packages` sin errores.

- [ ] **Paso 1.2: Verificar que recharts aparece en package.json**

```bash
grep recharts modules/portal/frontend/package.json
```

Salida esperada: `"recharts": "^2.x.x"`

- [ ] **Paso 1.3: Commit**

```bash
git add modules/portal/frontend/package.json modules/portal/frontend/package-lock.json
git commit -m "chore: agregar recharts al frontend del portal"
```

---

## Tarea 2: Componente TarjetaKPI

**Archivos:**
- Crear: `modules/portal/frontend/components/TarjetaKPI.jsx`

- [ ] **Paso 2.1: Crear el componente**

```jsx
// modules/portal/frontend/components/TarjetaKPI.jsx
export default function TarjetaKPI({ titulo, valor, color = '#1a5276', icono }) {
  return (
    <div style={{
      background: '#fff',
      border: `1px solid #dce1e6`,
      borderTop: `3px solid ${color}`,
      borderRadius: '8px',
      padding: '1.25rem',
      flex: 1,
      minWidth: '150px',
    }}>
      <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#7f8c8d', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
        {icono && <span style={{ marginRight: '0.4rem' }}>{icono}</span>}
        {titulo}
      </div>
      <div style={{ fontSize: '2rem', fontWeight: 700, color: '#2c3e50' }}>
        {valor ?? '—'}
      </div>
    </div>
  );
}
```

- [ ] **Paso 2.2: Commit**

```bash
git add modules/portal/frontend/components/TarjetaKPI.jsx
git commit -m "feat: agregar componente TarjetaKPI reutilizable"
```

---

## Tarea 3: Componente GraficaBarras

**Archivos:**
- Crear: `modules/portal/frontend/components/GraficaBarras.jsx`

- [ ] **Paso 3.1: Crear el componente**

```jsx
// modules/portal/frontend/components/GraficaBarras.jsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// datos: [{ nombre: 'Ene', valor: 42 }, ...]
// series: [{ clave: 'valor', color: '#1a5276', etiqueta: 'Eventos' }]
export default function GraficaBarras({ datos = [], series = [], alto = 280 }) {
  if (!datos.length) {
    return (
      <div style={{ height: alto, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7f8c8d', fontSize: '0.9rem' }}>
        Sin datos
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={alto}>
      <BarChart data={datos} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey="nombre" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
        <Tooltip />
        {series.length > 1 && <Legend />}
        {series.map((s) => (
          <Bar key={s.clave} dataKey={s.clave} name={s.etiqueta || s.clave} fill={s.color || '#1a5276'} radius={[3, 3, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Paso 3.2: Commit**

```bash
git add modules/portal/frontend/components/GraficaBarras.jsx
git commit -m "feat: agregar componente GraficaBarras reutilizable"
```

---

## Tarea 4: Componente GraficaDona

**Archivos:**
- Crear: `modules/portal/frontend/components/GraficaDona.jsx`

- [ ] **Paso 4.1: Crear el componente**

```jsx
// modules/portal/frontend/components/GraficaDona.jsx
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORES_POR_DEFECTO = ['#1a5276', '#2e86c1', '#27ae60', '#f39c12', '#e74c3c', '#8e44ad'];

// datos: [{ nombre: 'INSERT', valor: 120 }, ...]
export default function GraficaDona({ datos = [], alto = 280 }) {
  if (!datos.length) {
    return (
      <div style={{ height: alto, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7f8c8d', fontSize: '0.9rem' }}>
        Sin datos
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={alto}>
      <PieChart>
        <Pie data={datos} dataKey="valor" nameKey="nombre" cx="50%" cy="50%" innerRadius="55%" outerRadius="75%" paddingAngle={3}>
          {datos.map((_, i) => (
            <Cell key={i} fill={COLORES_POR_DEFECTO[i % COLORES_POR_DEFECTO.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v) => v.toLocaleString()} />
        <Legend iconType="circle" iconSize={10} />
      </PieChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Paso 4.2: Commit**

```bash
git add modules/portal/frontend/components/GraficaDona.jsx
git commit -m "feat: agregar componente GraficaDona reutilizable"
```

---

## Tarea 5: Endpoint backend del dashboard de auditoría

**Archivos:**
- Crear: `modules/auditoria/backend/controllers/auditoria.dashboard.controller.js`
- Crear: `modules/auditoria/backend/routes/auditoria.dashboard.routes.js`
- Modificar: `modules/auditoria/backend/app.js`

- [ ] **Paso 5.1: Agregar supertest a auditoria backend**

```bash
cd modules/auditoria/backend && npm install --save-dev supertest
```

- [ ] **Paso 5.2: Escribir test del endpoint dashboard (falla primero)**

Crear `modules/auditoria/backend/tests/auditoria.dashboard.test.js`:

```javascript
const request = require('supertest');
const express = require('express');

jest.mock('../config/database', () => ({
  grupo: {
    query: jest.fn(),
  },
}));

const { grupo } = require('../config/database');

describe('GET /api/auditoria/dashboard', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    // Mock auth: inyecta usuario con rol super_admin
    app.use((req, _res, next) => {
      req.user = { usuario_id: 1, rol_nombre: 'super_admin' };
      next();
    });
    app.use('/api/auditoria', require('../routes/auditoria.dashboard.routes'));
  });

  afterEach(() => jest.clearAllMocks());

  it('debería devolver los KPIs del dashboard', async () => {
    // Mock de las 4 queries de KPI
    grupo.query
      .mockResolvedValueOnce({ rows: [{ total: '5' }] })   // eventos hoy
      .mockResolvedValueOnce({ rows: [{ total: '120' }] })  // eventos mes
      .mockResolvedValueOnce({ rows: [{ total: '8' }] })    // usuarios activos
      .mockResolvedValueOnce({ rows: [{ total: '4' }] })    // modulos monitoreados
      .mockResolvedValueOnce({ rows: [] })                   // eventos por día
      .mockResolvedValueOnce({ rows: [] });                  // distribución acciones

    const resp = await request(app).get('/api/auditoria/dashboard');

    expect(resp.status).toBe(200);
    expect(resp.body.exito).toBe(true);
    expect(resp.body.datos.kpis.eventos_hoy).toBe(5);
    expect(resp.body.datos.kpis.eventos_mes).toBe(120);
    expect(resp.body.datos.kpis.usuarios_activos).toBe(8);
    expect(resp.body.datos.kpis.modulos_monitoreados).toBe(4);
    expect(Array.isArray(resp.body.datos.eventos_por_dia)).toBe(true);
    expect(Array.isArray(resp.body.datos.distribucion_acciones)).toBe(true);
  });

  it('debería devolver 500 si la base de datos falla', async () => {
    grupo.query.mockRejectedValueOnce(new Error('DB error'));

    const resp = await request(app).get('/api/auditoria/dashboard');
    expect(resp.status).toBe(500);
    expect(resp.body.exito).toBe(false);
  });
});
```

- [ ] **Paso 5.3: Ejecutar test — debe fallar**

```bash
cd modules/auditoria/backend && npm test -- --testPathPattern=dashboard
```

Salida esperada: FAIL — `Cannot find module '../routes/auditoria.dashboard.routes'`

- [ ] **Paso 5.4: Crear el controlador del dashboard**

```javascript
// modules/auditoria/backend/controllers/auditoria.dashboard.controller.js
const { grupo } = require('../config/database');

const AuditoriaDashboardController = {
  async obtenerDashboard(req, res) {
    try {
      const [
        eventosHoy,
        eventosMes,
        usuariosActivos,
        modulosMonitoreados,
        eventosPorDia,
        distribucionAcciones,
      ] = await Promise.all([
        grupo.query(`SELECT COUNT(*) AS total FROM auditoria WHERE DATE(fecha) = CURRENT_DATE`),
        grupo.query(`SELECT COUNT(*) AS total FROM auditoria WHERE DATE_TRUNC('month', fecha) = DATE_TRUNC('month', CURRENT_DATE)`),
        grupo.query(`SELECT COUNT(DISTINCT usuario_id) AS total FROM auditoria WHERE DATE_TRUNC('month', fecha) = DATE_TRUNC('month', CURRENT_DATE)`),
        grupo.query(`SELECT COUNT(DISTINCT modulo) AS total FROM auditoria WHERE DATE_TRUNC('month', fecha) = DATE_TRUNC('month', CURRENT_DATE)`),
        grupo.query(`
          SELECT TO_CHAR(DATE(fecha), 'DD/MM') AS nombre, COUNT(*) AS valor
          FROM auditoria
          WHERE fecha >= CURRENT_DATE - INTERVAL '29 days'
          GROUP BY DATE(fecha)
          ORDER BY DATE(fecha)
        `),
        grupo.query(`
          SELECT accion AS nombre, COUNT(*) AS valor
          FROM auditoria
          GROUP BY accion
          ORDER BY valor DESC
        `),
      ]);

      res.json({
        exito: true,
        datos: {
          kpis: {
            eventos_hoy: parseInt(eventosHoy.rows[0].total),
            eventos_mes: parseInt(eventosMes.rows[0].total),
            usuarios_activos: parseInt(usuariosActivos.rows[0].total),
            modulos_monitoreados: parseInt(modulosMonitoreados.rows[0].total),
          },
          eventos_por_dia: eventosPorDia.rows.map(r => ({ nombre: r.nombre, valor: parseInt(r.valor) })),
          distribucion_acciones: distribucionAcciones.rows.map(r => ({ nombre: r.nombre, valor: parseInt(r.valor) })),
        },
      });
    } catch (error) {
      console.error('Error al obtener dashboard de auditoría:', error);
      res.status(500).json({ exito: false, mensaje: 'Error al obtener el dashboard', error: error.message });
    }
  },
};

module.exports = AuditoriaDashboardController;
```

- [ ] **Paso 5.5: Crear la ruta del dashboard**

```javascript
// modules/auditoria/backend/routes/auditoria.dashboard.routes.js
const { Router } = require('express');
const AuditoriaDashboardController = require('../controllers/auditoria.dashboard.controller');
const { authenticateJWT, autorizar } = require('../../../portal/backend/middleware/auth.middleware');

const router = Router();

router.get(
  '/dashboard',
  authenticateJWT,
  autorizar(['portal.admin', 'auditoria.view']),
  AuditoriaDashboardController.obtenerDashboard
);

module.exports = router;
```

- [ ] **Paso 5.6: Montar la ruta en app.js**

En `modules/auditoria/backend/app.js`, agregar la nueva ruta junto a las existentes:

```javascript
// Después de: app.use('/api/auditoria', require('./routes/auditoria.routes'));
app.use('/api/auditoria', require('./routes/auditoria.dashboard.routes'));
```

- [ ] **Paso 5.7: Ejecutar test — debe pasar**

```bash
cd modules/auditoria/backend && npm test -- --testPathPattern=dashboard
```

Salida esperada: PASS — 2 tests pasando.

- [ ] **Paso 5.8: Ejecutar todos los tests de auditoría**

```bash
cd modules/auditoria/backend && npm test
```

Salida esperada: PASS — todos los tests previos siguen pasando.

- [ ] **Paso 5.9: Commit**

```bash
git add modules/auditoria/backend/
git commit -m "feat: agregar endpoint GET /api/auditoria/dashboard con KPIs y gráficas"
```

---

## Tarea 6: Página AuditoriaDashboard en el frontend

**Archivos:**
- Crear: `modules/auditoria/frontend/pages/AuditoriaDashboard.jsx`
- Modificar: `modules/portal/frontend/main.jsx`

- [ ] **Paso 6.1: Crear la página del dashboard**

```jsx
// modules/auditoria/frontend/pages/AuditoriaDashboard.jsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import TarjetaKPI from '../../../portal/frontend/components/TarjetaKPI';
import GraficaBarras from '../../../portal/frontend/components/GraficaBarras';
import GraficaDona from '../../../portal/frontend/components/GraficaDona';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function AuditoriaDashboard() {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`${API}/api/auditoria/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.exito) setDatos(json.datos);
        else setError(json.mensaje);
      })
      .catch(() => setError('Error al conectar con el servidor'))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) return <div className="contenido-principal"><p>Cargando dashboard...</p></div>;
  if (error) return <div className="contenido-principal"><p style={{ color: 'var(--color-error)' }}>{error}</p></div>;

  return (
    <div className="contenido-principal">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Auditoría — Dashboard</h1>
        <Link to="/auditoria/logs" style={{ fontSize: '0.9rem', color: 'var(--color-secundario)' }}>
          Ver todos los logs →
        </Link>
      </div>

      {/* Fila de KPIs */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <TarjetaKPI titulo="Eventos hoy" valor={datos.kpis.eventos_hoy} color="var(--color-secundario)" icono="📋" />
        <TarjetaKPI titulo="Eventos del mes" valor={datos.kpis.eventos_mes} color="var(--color-primario)" icono="📅" />
        <TarjetaKPI titulo="Usuarios activos" valor={datos.kpis.usuarios_activos} color="var(--color-exito)" icono="👥" />
        <TarjetaKPI titulo="Módulos monitoreados" valor={datos.kpis.modulos_monitoreados} color="var(--color-advertencia)" icono="🔍" />
      </div>

      {/* Fila de gráficas */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: '1.5', minWidth: '300px', background: '#fff', border: '1px solid var(--color-borde)', borderRadius: '8px', padding: '1rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-texto-claro)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
            Eventos por día (últimos 30 días)
          </h3>
          <GraficaBarras
            datos={datos.eventos_por_dia}
            series={[{ clave: 'valor', color: 'var(--color-secundario)', etiqueta: 'Eventos' }]}
          />
        </div>
        <div style={{ flex: '1', minWidth: '260px', background: '#fff', border: '1px solid var(--color-borde)', borderRadius: '8px', padding: '1rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-texto-claro)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
            Distribución por acción
          </h3>
          <GraficaDona datos={datos.distribucion_acciones} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Paso 6.2: Actualizar main.jsx — `/auditoria` muestra el dashboard, `/auditoria/logs` los registros**

En `modules/portal/frontend/main.jsx`, cambiar la ruta `/auditoria`:

```jsx
// Agregar import al inicio
import AuditoriaDashboard from "../../auditoria/frontend/pages/AuditoriaDashboard";

// Reemplazar la ruta existente:
// <Route path="/auditoria" element={<RutaProtegida><AuditoriaPage /></RutaProtegida>} />
// Por estas dos:
<Route
  path="/auditoria"
  element={
    <RutaProtegida>
      <AuditoriaDashboard />
    </RutaProtegida>
  }
/>
<Route
  path="/auditoria/logs"
  element={
    <RutaProtegida>
      <AuditoriaPage />
    </RutaProtegida>
  }
/>
```

- [ ] **Paso 6.3: Verificar que el frontend compila sin errores**

```bash
cd modules/portal/frontend && npm run build
```

Salida esperada: `built in Xs` sin errores.

- [ ] **Paso 6.4: Commit**

```bash
git add modules/auditoria/frontend/ modules/portal/frontend/main.jsx
git commit -m "feat: agregar AuditoriaDashboard con KPIs y gráficas de eventos"
```

---

## Tarea 7: Revisión del código de auditoría

**Archivos:** Revisión de `modules/auditoria/backend/` completo.

- [ ] **Paso 7.1: Revisar manejo de errores en auditoria.service.js**

Abrir `modules/auditoria/backend/services/auditoria.service.js`. Verificar que `registrarAccion` no lanza excepciones no controladas (los errores de auditoría nunca deben interrumpir el flujo principal). Si no tiene try/catch interno, agregar:

```javascript
async registrarAccion(req, modulo, tabla, registroId, accion, valoresPrevios, valoresNuevos) {
  try {
    const usuario_id = req.user?.usuario_id || req.user?.id || null;
    const ip = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || req.socket?.remoteAddress || null;
    const userAgent = req.headers['user-agent'] || null;

    return await Auditoria.crear({
      usuario_id,
      modulo,
      tabla,
      registro_id: String(registroId),
      accion,
      valores_previos: valoresPrevios || null,
      valores_nuevos: valoresNuevos || null,
      ip_origen: ip,
      user_agent: userAgent,
    });
  } catch (error) {
    // La auditoría nunca debe interrumpir el flujo principal
    console.error('[Auditoría] Error al registrar acción:', error.message);
    return null;
  }
},
```

- [ ] **Paso 7.2: Ejecutar todos los tests de auditoría**

```bash
cd modules/auditoria/backend && npm test
```

Salida esperada: PASS — todos los tests en verde.

- [ ] **Paso 7.3: Levantar el stack con Docker y probar el endpoint**

```bash
docker compose -f docker-compose.dev.yml up -d
# Esperar ~10 segundos para que los servicios levanten
sleep 10
# Obtener token (reemplaza con credenciales reales)
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/inicio-sesion \
  -H "Content-Type: application/json" \
  -d '{"correo":"admin@intranet.local","contraseña":"Admin123!"}' | jq -r '.datos.token')
# Probar el dashboard
curl -s http://localhost:4000/api/auditoria/dashboard \
  -H "Authorization: Bearer $TOKEN" | jq '.datos.kpis'
```

Salida esperada: objeto JSON con `eventos_hoy`, `eventos_mes`, `usuarios_activos`, `modulos_monitoreados`.

- [ ] **Paso 7.4: Commit final de la fase**

```bash
git add -A
git commit -m "fase 1: auditoria — revision codigo + dashboard KPIs + graficas"
```
