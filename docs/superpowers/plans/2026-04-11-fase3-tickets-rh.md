# Fase 3: Tickets y RH — Dashboards + Migración de Permisos + Responsive

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revisar y estabilizar los módulos Tickets y RH, migrar sus rutas al nuevo modelo de permisos granular, agregar dashboards con KPIs y gráficas, y verificar el diseño responsive.

**Architecture:** Ambos módulos son independientes entre sí — Tickets primero, luego RH. Cada módulo agrega: (1) endpoint `GET /api/<modulo>/dashboard` que agrega datos propios, y (2) página dashboard (`TicketsDashboard.jsx` / `RHDashboard.jsx`) que consume los componentes compartidos `TarjetaKPI`, `GraficaBarras` y `GraficaDona` del portal. Las rutas de cada módulo se actualizan de `autorizar([...])` a `verificarPermiso(modulo, opcion, tipo)`.

**Tech Stack:** Node.js + Express + PostgreSQL (pg), React 18 + Vite, Recharts, Jest + Supertest.

**Prerequisitos:** Fase 1 y Fase 2 completadas. Las tablas `modulo_opciones` y `rol_opcion_permisos` existen. Los componentes `TarjetaKPI`, `GraficaBarras`, `GraficaDona` existen en `modules/portal/frontend/components/`.

---

## Archivos

**Crear (Tickets):**
- `modules/tickets/backend/controllers/tickets.dashboard.controller.js`
- `modules/tickets/backend/routes/tickets.dashboard.routes.js`
- `modules/tickets/frontend/pages/TicketsDashboard.jsx`

**Modificar (Tickets):**
- `modules/tickets/backend/routes/tickets.routes.js` — usar `verificarPermiso`
- `modules/tickets/backend/routes/adjuntos.routes.js` — usar `verificarPermiso`
- `modules/tickets/backend/app.js` — montar ruta de dashboard
- `modules/portal/frontend/main.jsx` — rutas `/tickets` y `/tickets/dashboard`

**Crear (RH):**
- `modules/rh/backend/controllers/rh.dashboard.controller.js`
- `modules/rh/backend/routes/rh.dashboard.routes.js`
- `modules/rh/frontend/pages/RHDashboard.jsx`

**Modificar (RH):**
- `modules/rh/backend/routes/empleados.routes.js` — usar `verificarPermiso`
- `modules/rh/backend/routes/expediente.routes.js` — usar `verificarPermiso`
- `modules/rh/backend/routes/permisos.routes.js` — usar `verificarPermiso`
- `modules/rh/backend/routes/recibos.routes.js` — usar `verificarPermiso`
- `modules/rh/backend/app.js` — montar ruta de dashboard
- `modules/portal/frontend/main.jsx` — rutas `/rh` y demás

---

## ═══════════ TICKETS ═══════════

## Tarea 1: Actualizar rutas de Tickets al nuevo middleware

**Archivos:**
- Modificar: `modules/tickets/backend/routes/tickets.routes.js`
- Modificar: `modules/tickets/backend/routes/adjuntos.routes.js` (si existe)

- [ ] **Paso 1.1: Leer los archivos de rutas actuales**

```bash
cat modules/tickets/backend/routes/tickets.routes.js
```

Identificar: qué permisos usa actualmente (`autorizar([...])`).

- [ ] **Paso 1.2: Actualizar tickets.routes.js**

```javascript
// modules/tickets/backend/routes/tickets.routes.js
const { Router } = require('express');
const ControladorTicket = require('../controllers/ticket.controller');
const { authenticateJWT } = require('../../../portal/backend/middleware/auth.middleware');
const { verificarPermiso } = require('../../../portal/backend/middleware/permisos.middleware');
const { auditoriaMiddleware } = require('../../../auditoria/backend/middleware/auditoria.middleware');

const router = Router();
router.use(authenticateJWT);

// Tickets
router.get('/', verificarPermiso('tickets', 'Tickets', 'consulta'), ControladorTicket.listar);
router.get('/:id', verificarPermiso('tickets', 'Tickets', 'consulta'), ControladorTicket.obtener);
router.post('/', verificarPermiso('tickets', 'Tickets', 'edicion'), auditoriaMiddleware('tickets', 'tickets', 'INSERT'), ControladorTicket.crear);
router.put('/:id', verificarPermiso('tickets', 'Tickets', 'edicion'), auditoriaMiddleware('tickets', 'tickets', 'UPDATE'), ControladorTicket.actualizar);
router.delete('/:id', verificarPermiso('tickets', 'Tickets', 'edicion'), auditoriaMiddleware('tickets', 'tickets', 'DELETE'), ControladorTicket.eliminar);

// Asignar técnico
router.put('/:id/asignar', verificarPermiso('tickets', 'Tickets', 'edicion'), auditoriaMiddleware('tickets', 'tickets', 'UPDATE'), ControladorTicket.asignarTecnico);

module.exports = router;
```

- [ ] **Paso 1.3: Actualizar adjuntos y encuestas si existen**

```bash
ls modules/tickets/backend/routes/
```

Por cada archivo de ruta encontrado (adjuntos, encuestas, categorias), aplicar el mismo patrón:
- Reemplazar `autorizar(['tickets.admin'])` → `verificarPermiso('tickets', 'Adjuntos', 'edicion')`
- Reemplazar `autorizar(['tickets.view', 'tickets.admin'])` → `verificarPermiso('tickets', 'Adjuntos', 'consulta')`
- Reemplazar permisos de encuestas → `verificarPermiso('tickets', 'Encuestas', 'consulta/edicion')`
- Reemplazar permisos de categorías → `verificarPermiso('tickets', 'Categorías', 'consulta/edicion')`

- [ ] **Paso 1.4: Ejecutar tests de tickets**

```bash
cd modules/tickets/backend && npm test
```

Salida esperada: PASS — todos los tests existentes en verde.

- [ ] **Paso 1.5: Commit**

```bash
git add modules/tickets/backend/routes/
git commit -m "feat(tickets): migrar rutas al nuevo middleware verificarPermiso"
```

---

## Tarea 2: Endpoint backend del dashboard de Tickets

**Archivos:**
- Crear: `modules/tickets/backend/controllers/tickets.dashboard.controller.js`
- Crear: `modules/tickets/backend/routes/tickets.dashboard.routes.js`
- Modificar: `modules/tickets/backend/app.js`

- [ ] **Paso 2.1: Verificar que supertest está disponible**

```bash
cat modules/tickets/backend/package.json | grep supertest
```

Si no aparece: `cd modules/tickets/backend && npm install --save-dev supertest`

- [ ] **Paso 2.2: Escribir test del endpoint dashboard (falla primero)**

Crear `modules/tickets/backend/tests/tickets.dashboard.test.js`:

```javascript
const request = require('supertest');
const express = require('express');

jest.mock('../config/database', () => ({ grupo: { query: jest.fn() } }));
const { grupo } = require('../config/database');

describe('GET /api/tickets/dashboard', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { usuario_id: 1, rol_nombre: 'super_admin', rol_id: 1 };
      next();
    });
    app.use('/api/tickets', require('../routes/tickets.dashboard.routes'));
  });

  afterEach(() => jest.clearAllMocks());

  it('debería devolver KPIs del dashboard de tickets', async () => {
    grupo.query
      .mockResolvedValueOnce({ rows: [{ total: '50' }] })   // total tickets
      .mockResolvedValueOnce({ rows: [{ total: '15' }] })   // pendientes
      .mockResolvedValueOnce({ rows: [{ total: '8' }] })    // en proceso
      .mockResolvedValueOnce({ rows: [{ total: '3' }] })    // cerrados hoy
      .mockResolvedValueOnce({ rows: [] })                   // por mes
      .mockResolvedValueOnce({ rows: [] })                   // por estado
      .mockResolvedValueOnce({ rows: [] });                  // top tecnicos

    const resp = await request(app).get('/api/tickets/dashboard');

    expect(resp.status).toBe(200);
    expect(resp.body.exito).toBe(true);
    expect(resp.body.datos.kpis.total_tickets).toBe(50);
    expect(resp.body.datos.kpis.pendientes).toBe(15);
    expect(resp.body.datos.kpis.en_proceso).toBe(8);
    expect(resp.body.datos.kpis.cerrados_hoy).toBe(3);
    expect(Array.isArray(resp.body.datos.tickets_por_mes)).toBe(true);
    expect(Array.isArray(resp.body.datos.por_estado)).toBe(true);
    expect(Array.isArray(resp.body.datos.top_tecnicos)).toBe(true);
  });

  it('debería retornar 500 si la base de datos falla', async () => {
    grupo.query.mockRejectedValueOnce(new Error('DB error'));
    const resp = await request(app).get('/api/tickets/dashboard');
    expect(resp.status).toBe(500);
  });
});
```

- [ ] **Paso 2.3: Ejecutar test — debe fallar**

```bash
cd modules/tickets/backend && npm test -- --testPathPattern=dashboard
```

Salida esperada: FAIL — `Cannot find module '../routes/tickets.dashboard.routes'`

- [ ] **Paso 2.4: Crear el controlador del dashboard**

```javascript
// modules/tickets/backend/controllers/tickets.dashboard.controller.js
const { grupo } = require('../config/database');

const TicketsDashboardController = {
  async obtenerDashboard(req, res) {
    try {
      const [
        totalTickets,
        pendientes,
        enProceso,
        cerradosHoy,
        ticketsPorMes,
        porEstado,
        topTecnicos,
      ] = await Promise.all([
        grupo.query(`SELECT COUNT(*) AS total FROM tickets`),
        grupo.query(`SELECT COUNT(*) AS total FROM tickets WHERE estado = 'abierto'`),
        grupo.query(`SELECT COUNT(*) AS total FROM tickets WHERE estado = 'en_proceso'`),
        grupo.query(`SELECT COUNT(*) AS total FROM tickets WHERE DATE(fecha_cierre) = CURRENT_DATE`),
        grupo.query(`
          SELECT
            TO_CHAR(DATE_TRUNC('month', fecha_creacion), 'Mon YY') AS nombre,
            COUNT(*) FILTER (WHERE estado = 'abierto') AS abierto,
            COUNT(*) FILTER (WHERE estado = 'en_proceso') AS en_proceso,
            COUNT(*) FILTER (WHERE estado = 'cerrado') AS cerrado
          FROM tickets
          WHERE fecha_creacion >= CURRENT_DATE - INTERVAL '5 months'
          GROUP BY DATE_TRUNC('month', fecha_creacion)
          ORDER BY DATE_TRUNC('month', fecha_creacion)
        `),
        grupo.query(`
          SELECT estado AS nombre, COUNT(*) AS valor
          FROM tickets
          GROUP BY estado
          ORDER BY valor DESC
        `),
        grupo.query(`
          SELECT
            u.nombre || ' ' || COALESCE(u.apellido, '') AS nombre,
            COUNT(t.id) AS tickets_resueltos,
            ROUND(AVG(e.calificacion)::numeric, 1) AS calificacion_promedio
          FROM tickets t
          JOIN usuarios u ON u.id = t.tecnico_asignado_id
          LEFT JOIN ticket_encuestas e ON e.ticket_id = t.id
          WHERE t.tecnico_asignado_id IS NOT NULL
          GROUP BY u.id, u.nombre, u.apellido
          ORDER BY calificacion_promedio DESC NULLS LAST, tickets_resueltos DESC
          LIMIT 5
        `),
      ]);

      res.json({
        exito: true,
        datos: {
          kpis: {
            total_tickets: parseInt(totalTickets.rows[0].total),
            pendientes: parseInt(pendientes.rows[0].total),
            en_proceso: parseInt(enProceso.rows[0].total),
            cerrados_hoy: parseInt(cerradosHoy.rows[0].total),
          },
          tickets_por_mes: ticketsPorMes.rows.map(r => ({
            nombre: r.nombre,
            abierto: parseInt(r.abierto),
            en_proceso: parseInt(r.en_proceso),
            cerrado: parseInt(r.cerrado),
          })),
          por_estado: porEstado.rows.map(r => ({ nombre: r.nombre, valor: parseInt(r.valor) })),
          top_tecnicos: topTecnicos.rows.map(r => ({
            nombre: r.nombre.trim(),
            tickets_resueltos: parseInt(r.tickets_resueltos),
            calificacion_promedio: parseFloat(r.calificacion_promedio) || 0,
          })),
        },
      });
    } catch (error) {
      console.error('Error al obtener dashboard de tickets:', error);
      res.status(500).json({ exito: false, mensaje: 'Error al obtener el dashboard', error: error.message });
    }
  },
};

module.exports = TicketsDashboardController;
```

- [ ] **Paso 2.5: Crear la ruta del dashboard**

```javascript
// modules/tickets/backend/routes/tickets.dashboard.routes.js
const { Router } = require('express');
const TicketsDashboardController = require('../controllers/tickets.dashboard.controller');
const { authenticateJWT } = require('../../../portal/backend/middleware/auth.middleware');
const { verificarPermiso } = require('../../../portal/backend/middleware/permisos.middleware');

const router = Router();

router.get(
  '/dashboard',
  authenticateJWT,
  verificarPermiso('tickets', 'Tickets', 'consulta'),
  TicketsDashboardController.obtenerDashboard
);

module.exports = router;
```

- [ ] **Paso 2.6: Montar la ruta en app.js de tickets**

En `modules/tickets/backend/app.js`, agregar:

```javascript
// Después de: app.use('/api/tickets', require('./routes/tickets.routes'));
app.use('/api/tickets', require('./routes/tickets.dashboard.routes'));
```

- [ ] **Paso 2.7: Ejecutar test — debe pasar**

```bash
cd modules/tickets/backend && npm test -- --testPathPattern=dashboard
```

Salida esperada: PASS — 2 tests en verde.

- [ ] **Paso 2.8: Ejecutar todos los tests de tickets**

```bash
cd modules/tickets/backend && npm test
```

Salida esperada: PASS — todos en verde.

- [ ] **Paso 2.9: Commit**

```bash
git add modules/tickets/backend/
git commit -m "feat(tickets): agregar endpoint GET /api/tickets/dashboard con KPIs y graficas"
```

---

## Tarea 3: Página TicketsDashboard en el frontend

**Archivos:**
- Crear: `modules/tickets/frontend/pages/TicketsDashboard.jsx`
- Modificar: `modules/portal/frontend/main.jsx`

- [ ] **Paso 3.1: Crear la página del dashboard**

```jsx
// modules/tickets/frontend/pages/TicketsDashboard.jsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import TarjetaKPI from '../../../portal/frontend/components/TarjetaKPI';
import GraficaBarras from '../../../portal/frontend/components/GraficaBarras';
import GraficaDona from '../../../portal/frontend/components/GraficaDona';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4001';

export default function TicketsDashboard() {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`${API}/api/tickets/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(json => { if (json.exito) setDatos(json.datos); else setError(json.mensaje); })
      .catch(() => setError('Error al conectar con el servidor'))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) return <div className="contenido-principal"><p>Cargando dashboard...</p></div>;
  if (error) return <div className="contenido-principal"><p style={{ color: 'var(--color-error)' }}>{error}</p></div>;

  return (
    <div className="contenido-principal">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Tickets — Dashboard</h1>
        <Link to="/tickets/lista" style={{ fontSize: '0.9rem', color: 'var(--color-secundario)' }}>
          Ver todos los tickets →
        </Link>
      </div>

      {/* Fila de KPIs */}
      <div className="grid-kpis" style={{ marginBottom: '1.5rem' }}>
        <TarjetaKPI titulo="Total tickets" valor={datos.kpis.total_tickets} color="var(--color-primario)" icono="🎫" />
        <TarjetaKPI titulo="Pendientes" valor={datos.kpis.pendientes} color="#e74c3c" icono="⏳" />
        <TarjetaKPI titulo="En proceso" valor={datos.kpis.en_proceso} color="var(--color-advertencia)" icono="🔧" />
        <TarjetaKPI titulo="Cerrados hoy" valor={datos.kpis.cerrados_hoy} color="var(--color-exito)" icono="✅" />
      </div>

      {/* Gráficas */}
      <div className="grid-graficas">
        <div className="grafica-principal" style={{ background: '#fff', border: '1px solid var(--color-borde)', borderRadius: '8px', padding: '1rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-texto-claro)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
            Tickets por mes (últimos 6 meses)
          </h3>
          <GraficaBarras
            datos={datos.tickets_por_mes}
            series={[
              { clave: 'abierto', color: '#e74c3c', etiqueta: 'Abierto' },
              { clave: 'en_proceso', color: 'var(--color-advertencia)', etiqueta: 'En proceso' },
              { clave: 'cerrado', color: 'var(--color-exito)', etiqueta: 'Cerrado' },
            ]}
          />
        </div>
        <div className="grafica-secundaria" style={{ background: '#fff', border: '1px solid var(--color-borde)', borderRadius: '8px', padding: '1rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-texto-claro)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
            Distribución por estado
          </h3>
          <GraficaDona datos={datos.por_estado} />
        </div>
      </div>

      {/* Top técnicos */}
      {datos.top_tecnicos.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid var(--color-borde)', borderRadius: '8px', padding: '1rem', marginTop: '1.5rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-texto-claro)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
            Top técnicos por calificación
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {datos.top_tecnicos.map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', borderBottom: '1px solid var(--color-borde)' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'var(--color-primario)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 }}>
                  {i + 1}
                </div>
                <span style={{ flex: 1, fontWeight: 500, fontSize: '0.9rem' }}>{t.nombre}</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--color-texto-claro)' }}>{t.tickets_resueltos} tickets</span>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-advertencia)' }}>
                  {t.calificacion_promedio > 0 ? `★ ${t.calificacion_promedio.toFixed(1)}` : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Paso 3.2: Actualizar main.jsx — `/tickets` muestra el dashboard, `/tickets/lista` los registros**

En `modules/portal/frontend/main.jsx`:

```jsx
// Agregar import
import TicketsDashboard from "../../tickets/frontend/pages/TicketsDashboard";

// Reemplazar:
// <Route path="/tickets" element={<RutaProtegida><TicketPage /></RutaProtegida>} />
// Por:
<Route
  path="/tickets"
  element={<RutaProtegida><TicketsDashboard /></RutaProtegida>}
/>
<Route
  path="/tickets/lista"
  element={<RutaProtegida><TicketPage /></RutaProtegida>}
/>
```

- [ ] **Paso 3.3: Verificar que compila**

```bash
cd modules/portal/frontend && npm run build
```

Salida esperada: `built in Xs` sin errores.

- [ ] **Paso 3.4: Commit**

```bash
git add modules/tickets/frontend/ modules/portal/frontend/main.jsx
git commit -m "feat(tickets): agregar TicketsDashboard con KPIs, graficas y top tecnicos"
```

---

## ═══════════ RH ═══════════

## Tarea 4: Actualizar rutas de RH al nuevo middleware

**Archivos:**
- Modificar: `modules/rh/backend/routes/empleados.routes.js`
- Modificar: `modules/rh/backend/routes/expediente.routes.js`
- Modificar: `modules/rh/backend/routes/permisos.routes.js`
- Modificar: `modules/rh/backend/routes/recibos.routes.js`

- [ ] **Paso 4.1: Leer los archivos de rutas de RH**

```bash
ls modules/rh/backend/routes/ && cat modules/rh/backend/routes/empleados.routes.js
```

Identificar: qué permisos usa actualmente (`autorizar([...])`).

- [ ] **Paso 4.2: Actualizar empleados.routes.js**

```javascript
// modules/rh/backend/routes/empleados.routes.js
const { Router } = require('express');
const ControladorEmpleado = require('../controllers/empleado.controller');
const { authenticateJWT } = require('../../../portal/backend/middleware/auth.middleware');
const { verificarPermiso } = require('../../../portal/backend/middleware/permisos.middleware');
const { auditoriaMiddleware } = require('../../../auditoria/backend/middleware/auditoria.middleware');

const router = Router();
router.use(authenticateJWT);

router.get('/', verificarPermiso('rh', 'Empleados', 'consulta'), ControladorEmpleado.listar);
router.get('/:id', verificarPermiso('rh', 'Empleados', 'consulta'), ControladorEmpleado.obtener);
router.post('/', verificarPermiso('rh', 'Empleados', 'edicion'), auditoriaMiddleware('rh', 'empleados', 'INSERT'), ControladorEmpleado.crear);
router.put('/:id', verificarPermiso('rh', 'Empleados', 'edicion'), auditoriaMiddleware('rh', 'empleados', 'UPDATE'), ControladorEmpleado.actualizar);
router.delete('/:id', verificarPermiso('rh', 'Empleados', 'edicion'), auditoriaMiddleware('rh', 'empleados', 'DELETE'), ControladorEmpleado.eliminar);

module.exports = router;
```

- [ ] **Paso 4.3: Actualizar expediente.routes.js**

```javascript
// modules/rh/backend/routes/expediente.routes.js
const { Router } = require('express');
const ControladorExpediente = require('../controllers/expediente.controller');
const { authenticateJWT } = require('../../../portal/backend/middleware/auth.middleware');
const { verificarPermiso } = require('../../../portal/backend/middleware/permisos.middleware');
const { auditoriaMiddleware } = require('../../../auditoria/backend/middleware/auditoria.middleware');
const upload = require('../middleware/upload.middleware');

const router = Router();
router.use(authenticateJWT);

router.get('/empleado/:empleado_id', verificarPermiso('rh', 'Expedientes', 'consulta'), ControladorExpediente.listarPorEmpleado);
router.post('/', verificarPermiso('rh', 'Expedientes', 'edicion'), upload.single('archivo'), auditoriaMiddleware('rh', 'expediente_documentos', 'INSERT'), ControladorExpediente.subir);
router.delete('/:id', verificarPermiso('rh', 'Expedientes', 'edicion'), auditoriaMiddleware('rh', 'expediente_documentos', 'DELETE'), ControladorExpediente.eliminar);

module.exports = router;
```

- [ ] **Paso 4.4: Actualizar permisos.routes.js (ausencias)**

```javascript
// modules/rh/backend/routes/permisos.routes.js
const { Router } = require('express');
const ControladorPermisos = require('../controllers/permisos.controller');
const { authenticateJWT } = require('../../../portal/backend/middleware/auth.middleware');
const { verificarPermiso } = require('../../../portal/backend/middleware/permisos.middleware');
const { auditoriaMiddleware } = require('../../../auditoria/backend/middleware/auditoria.middleware');

const router = Router();
router.use(authenticateJWT);

router.get('/', verificarPermiso('rh', 'Permisos', 'consulta'), ControladorPermisos.listar);
router.get('/:id', verificarPermiso('rh', 'Permisos', 'consulta'), ControladorPermisos.obtener);
router.post('/', verificarPermiso('rh', 'Permisos', 'edicion'), auditoriaMiddleware('rh', 'permisos_ausencias', 'INSERT'), ControladorPermisos.crear);
router.put('/:id/aprobar', verificarPermiso('rh', 'Permisos', 'edicion'), auditoriaMiddleware('rh', 'permisos_ausencias', 'UPDATE'), ControladorPermisos.aprobar);
router.put('/:id/rechazar', verificarPermiso('rh', 'Permisos', 'edicion'), auditoriaMiddleware('rh', 'permisos_ausencias', 'UPDATE'), ControladorPermisos.rechazar);

module.exports = router;
```

- [ ] **Paso 4.5: Actualizar recibos.routes.js**

```javascript
// modules/rh/backend/routes/recibos.routes.js
const { Router } = require('express');
const ControladorRecibos = require('../controllers/reciboNomina.controller');
const { authenticateJWT } = require('../../../portal/backend/middleware/auth.middleware');
const { verificarPermiso } = require('../../../portal/backend/middleware/permisos.middleware');
const { auditoriaMiddleware } = require('../../../auditoria/backend/middleware/auditoria.middleware');
const upload = require('../middleware/upload.middleware');

const router = Router();
router.use(authenticateJWT);

router.get('/empleado/:empleado_id', verificarPermiso('rh', 'Recibos', 'consulta'), ControladorRecibos.listarPorEmpleado);
router.post('/', verificarPermiso('rh', 'Recibos', 'edicion'), upload.single('archivo'), auditoriaMiddleware('rh', 'recibos_nomina', 'INSERT'), ControladorRecibos.crear);
router.delete('/:id', verificarPermiso('rh', 'Recibos', 'edicion'), auditoriaMiddleware('rh', 'recibos_nomina', 'DELETE'), ControladorRecibos.eliminar);

module.exports = router;
```

- [ ] **Paso 4.6: Ejecutar tests de RH**

```bash
cd modules/rh/backend && npm test
```

Salida esperada: PASS — todos los tests existentes en verde.

- [ ] **Paso 4.7: Commit**

```bash
git add modules/rh/backend/routes/
git commit -m "feat(rh): migrar rutas al nuevo middleware verificarPermiso"
```

---

## Tarea 5: Endpoint backend del dashboard de RH

**Archivos:**
- Crear: `modules/rh/backend/controllers/rh.dashboard.controller.js`
- Crear: `modules/rh/backend/routes/rh.dashboard.routes.js`
- Modificar: `modules/rh/backend/app.js`

- [ ] **Paso 5.1: Verificar que supertest está disponible**

```bash
cat modules/rh/backend/package.json | grep supertest
```

Si no aparece: `cd modules/rh/backend && npm install --save-dev supertest`

- [ ] **Paso 5.2: Escribir test del endpoint dashboard (falla primero)**

Crear `modules/rh/backend/tests/rh.dashboard.test.js`:

```javascript
const request = require('supertest');
const express = require('express');

jest.mock('../config/database', () => ({ grupo: { query: jest.fn() } }));
const { grupo } = require('../config/database');

describe('GET /api/empleados/dashboard', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { usuario_id: 1, rol_nombre: 'super_admin', rol_id: 1 };
      next();
    });
    app.use('/api/empleados', require('../routes/rh.dashboard.routes'));
  });

  afterEach(() => jest.clearAllMocks());

  it('debería devolver KPIs del dashboard de RH', async () => {
    grupo.query
      .mockResolvedValueOnce({ rows: [{ total: '142' }] })  // total
      .mockResolvedValueOnce({ rows: [{ total: '138' }] })  // activos
      .mockResolvedValueOnce({ rows: [{ total: '2' }] })    // bajas mes
      .mockResolvedValueOnce({ rows: [{ total: '5' }] })    // permisos pendientes
      .mockResolvedValueOnce({ rows: [] })                   // por mes
      .mockResolvedValueOnce({ rows: [] })                   // por departamento
      .mockResolvedValueOnce({ rows: [] });                  // permisos pendientes lista

    const resp = await request(app).get('/api/empleados/dashboard');

    expect(resp.status).toBe(200);
    expect(resp.body.exito).toBe(true);
    expect(resp.body.datos.kpis.total_empleados).toBe(142);
    expect(resp.body.datos.kpis.activos).toBe(138);
    expect(resp.body.datos.kpis.bajas_mes).toBe(2);
    expect(resp.body.datos.kpis.permisos_pendientes).toBe(5);
  });

  it('debería retornar 500 si la base de datos falla', async () => {
    grupo.query.mockRejectedValueOnce(new Error('DB error'));
    const resp = await request(app).get('/api/empleados/dashboard');
    expect(resp.status).toBe(500);
  });
});
```

- [ ] **Paso 5.3: Ejecutar test — debe fallar**

```bash
cd modules/rh/backend && npm test -- --testPathPattern=dashboard
```

Salida esperada: FAIL — `Cannot find module '../routes/rh.dashboard.routes'`

- [ ] **Paso 5.4: Crear el controlador del dashboard**

```javascript
// modules/rh/backend/controllers/rh.dashboard.controller.js
const { grupo } = require('../config/database');

const RHDashboardController = {
  async obtenerDashboard(req, res) {
    try {
      const [
        totalEmpleados,
        activos,
        bajasMes,
        permisosPendientes,
        movimientosPorMes,
        porDepartamento,
        permisosPendientesList,
      ] = await Promise.all([
        grupo.query(`SELECT COUNT(*) AS total FROM empleados`),
        grupo.query(`SELECT COUNT(*) AS total FROM empleados WHERE estatus = 'activo'`),
        grupo.query(`SELECT COUNT(*) AS total FROM empleados WHERE DATE_TRUNC('month', fecha_baja) = DATE_TRUNC('month', CURRENT_DATE)`),
        grupo.query(`SELECT COUNT(*) AS total FROM permisos_ausencias WHERE estatus = 'pendiente'`),
        grupo.query(`
          SELECT
            TO_CHAR(DATE_TRUNC('month', fecha_creacion), 'Mon YY') AS nombre,
            COUNT(*) AS ingresos,
            COUNT(CASE WHEN estatus = 'inactivo' AND DATE_TRUNC('month', fecha_baja) = DATE_TRUNC('month', fecha_creacion) THEN 1 END) AS bajas
          FROM empleados
          WHERE fecha_creacion >= CURRENT_DATE - INTERVAL '5 months'
          GROUP BY DATE_TRUNC('month', fecha_creacion)
          ORDER BY DATE_TRUNC('month', fecha_creacion)
        `),
        grupo.query(`
          SELECT COALESCE(departamento, 'Sin departamento') AS nombre, COUNT(*) AS valor
          FROM empleados
          WHERE estatus = 'activo'
          GROUP BY departamento
          ORDER BY valor DESC
          LIMIT 8
        `),
        grupo.query(`
          SELECT
            e.nombre || ' ' || e.apellido AS empleado,
            pa.tipo,
            pa.fecha_inicio,
            pa.fecha_fin,
            pa.motivo
          FROM permisos_ausencias pa
          JOIN empleados e ON e.id = pa.empleado_id
          WHERE pa.estatus = 'pendiente'
          ORDER BY pa.fecha_creacion
          LIMIT 10
        `),
      ]);

      res.json({
        exito: true,
        datos: {
          kpis: {
            total_empleados: parseInt(totalEmpleados.rows[0].total),
            activos: parseInt(activos.rows[0].total),
            bajas_mes: parseInt(bajasMes.rows[0].total),
            permisos_pendientes: parseInt(permisosPendientes.rows[0].total),
          },
          movimientos_por_mes: movimientosPorMes.rows.map(r => ({
            nombre: r.nombre,
            ingresos: parseInt(r.ingresos),
            bajas: parseInt(r.bajas),
          })),
          por_departamento: porDepartamento.rows.map(r => ({ nombre: r.nombre, valor: parseInt(r.valor) })),
          permisos_pendientes_lista: permisosPendientesList.rows,
        },
      });
    } catch (error) {
      console.error('Error al obtener dashboard de RH:', error);
      res.status(500).json({ exito: false, mensaje: 'Error al obtener el dashboard', error: error.message });
    }
  },
};

module.exports = RHDashboardController;
```

- [ ] **Paso 5.5: Crear la ruta del dashboard**

```javascript
// modules/rh/backend/routes/rh.dashboard.routes.js
const { Router } = require('express');
const RHDashboardController = require('../controllers/rh.dashboard.controller');
const { authenticateJWT } = require('../../../portal/backend/middleware/auth.middleware');
const { verificarPermiso } = require('../../../portal/backend/middleware/permisos.middleware');

const router = Router();

router.get(
  '/dashboard',
  authenticateJWT,
  verificarPermiso('rh', 'Empleados', 'consulta'),
  RHDashboardController.obtenerDashboard
);

module.exports = router;
```

- [ ] **Paso 5.6: Montar la ruta en app.js de RH**

En `modules/rh/backend/app.js`, agregar:

```javascript
// Después de: app.use('/api/empleados', require('./routes/empleados.routes'));
app.use('/api/empleados', require('./routes/rh.dashboard.routes'));
```

- [ ] **Paso 5.7: Ejecutar test — debe pasar**

```bash
cd modules/rh/backend && npm test -- --testPathPattern=dashboard
```

Salida esperada: PASS — 2 tests en verde.

- [ ] **Paso 5.8: Ejecutar todos los tests de RH**

```bash
cd modules/rh/backend && npm test
```

Salida esperada: PASS — todos en verde.

- [ ] **Paso 5.9: Commit**

```bash
git add modules/rh/backend/
git commit -m "feat(rh): agregar endpoint GET /api/empleados/dashboard con KPIs y graficas"
```

---

## Tarea 6: Página RHDashboard en el frontend

**Archivos:**
- Crear: `modules/rh/frontend/pages/RHDashboard.jsx`
- Modificar: `modules/portal/frontend/main.jsx`

- [ ] **Paso 6.1: Crear la página del dashboard**

```jsx
// modules/rh/frontend/pages/RHDashboard.jsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import TarjetaKPI from '../../../portal/frontend/components/TarjetaKPI';
import GraficaBarras from '../../../portal/frontend/components/GraficaBarras';
import GraficaDona from '../../../portal/frontend/components/GraficaDona';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4002';

export default function RHDashboard() {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`${API}/api/empleados/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(json => { if (json.exito) setDatos(json.datos); else setError(json.mensaje); })
      .catch(() => setError('Error al conectar con el servidor'))
      .finally(() => setCargando(false));
  }, []);

  if (cargando) return <div className="contenido-principal"><p>Cargando dashboard...</p></div>;
  if (error) return <div className="contenido-principal"><p style={{ color: 'var(--color-error)' }}>{error}</p></div>;

  return (
    <div className="contenido-principal">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Recursos Humanos — Dashboard</h1>
        <Link to="/rh/admin" style={{ fontSize: '0.9rem', color: 'var(--color-secundario)' }}>
          Ver empleados →
        </Link>
      </div>

      {/* Fila de KPIs */}
      <div className="grid-kpis" style={{ marginBottom: '1.5rem' }}>
        <TarjetaKPI titulo="Total empleados" valor={datos.kpis.total_empleados} color="var(--color-primario)" icono="👥" />
        <TarjetaKPI titulo="Activos" valor={datos.kpis.activos} color="var(--color-exito)" icono="✅" />
        <TarjetaKPI titulo="Bajas del mes" valor={datos.kpis.bajas_mes} color="#e74c3c" icono="📉" />
        <TarjetaKPI titulo="Permisos pendientes" valor={datos.kpis.permisos_pendientes} color="var(--color-advertencia)" icono="📋" />
      </div>

      {/* Gráficas */}
      <div className="grid-graficas">
        <div className="grafica-principal" style={{ background: '#fff', border: '1px solid var(--color-borde)', borderRadius: '8px', padding: '1rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-texto-claro)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
            Movimientos por mes (últimos 6 meses)
          </h3>
          <GraficaBarras
            datos={datos.movimientos_por_mes}
            series={[
              { clave: 'ingresos', color: 'var(--color-exito)', etiqueta: 'Ingresos' },
              { clave: 'bajas', color: '#e74c3c', etiqueta: 'Bajas' },
            ]}
          />
        </div>
        <div className="grafica-secundaria" style={{ background: '#fff', border: '1px solid var(--color-borde)', borderRadius: '8px', padding: '1rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-texto-claro)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
            Empleados por departamento
          </h3>
          <GraficaDona datos={datos.por_departamento} />
        </div>
      </div>

      {/* Permisos pendientes */}
      {datos.permisos_pendientes_lista.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid var(--color-borde)', borderRadius: '8px', padding: '1rem', marginTop: '1.5rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-texto-claro)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
            Permisos/ausencias pendientes de aprobación
          </h3>
          <div className="tabla-responsive">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--color-borde)' }}>
                  <th style={{ textAlign: 'left', padding: '0.5rem', fontWeight: 600, color: 'var(--color-texto-claro)' }}>Empleado</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', fontWeight: 600, color: 'var(--color-texto-claro)' }}>Tipo</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', fontWeight: 600, color: 'var(--color-texto-claro)' }}>Desde</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem', fontWeight: 600, color: 'var(--color-texto-claro)' }}>Hasta</th>
                </tr>
              </thead>
              <tbody>
                {datos.permisos_pendientes_lista.map((p, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--color-borde)' }}>
                    <td style={{ padding: '0.5rem', fontWeight: 500 }}>{p.empleado}</td>
                    <td style={{ padding: '0.5rem' }}>{p.tipo}</td>
                    <td style={{ padding: '0.5rem', color: 'var(--color-texto-claro)' }}>{new Date(p.fecha_inicio).toLocaleDateString('es-MX')}</td>
                    <td style={{ padding: '0.5rem', color: 'var(--color-texto-claro)' }}>{new Date(p.fecha_fin).toLocaleDateString('es-MX')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ textAlign: 'right', marginTop: '0.75rem' }}>
            <Link to="/rh/permisos" style={{ fontSize: '0.85rem', color: 'var(--color-secundario)' }}>Ver todos →</Link>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Paso 6.2: Actualizar main.jsx — `/rh` muestra el dashboard, el resto permanece igual**

En `modules/portal/frontend/main.jsx`:

```jsx
// Agregar import
import RHDashboard from "../../rh/frontend/pages/RHDashboard";

// Reemplazar:
// <Route path="/rh" element={<RutaProtegida><EmpleadoPage /></RutaProtegida>} />
// Por:
<Route
  path="/rh"
  element={<RutaProtegida><RHDashboard /></RutaProtegida>}
/>
// EmpleadoPage pasa a /rh/empleados (si no estaba ya ahí)
```

- [ ] **Paso 6.3: Verificar que compila**

```bash
cd modules/portal/frontend && npm run build
```

Salida esperada: `built in Xs` sin errores.

- [ ] **Paso 6.4: Commit**

```bash
git add modules/rh/frontend/ modules/portal/frontend/main.jsx
git commit -m "feat(rh): agregar RHDashboard con KPIs, graficas y permisos pendientes"
```

---

## Tarea 7: Verificación final con Docker

- [ ] **Paso 7.1: Levantar el stack completo**

```bash
docker compose -f docker-compose.dev.yml up -d
```

- [ ] **Paso 7.2: Verificar que los 3 backends responden**

```bash
curl -s http://localhost:4000/api/salud | jq '.exito'   # Portal
curl -s http://localhost:4001/api/salud | jq '.exito'   # Tickets
curl -s http://localhost:4002/api/salud | jq '.exito'   # RH
```

Salida esperada: `true` en los 3.

- [ ] **Paso 7.3: Verificar los dashboards con token**

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/inicio-sesion \
  -H "Content-Type: application/json" \
  -d '{"correo":"admin@intranet.local","contraseña":"Admin123!"}' | jq -r '.datos.token')

curl -s http://localhost:4001/api/tickets/dashboard \
  -H "Authorization: Bearer $TOKEN" | jq '.datos.kpis'

curl -s http://localhost:4002/api/empleados/dashboard \
  -H "Authorization: Bearer $TOKEN" | jq '.datos.kpis'
```

Salida esperada: objetos con KPIs válidos.

- [ ] **Paso 7.4: Ejecutar todos los tests de los 3 módulos**

```bash
cd modules/portal/backend && npm test
cd modules/tickets/backend && npm test
cd modules/rh/backend && npm test
```

Salida esperada: PASS en los 3.

- [ ] **Paso 7.5: Commit final de la fase**

```bash
git add -A
git commit -m "fase 3: tickets + rh — dashboards + verificarPermiso + responsive"
```
