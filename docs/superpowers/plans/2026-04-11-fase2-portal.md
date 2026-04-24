# Fase 2: Portal — Nuevo Modelo Permisos + UI Responsive + Carruseles

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrar el modelo de permisos a uno granular por módulo/opción/tipo, y rediseñar el portal con login split-screen, home con carrusel de noticias destacadas, navbar con logo y diseño responsive mobile-first.

**Architecture:** El nuevo modelo de permisos agrega `modulo_opciones` (opciones por módulo) y `rol_opcion_permisos` (rol + opción + tipo consulta/edición), y mueve `rol_id` directo a `usuarios`. La función `verificarPermiso(modulo, opcion, tipo)` reemplaza a `autorizar()` en todas las rutas. El frontend se rediseña con CSS variables responsive en `globales.css`, un componente `CarruselNoticias` reutilizable, y las páginas `PortalLogin`, `PortalHome` y `MenuDinamico` actualizadas.

**Tech Stack:** Node.js + Express + PostgreSQL (pg), React 18 + Vite, Recharts, Jest + Supertest.

**Prerequisito:** Fase 1 completada (Recharts instalado, componentes TarjetaKPI/GraficaBarras/GraficaDona creados).

---

## Archivos

**Crear:**
- `modules/portal/backend/migrations/002-modelo-permisos-granular.sql`
- `modules/portal/backend/middleware/permisos.middleware.js`
- `modules/portal/frontend/components/CarruselNoticias.jsx`
- `modules/portal/frontend/pages/PermisosAdminPage.jsx`

**Modificar:**
- `modules/portal/backend/middleware/auth.middleware.js` — cargar `rol_id` desde `usuarios`
- `modules/portal/backend/routes/noticia.routes.js` — usar `verificarPermiso`
- `modules/portal/backend/routes/rol.routes.js` — usar `verificarPermiso`
- `modules/portal/backend/routes/usuario.routes.js` — usar `verificarPermiso`
- `modules/portal/backend/routes/modulo.routes.js` — usar `verificarPermiso`
- `modules/portal/backend/routes/permiso.routes.js` — usar `verificarPermiso`
- `modules/portal/backend/routes/auth.routes.js` — agregar `GET /publicas` sin auth
- `modules/portal/frontend/styles/globales.css` — variables responsive + breakpoints
- `modules/portal/frontend/pages/PortalLogin.jsx` — split screen + logo + carrusel
- `modules/portal/frontend/pages/PortalHome.jsx` — destacada + lista lateral
- `modules/portal/frontend/components/MenuDinamico.jsx` — logo izquierda + hamburguesa
- `modules/portal/frontend/main.jsx` — ruta `/admin/permisos`

---

## Tarea 1: Migración del modelo de permisos en base de datos

**Archivos:**
- Crear: `modules/portal/backend/migrations/002-modelo-permisos-granular.sql`

- [ ] **Paso 1.1: Crear el archivo de migración**

```sql
-- modules/portal/backend/migrations/002-modelo-permisos-granular.sql

-- 1. Tabla de opciones por módulo
CREATE TABLE IF NOT EXISTS modulo_opciones (
  id SERIAL PRIMARY KEY,
  modulo_id INT NOT NULL REFERENCES modulos(id) ON DELETE CASCADE,
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  orden INT DEFAULT 0,
  UNIQUE(modulo_id, nombre)
);

-- 2. Tabla de permisos por rol y opción
CREATE TABLE IF NOT EXISTS rol_opcion_permisos (
  rol_id INT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  opcion_id INT NOT NULL REFERENCES modulo_opciones(id) ON DELETE CASCADE,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('consulta', 'edicion')),
  PRIMARY KEY (rol_id, opcion_id, tipo)
);

-- 3. Agregar rol_id directo a usuarios (un rol por usuario)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol_id INT REFERENCES roles(id);

-- 4. Migrar: copiar el primer rol de usuario_rol a usuarios.rol_id
UPDATE usuarios u
SET rol_id = (
  SELECT ur.rol_id FROM usuario_rol ur
  WHERE ur.usuario_id = u.id
  ORDER BY ur.rol_id
  LIMIT 1
)
WHERE u.rol_id IS NULL;

-- 5. Seed: insertar opciones iniciales por módulo
INSERT INTO modulo_opciones (modulo_id, nombre, descripcion, orden)
SELECT m.id, opc.nombre, opc.descripcion, opc.orden
FROM modulos m
JOIN (VALUES
  ('portal', 'Noticias',   'Gestión de noticias del portal',          1),
  ('portal', 'Usuarios',   'Gestión de usuarios del sistema',         2),
  ('portal', 'Roles',      'Administración de roles y permisos',      3),
  ('portal', 'Módulos',    'Activación y configuración de módulos',   4),
  ('tickets','Tickets',    'Gestión de tickets de soporte',           1),
  ('tickets','Categorías', 'Categorías de tickets',                   2),
  ('tickets','Adjuntos',   'Archivos adjuntos de tickets',            3),
  ('tickets','Encuestas',  'Encuestas de satisfacción',               4),
  ('rh',     'Empleados',  'Alta, baja y modificación de empleados',  1),
  ('rh',     'Expedientes','Documentos de expediente laboral',        2),
  ('rh',     'Permisos',   'Solicitudes de permisos y ausencias',     3),
  ('rh',     'Recibos',    'Recibos de nómina',                       4),
  ('auditoria','Logs',     'Registros de auditoría del sistema',      1)
) AS opc(modulo_nombre, nombre, descripcion, orden)
ON m.nombre = opc.modulo_nombre
ON CONFLICT (modulo_id, nombre) DO NOTHING;

-- 6. Dar al rol super_admin todos los permisos (consulta + edición)
INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT r.id, mo.id, t.tipo
FROM roles r
CROSS JOIN modulo_opciones mo
CROSS JOIN (VALUES ('consulta'), ('edicion')) AS t(tipo)
WHERE r.nombre = 'super_admin'
ON CONFLICT DO NOTHING;
```

- [ ] **Paso 1.2: Ejecutar la migración en la base de datos de desarrollo**

```bash
docker exec -i intranet_postgres_dev psql -U postgres -d intranet_dev \
  < modules/portal/backend/migrations/002-modelo-permisos-granular.sql
```

Salida esperada: `CREATE TABLE`, `ALTER TABLE`, `UPDATE N`, `INSERT N` sin errores.

- [ ] **Paso 1.3: Verificar que las tablas se crearon correctamente**

```bash
docker exec intranet_postgres_dev psql -U postgres -d intranet_dev -c \
  "SELECT m.nombre AS modulo, mo.nombre AS opcion, mo.orden FROM modulo_opciones mo JOIN modulos m ON m.id = mo.modulo_id ORDER BY m.nombre, mo.orden;"
```

Salida esperada: lista con 13 filas (4 portal + 4 tickets + 4 rh + 1 auditoria).

- [ ] **Paso 1.4: Commit**

```bash
git add modules/portal/backend/migrations/002-modelo-permisos-granular.sql
git commit -m "feat(db): agregar tablas modulo_opciones y rol_opcion_permisos + migrar rol_id a usuarios"
```

---

## Tarea 2: Nuevo middleware de permisos

**Archivos:**
- Crear: `modules/portal/backend/middleware/permisos.middleware.js`
- Modificar: `modules/portal/backend/middleware/auth.middleware.js`

- [ ] **Paso 2.1: Escribir test del nuevo middleware (falla primero)**

Crear `modules/portal/tests/permisos.middleware.test.js`:

```javascript
const { verificarPermiso } = require('../backend/middleware/permisos.middleware');

jest.mock('../backend/config/database', () => ({
  grupo: { query: jest.fn() },
}));
const { grupo } = require('../backend/config/database');

function crearMocks(rol_nombre = 'empleado', rol_id = 2) {
  const req = { user: { usuario_id: 1, rol_id, rol_nombre } };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  return { req, res, next };
}

describe('verificarPermiso', () => {
  afterEach(() => jest.clearAllMocks());

  it('super_admin pasa sin consultar la BD', async () => {
    const { req, res, next } = crearMocks('super_admin', 1);
    await verificarPermiso('tickets', 'Tickets', 'consulta')(req, res, next);
    expect(grupo.query).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it('retorna 403 si no tiene el permiso', async () => {
    grupo.query.mockResolvedValueOnce({ rows: [] });
    const { req, res, next } = crearMocks();
    await verificarPermiso('tickets', 'Tickets', 'edicion')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('pasa si tiene permiso de consulta y se pide consulta', async () => {
    grupo.query.mockResolvedValueOnce({ rows: [{ existe: true }] });
    const { req, res, next } = crearMocks();
    await verificarPermiso('tickets', 'Tickets', 'consulta')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('pasa si tiene edicion y se pide consulta (edicion implica consulta)', async () => {
    grupo.query.mockResolvedValueOnce({ rows: [{ existe: true }] });
    const { req, res, next } = crearMocks();
    await verificarPermiso('tickets', 'Tickets', 'consulta')(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('retorna 401 si no hay usuario en req', async () => {
    const req = {};
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await verificarPermiso('tickets', 'Tickets', 'consulta')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
```

- [ ] **Paso 2.2: Ejecutar test — debe fallar**

```bash
cd modules/portal/backend && npm test -- --testPathPattern=permisos.middleware
```

Salida esperada: FAIL — `Cannot find module '../backend/middleware/permisos.middleware'`

- [ ] **Paso 2.3: Crear el nuevo middleware de permisos**

```javascript
// modules/portal/backend/middleware/permisos.middleware.js
const { grupo } = require('../config/database');

/**
 * Verifica que el usuario tenga permiso para una opción específica de un módulo.
 * @param {string} modulo - nombre del módulo (ej: 'tickets')
 * @param {string} opcion - nombre de la opción (ej: 'Tickets')
 * @param {'consulta'|'edicion'} tipo - tipo de permiso requerido
 */
function verificarPermiso(modulo, opcion, tipo) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ exito: false, mensaje: 'Usuario no autenticado' });
    }

    // super_admin tiene acceso total
    if (req.user.rol_nombre === 'super_admin') {
      return next();
    }

    if (!req.user.rol_id) {
      return res.status(403).json({ exito: false, mensaje: 'Usuario sin rol asignado' });
    }

    try {
      // Si se pide 'consulta', aceptar tanto 'consulta' como 'edicion'
      const tiposAceptados = tipo === 'consulta' ? ['consulta', 'edicion'] : ['edicion'];

      const resultado = await grupo.query(
        `SELECT 1 AS existe
         FROM rol_opcion_permisos rop
         JOIN modulo_opciones mo ON mo.id = rop.opcion_id
         JOIN modulos m ON m.id = mo.modulo_id
         WHERE rop.rol_id = $1
           AND m.nombre = $2
           AND mo.nombre = $3
           AND rop.tipo = ANY($4::text[])
         LIMIT 1`,
        [req.user.rol_id, modulo, opcion, tiposAceptados]
      );

      if (resultado.rows.length === 0) {
        return res.status(403).json({
          exito: false,
          mensaje: 'No tienes permiso para realizar esta acción',
          detalle: { modulo, opcion, tipo },
        });
      }

      next();
    } catch (error) {
      console.error('[Permisos] Error al verificar permiso:', error.message);
      res.status(500).json({ exito: false, mensaje: 'Error al verificar permisos' });
    }
  };
}

module.exports = { verificarPermiso };
```

- [ ] **Paso 2.4: Actualizar authenticateJWT para cargar rol_id desde usuarios**

En `modules/portal/backend/middleware/auth.middleware.js`, reemplazar el bloque de carga de roles dentro de `authenticateJWT`:

```javascript
// REEMPLAZAR el bloque de carga de roles (después de jwt.verify) con:
const resultadoUsuario = await grupo.query(
  `SELECT u.rol_id, r.nombre AS rol_nombre
   FROM usuarios u
   LEFT JOIN roles r ON r.id = u.rol_id
   WHERE u.id = $1`,
  [req.user.usuario_id]
);

if (resultadoUsuario.rows.length > 0) {
  req.user.rol_id = resultadoUsuario.rows[0].rol_id;
  req.user.rol_nombre = resultadoUsuario.rows[0].rol_nombre;
} else {
  req.user.rol_id = null;
  req.user.rol_nombre = null;
}

// Mantener compatibilidad con código que usa req.user.roles (array)
req.user.roles = req.user.rol_nombre ? [req.user.rol_nombre] : [];
```

- [ ] **Paso 2.5: Ejecutar tests del middleware**

```bash
cd modules/portal/backend && npm test -- --testPathPattern=permisos.middleware
```

Salida esperada: PASS — 5 tests en verde.

- [ ] **Paso 2.6: Ejecutar todos los tests del portal**

```bash
cd modules/portal/backend && npm test
```

Salida esperada: PASS — todos los tests existentes siguen pasando.

- [ ] **Paso 2.7: Commit**

```bash
git add modules/portal/backend/middleware/
git commit -m "feat: agregar middleware verificarPermiso con modelo granular modulo/opcion/tipo"
```

---

## Tarea 3: Actualizar rutas del portal al nuevo middleware

**Archivos:**
- Modificar: `modules/portal/backend/routes/noticia.routes.js`
- Modificar: `modules/portal/backend/routes/rol.routes.js`
- Modificar: `modules/portal/backend/routes/usuario.routes.js`
- Modificar: `modules/portal/backend/routes/modulo.routes.js`
- Modificar: `modules/portal/backend/routes/permiso.routes.js`
- Modificar: `modules/portal/backend/routes/auth.routes.js`

- [ ] **Paso 3.1: Actualizar noticia.routes.js**

```javascript
// modules/portal/backend/routes/noticia.routes.js
const { Router } = require('express');
const ControladorNoticia = require('../controllers/noticia.controller');
const { authenticateJWT } = require('../middleware/auth.middleware');
const { verificarPermiso } = require('../middleware/permisos.middleware');
const { auditoriaMiddleware } = require('../../../auditoria/backend/middleware/auditoria.middleware');

const router = Router();

// Ruta pública: noticias publicadas (sin auth — usada en login y home)
router.get('/publicas', ControladorNoticia.listarPublicadas);
router.get('/:id', ControladorNoticia.obtener);

router.use(authenticateJWT);

router.get('/', verificarPermiso('portal', 'Noticias', 'consulta'), ControladorNoticia.listarTodas);
router.post('/', verificarPermiso('portal', 'Noticias', 'edicion'), auditoriaMiddleware('portal', 'noticias', 'INSERT'), ControladorNoticia.crear);
router.put('/:id', verificarPermiso('portal', 'Noticias', 'edicion'), ControladorNoticia.actualizar);
router.delete('/:id', verificarPermiso('portal', 'Noticias', 'edicion'), ControladorNoticia.eliminar);

module.exports = router;
```

- [ ] **Paso 3.2: Actualizar rol.routes.js**

```javascript
// modules/portal/backend/routes/rol.routes.js
const { Router } = require('express');
const ControladorRol = require('../controllers/rol.controller');
const { authenticateJWT } = require('../middleware/auth.middleware');
const { verificarPermiso } = require('../middleware/permisos.middleware');

const router = Router();
router.use(authenticateJWT);

router.get('/', verificarPermiso('portal', 'Roles', 'consulta'), ControladorRol.listar);
router.post('/', verificarPermiso('portal', 'Roles', 'edicion'), ControladorRol.crear);
router.put('/:id', verificarPermiso('portal', 'Roles', 'edicion'), ControladorRol.actualizar);
router.delete('/:id', verificarPermiso('portal', 'Roles', 'edicion'), ControladorRol.eliminar);

module.exports = router;
```

- [ ] **Paso 3.3: Actualizar usuario.routes.js**

```javascript
// modules/portal/backend/routes/usuario.routes.js
const { Router } = require('express');
const ControladorUsuario = require('../controllers/usuario.controller');
const { authenticateJWT } = require('../middleware/auth.middleware');
const { verificarPermiso } = require('../middleware/permisos.middleware');

const router = Router();
router.use(authenticateJWT);

router.get('/', verificarPermiso('portal', 'Usuarios', 'consulta'), ControladorUsuario.listar);
router.get('/:id', verificarPermiso('portal', 'Usuarios', 'consulta'), ControladorUsuario.obtener);
router.put('/:id', verificarPermiso('portal', 'Usuarios', 'edicion'), ControladorUsuario.actualizar);
router.delete('/:id', verificarPermiso('portal', 'Usuarios', 'edicion'), ControladorUsuario.eliminar);
router.post('/:id/rol', verificarPermiso('portal', 'Usuarios', 'edicion'), ControladorUsuario.asignarRol);

module.exports = router;
```

- [ ] **Paso 3.4: Actualizar modulo.routes.js**

```javascript
// modules/portal/backend/routes/modulo.routes.js
const { Router } = require('express');
const ControladorModulo = require('../controllers/modulo.controller');
const { authenticateJWT } = require('../middleware/auth.middleware');
const { verificarPermiso } = require('../middleware/permisos.middleware');

const router = Router();

// Ruta pública: módulos activos (usada para construir el menú)
router.get('/activos', ControladorModulo.listarActivos);

router.use(authenticateJWT);

router.get('/', verificarPermiso('portal', 'Módulos', 'consulta'), ControladorModulo.listar);
router.post('/', verificarPermiso('portal', 'Módulos', 'edicion'), ControladorModulo.crear);
router.put('/:id', verificarPermiso('portal', 'Módulos', 'edicion'), ControladorModulo.actualizar);
router.delete('/:id', verificarPermiso('portal', 'Módulos', 'edicion'), ControladorModulo.eliminar);

module.exports = router;
```

- [ ] **Paso 3.5: Actualizar permiso.routes.js — ahora gestiona modulo_opciones + rol_opcion_permisos**

```javascript
// modules/portal/backend/routes/permiso.routes.js
const { Router } = require('express');
const { authenticateJWT } = require('../middleware/auth.middleware');
const { verificarPermiso } = require('../middleware/permisos.middleware');
const { grupo } = require('../config/database');

const router = Router();
router.use(authenticateJWT);

// GET /api/permisos/opciones — lista todas las opciones agrupadas por módulo
router.get('/opciones', verificarPermiso('portal', 'Roles', 'consulta'), async (req, res) => {
  try {
    const resultado = await grupo.query(`
      SELECT m.nombre AS modulo, mo.id, mo.nombre, mo.descripcion, mo.orden
      FROM modulo_opciones mo
      JOIN modulos m ON m.id = mo.modulo_id
      ORDER BY m.nombre, mo.orden
    `);
    res.json({ exito: true, datos: resultado.rows });
  } catch (e) {
    res.status(500).json({ exito: false, mensaje: 'Error al obtener opciones' });
  }
});

// GET /api/permisos/rol/:rol_id — permisos de un rol específico
router.get('/rol/:rol_id', verificarPermiso('portal', 'Roles', 'consulta'), async (req, res) => {
  try {
    const resultado = await grupo.query(
      `SELECT rop.opcion_id, rop.tipo FROM rol_opcion_permisos rop WHERE rop.rol_id = $1`,
      [req.params.rol_id]
    );
    res.json({ exito: true, datos: resultado.rows });
  } catch (e) {
    res.status(500).json({ exito: false, mensaje: 'Error al obtener permisos del rol' });
  }
});

// PUT /api/permisos/rol/:rol_id/modulo/:modulo — guarda permisos de un módulo para un rol
router.put('/rol/:rol_id/modulo/:modulo', verificarPermiso('portal', 'Roles', 'edicion'), async (req, res) => {
  const { rol_id, modulo } = req.params;
  // permisos: [{ opcion_id: 1, tipos: ['consulta'] }, { opcion_id: 2, tipos: ['consulta', 'edicion'] }]
  const { permisos } = req.body;

  try {
    // Eliminar permisos existentes del rol para este módulo
    await grupo.query(
      `DELETE FROM rol_opcion_permisos rop
       USING modulo_opciones mo JOIN modulos m ON m.id = mo.modulo_id
       WHERE rop.opcion_id = mo.id AND m.nombre = $1 AND rop.rol_id = $2`,
      [modulo, rol_id]
    );

    // Insertar nuevos permisos
    for (const p of permisos || []) {
      for (const tipo of p.tipos || []) {
        await grupo.query(
          `INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [rol_id, p.opcion_id, tipo]
        );
      }
    }

    res.json({ exito: true, mensaje: 'Permisos actualizados' });
  } catch (e) {
    res.status(500).json({ exito: false, mensaje: 'Error al guardar permisos' });
  }
});

module.exports = router;
```

- [ ] **Paso 3.6: Ejecutar todos los tests del portal**

```bash
cd modules/portal/backend && npm test
```

Salida esperada: PASS — todos los tests en verde.

- [ ] **Paso 3.7: Commit**

```bash
git add modules/portal/backend/routes/
git commit -m "feat: migrar rutas del portal al nuevo middleware verificarPermiso"
```

---

## Tarea 4: Página de administración de permisos (UI acordeón)

**Archivos:**
- Crear: `modules/portal/frontend/pages/PermisosAdminPage.jsx`
- Modificar: `modules/portal/frontend/main.jsx`

- [ ] **Paso 4.1: Crear la página**

```jsx
// modules/portal/frontend/pages/PermisosAdminPage.jsx
import { useState, useEffect } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function obtenerToken() {
  return localStorage.getItem('token');
}

export default function PermisosAdminPage() {
  const [roles, setRoles] = useState([]);
  const [rolSeleccionado, setRolSeleccionado] = useState('');
  const [opciones, setOpciones] = useState({});        // { modulo: [{ id, nombre }] }
  const [permisos, setPermisos] = useState({});         // { opcion_id: Set(['consulta','edicion']) }
  const [moduloAbierto, setModuloAbierto] = useState(null);
  const [guardando, setGuardando] = useState(null);
  const [mensajes, setMensajes] = useState({});         // { modulo: { tipo, texto } }

  // Cargar roles
  useEffect(() => {
    fetch(`${API}/api/roles`, { headers: { Authorization: `Bearer ${obtenerToken()}` } })
      .then(r => r.json())
      .then(j => { if (j.exito) setRoles(j.datos); });
  }, []);

  // Cargar opciones agrupadas por módulo
  useEffect(() => {
    fetch(`${API}/api/permisos/opciones`, { headers: { Authorization: `Bearer ${obtenerToken()}` } })
      .then(r => r.json())
      .then(j => {
        if (!j.exito) return;
        const agrupadas = {};
        j.datos.forEach(o => {
          if (!agrupadas[o.modulo]) agrupadas[o.modulo] = [];
          agrupadas[o.modulo].push(o);
        });
        setOpciones(agrupadas);
      });
  }, []);

  // Cargar permisos cuando cambia el rol
  useEffect(() => {
    if (!rolSeleccionado) return;
    fetch(`${API}/api/permisos/rol/${rolSeleccionado}`, { headers: { Authorization: `Bearer ${obtenerToken()}` } })
      .then(r => r.json())
      .then(j => {
        if (!j.exito) return;
        const mapa = {};
        j.datos.forEach(p => {
          if (!mapa[p.opcion_id]) mapa[p.opcion_id] = new Set();
          mapa[p.opcion_id].add(p.tipo);
        });
        setPermisos(mapa);
      });
  }, [rolSeleccionado]);

  function togglePermiso(opcion_id, tipo) {
    setPermisos(prev => {
      const nuevo = { ...prev };
      if (!nuevo[opcion_id]) nuevo[opcion_id] = new Set();
      else nuevo[opcion_id] = new Set(nuevo[opcion_id]);

      if (tipo === 'edicion') {
        if (nuevo[opcion_id].has('edicion')) {
          nuevo[opcion_id].delete('edicion');
          nuevo[opcion_id].delete('consulta');
        } else {
          nuevo[opcion_id].add('edicion');
          nuevo[opcion_id].add('consulta'); // edición implica consulta
        }
      } else {
        if (nuevo[opcion_id].has('edicion')) return prev; // no desmarcar consulta si hay edición
        if (nuevo[opcion_id].has('consulta')) nuevo[opcion_id].delete('consulta');
        else nuevo[opcion_id].add('consulta');
      }
      return nuevo;
    });
  }

  async function guardarModulo(modulo) {
    setGuardando(modulo);
    const opcionesModulo = opciones[modulo] || [];
    const payload = opcionesModulo.map(o => ({
      opcion_id: o.id,
      tipos: Array.from(permisos[o.id] || []),
    }));

    try {
      const resp = await fetch(`${API}/api/permisos/rol/${rolSeleccionado}/modulo/${modulo}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${obtenerToken()}` },
        body: JSON.stringify({ permisos: payload }),
      });
      const json = await resp.json();
      setMensajes(prev => ({ ...prev, [modulo]: { tipo: json.exito ? 'exito' : 'error', texto: json.mensaje } }));
    } catch {
      setMensajes(prev => ({ ...prev, [modulo]: { tipo: 'error', texto: 'Error de conexión' } }));
    } finally {
      setGuardando(null);
      setTimeout(() => setMensajes(prev => { const n = { ...prev }; delete n[modulo]; return n; }), 3000);
    }
  }

  return (
    <div className="contenido-principal">
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Administración de Permisos</h1>

      {/* Selector de rol */}
      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{ fontWeight: 600, marginRight: '0.75rem' }}>Rol:</label>
        <select
          value={rolSeleccionado}
          onChange={e => setRolSeleccionado(e.target.value)}
          style={{ padding: '0.5rem 1rem', border: '1px solid var(--color-borde)', borderRadius: '6px', fontSize: '0.95rem' }}
        >
          <option value="">— Selecciona un rol —</option>
          {roles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
      </div>

      {!rolSeleccionado && (
        <p style={{ color: 'var(--color-texto-claro)' }}>Selecciona un rol para ver y editar sus permisos.</p>
      )}

      {/* Acordeón por módulo */}
      {rolSeleccionado && Object.entries(opciones).map(([modulo, opcionesModulo]) => (
        <div key={modulo} style={{ border: '1px solid var(--color-borde)', borderRadius: '8px', marginBottom: '0.75rem', overflow: 'hidden' }}>
          <button
            onClick={() => setModuloAbierto(moduloAbierto === modulo ? null : modulo)}
            style={{ width: '100%', padding: '0.875rem 1rem', background: moduloAbierto === modulo ? 'var(--color-primario)' : 'var(--color-superficie)', color: moduloAbierto === modulo ? '#fff' : 'var(--color-texto)', border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 600, fontSize: '0.95rem', textTransform: 'capitalize' }}
          >
            <span>{modulo}</span>
            <span>{moduloAbierto === modulo ? '▲' : '▼'}</span>
          </button>

          {moduloAbierto === modulo && (
            <div style={{ padding: '1rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--color-texto-claro)', fontWeight: 600 }}>Opción</th>
                    <th style={{ textAlign: 'center', padding: '0.5rem', color: 'var(--color-texto-claro)', fontWeight: 600 }}>Consulta</th>
                    <th style={{ textAlign: 'center', padding: '0.5rem', color: 'var(--color-texto-claro)', fontWeight: 600 }}>Edición</th>
                  </tr>
                </thead>
                <tbody>
                  {opcionesModulo.map(o => (
                    <tr key={o.id} style={{ borderTop: '1px solid var(--color-borde)' }}>
                      <td style={{ padding: '0.5rem' }}>{o.nombre}</td>
                      <td style={{ textAlign: 'center', padding: '0.5rem' }}>
                        <input type="checkbox" checked={permisos[o.id]?.has('consulta') || false} onChange={() => togglePermiso(o.id, 'consulta')} />
                      </td>
                      <td style={{ textAlign: 'center', padding: '0.5rem' }}>
                        <input type="checkbox" checked={permisos[o.id]?.has('edicion') || false} onChange={() => togglePermiso(o.id, 'edicion')} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem', marginTop: '0.75rem' }}>
                {mensajes[modulo] && (
                  <span style={{ fontSize: '0.85rem', color: mensajes[modulo].tipo === 'exito' ? 'var(--color-exito)' : 'var(--color-error)' }}>
                    {mensajes[modulo].texto}
                  </span>
                )}
                <button
                  onClick={() => guardarModulo(modulo)}
                  disabled={guardando === modulo}
                  style={{ padding: '0.5rem 1.25rem', background: 'var(--color-primario)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                >
                  {guardando === modulo ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Paso 4.2: Agregar ruta en main.jsx**

En `modules/portal/frontend/main.jsx`, agregar:

```jsx
import PermisosAdminPage from "./pages/PermisosAdminPage";

// Dentro de AppRutas, agregar:
<Route
  path="/admin/permisos"
  element={
    <RutaProtegida>
      <PermisosAdminPage />
    </RutaProtegida>
  }
/>
```

- [ ] **Paso 4.3: Commit**

```bash
git add modules/portal/frontend/pages/PermisosAdminPage.jsx modules/portal/frontend/main.jsx
git commit -m "feat: agregar PermisosAdminPage con acordeon por modulo y checkboxes consulta/edicion"
```

---

## Tarea 5: Responsive en globales.css

**Archivos:**
- Modificar: `modules/portal/frontend/styles/globales.css`

- [ ] **Paso 5.1: Agregar breakpoints y utilidades responsive al final del archivo**

Abrir `modules/portal/frontend/styles/globales.css` y agregar al final:

```css
/* ========== RESPONSIVE BREAKPOINTS ========== */
/* sm: 480px · md: 768px · lg: 1024px */

/* Tablas responsive */
.tabla-responsive {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

/* Grid de KPIs */
.grid-kpis {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}
.grid-kpis > * {
  flex: 1;
  min-width: 140px;
}

/* Grid de gráficas */
.grid-graficas {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  margin-top: 1.5rem;
}
.grid-graficas .grafica-principal {
  flex: 1.5;
  min-width: 300px;
}
.grid-graficas .grafica-secundaria {
  flex: 1;
  min-width: 260px;
}

/* Formularios responsive */
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
}

/* ========== MOBILE (max-width: 768px) ========== */
@media (max-width: 768px) {
  .contenido-principal {
    padding: 1rem;
  }

  /* Menú hamburguesa */
  .menu-nav-links {
    display: none;
  }
  .menu-nav-links.abierto {
    display: flex;
    flex-direction: column;
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background-color: var(--color-primario-oscuro);
    padding: 1rem;
    z-index: 100;
  }
  .menu-hamburguesa {
    display: flex !important;
  }

  /* KPIs: 2 columnas en móvil */
  .grid-kpis > * {
    min-width: calc(50% - 0.5rem);
  }

  /* Gráficas: columna única */
  .grid-graficas .grafica-principal,
  .grid-graficas .grafica-secundaria {
    min-width: 100%;
  }
}

/* ========== SMALL MOBILE (max-width: 480px) ========== */
@media (max-width: 480px) {
  .grid-kpis > * {
    min-width: 100%;
  }
}
```

- [ ] **Paso 5.2: Commit**

```bash
git add modules/portal/frontend/styles/globales.css
git commit -m "feat: agregar clases responsive y breakpoints a globales.css"
```

---

## Tarea 6: Componente CarruselNoticias

**Archivos:**
- Crear: `modules/portal/frontend/components/CarruselNoticias.jsx`

- [ ] **Paso 6.1: Crear el componente**

```jsx
// modules/portal/frontend/components/CarruselNoticias.jsx
import { useState, useEffect, useCallback } from 'react';

// modo: 'fondo' = texto sobre imagen/gradiente | 'tarjeta' = card con texto abajo
export default function CarruselNoticias({ noticias = [], autoPlay = true, intervalo = 5000, modo = 'fondo' }) {
  const [indice, setIndice] = useState(0);
  const [pausado, setPausado] = useState(false);

  const siguiente = useCallback(() => {
    setIndice(i => (i + 1) % noticias.length);
  }, [noticias.length]);

  const anterior = () => setIndice(i => (i - 1 + noticias.length) % noticias.length);

  useEffect(() => {
    if (!autoPlay || pausado || noticias.length <= 1) return;
    const timer = setInterval(siguiente, intervalo);
    return () => clearInterval(timer);
  }, [autoPlay, pausado, siguiente, intervalo, noticias.length]);

  // Swipe táctil
  const [touchStart, setTouchStart] = useState(null);
  function onTouchStart(e) { setTouchStart(e.touches[0].clientX); }
  function onTouchEnd(e) {
    if (touchStart === null) return;
    const diff = touchStart - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) diff > 0 ? siguiente() : anterior();
    setTouchStart(null);
  }

  if (!noticias.length) return null;
  const noticia = noticias[indice];

  const gradientes = [
    'linear-gradient(135deg, #1a5276, #2e86c1)',
    'linear-gradient(135deg, #154360, #1a5276)',
    'linear-gradient(135deg, #0b3d91, #1a5276)',
    'linear-gradient(135deg, #1a5276, #0b5394)',
  ];

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: '220px', overflow: 'hidden', borderRadius: '8px' }}
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Fondo */}
      <div style={{
        position: 'absolute', inset: 0,
        background: gradientes[indice % gradientes.length],
        transition: 'background 0.5s ease',
      }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 30%, rgba(0,0,0,0.75))' }} />

      {/* Contenido */}
      <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '1.5rem' }}>
        {noticia.tipo && (
          <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
            {noticia.tipo}
          </span>
        )}
        <h3 style={{ color: '#fff', fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.4rem', lineHeight: 1.3 }}>
          {noticia.titulo}
        </h3>
        {noticia.subtitulo && (
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.85rem', margin: 0, lineHeight: 1.4 }}>
            {noticia.subtitulo}
          </p>
        )}

        {/* Puntos de navegación */}
        {noticias.length > 1 && (
          <div style={{ display: 'flex', gap: '6px', marginTop: '1rem' }}>
            {noticias.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndice(i)}
                style={{ width: i === indice ? '20px' : '8px', height: '8px', borderRadius: '4px', background: i === indice ? '#fff' : 'rgba(255,255,255,0.4)', border: 'none', cursor: 'pointer', transition: 'all 0.3s ease', padding: 0 }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Flechas */}
      {noticias.length > 1 && (
        <>
          <button onClick={anterior} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.3)', color: '#fff', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '1rem' }}>‹</button>
          <button onClick={siguiente} style={{ position: 'absolute', right: '0.75rem', top: '50%', transform: 'translateY(-50%)', background: 'rgba(0,0,0,0.3)', color: '#fff', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '1rem' }}>›</button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Paso 6.2: Commit**

```bash
git add modules/portal/frontend/components/CarruselNoticias.jsx
git commit -m "feat: agregar componente CarruselNoticias con auto-play, puntos, flechas y swipe tactil"
```

---

## Tarea 7: Rediseño PortalLogin — Split Screen + Logo + Carrusel

**Archivos:**
- Modificar: `modules/portal/frontend/pages/PortalLogin.jsx`

- [ ] **Paso 7.1: Reemplazar PortalLogin.jsx**

Leer el archivo actual primero para identificar la lógica de submit existente, luego reemplazar solo la estructura visual:

```jsx
// modules/portal/frontend/pages/PortalLogin.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usarAuth } from '../context/AuthContext';
import CarruselNoticias from '../components/CarruselNoticias';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const NOMBRE_EMPRESA = import.meta.env.VITE_NOMBRE_EMPRESA || 'Intranet Corporativa';

export default function PortalLogin() {
  const [correo, setCorreo] = useState('');
  const [contraseña, setContraseña] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [noticias, setNoticias] = useState([]);
  const { iniciarSesion } = usarAuth();
  const navigate = useNavigate();

  // Cargar noticias públicas para el carrusel
  useState(() => {
    fetch(`${API}/api/noticias/publicas`)
      .then(r => r.json())
      .then(j => { if (j.exito) setNoticias(j.datos || []); })
      .catch(() => {});
  }, []);

  async function manejarEnvio(e) {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const resp = await fetch(`${API}/api/auth/inicio-sesion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo, contraseña }),
      });
      const json = await resp.json();
      if (!json.exito) { setError(json.mensaje || 'Credenciales incorrectas'); return; }
      iniciarSesion(json.datos);
      navigate('/');
    } catch {
      setError('Error al conectar con el servidor');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Panel izquierdo: Logo + Formulario */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem', background: 'var(--color-fondo)', minWidth: 0 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div style={{ width: '72px', height: '72px', borderRadius: '16px', background: 'var(--color-primario)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem', fontSize: '2rem' }}>
            🏢
          </div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-texto)', margin: 0 }}>{NOMBRE_EMPRESA}</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-texto-claro)', marginTop: '0.25rem' }}>Acceso al portal corporativo</p>
        </div>

        {/* Formulario */}
        <form onSubmit={manejarEnvio} style={{ width: '100%', maxWidth: '360px' }}>
          {error && (
            <div style={{ background: '#fdecea', border: '1px solid var(--color-error)', borderRadius: '6px', padding: '0.75rem', marginBottom: '1rem', color: 'var(--color-error)', fontSize: '0.9rem' }}>
              {error}
            </div>
          )}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.9rem' }}>Correo electrónico</label>
            <input
              type="email" value={correo} onChange={e => setCorreo(e.target.value)} required
              style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1px solid var(--color-borde)', borderRadius: '6px', fontSize: '0.95rem', boxSizing: 'border-box' }}
              placeholder="usuario@empresa.com"
            />
          </div>
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.4rem', fontSize: '0.9rem' }}>Contraseña</label>
            <input
              type="password" value={contraseña} onChange={e => setContraseña(e.target.value)} required
              style={{ width: '100%', padding: '0.625rem 0.875rem', border: '1px solid var(--color-borde)', borderRadius: '6px', fontSize: '0.95rem', boxSizing: 'border-box' }}
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit" disabled={cargando}
            style={{ width: '100%', padding: '0.75rem', background: 'var(--color-primario)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' }}
          >
            {cargando ? 'Iniciando sesión...' : 'Iniciar sesión'}
          </button>
        </form>
      </div>

      {/* Panel derecho: Carrusel de noticias (oculto en móvil) */}
      <div style={{ flex: 1, display: 'none', minWidth: 0 }} className="login-panel-carrusel">
        <div style={{ width: '100%', height: '100%', minHeight: '100vh' }}>
          <CarruselNoticias noticias={noticias} modo="fondo" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Paso 7.2: Agregar CSS para mostrar el panel derecho en desktop**

Al final de `modules/portal/frontend/styles/globales.css`, agregar:

```css
/* Login split screen */
@media (min-width: 769px) {
  .login-panel-carrusel {
    display: block !important;
  }
}
```

- [ ] **Paso 7.3: Agregar VITE_NOMBRE_EMPRESA al .env.dev**

```bash
echo "VITE_NOMBRE_EMPRESA=Mi Empresa SA" >> .env.dev
```

- [ ] **Paso 7.4: Verificar que compila**

```bash
cd modules/portal/frontend && npm run build
```

Salida esperada: `built in Xs` sin errores.

- [ ] **Paso 7.5: Commit**

```bash
git add modules/portal/frontend/pages/PortalLogin.jsx modules/portal/frontend/styles/globales.css .env.dev
git commit -m "feat: redisenar PortalLogin con split screen, logo y carrusel de noticias"
```

---

## Tarea 8: Rediseño PortalHome — Destacada + Lista Lateral

**Archivos:**
- Modificar: `modules/portal/frontend/pages/PortalHome.jsx`

- [ ] **Paso 8.1: Reemplazar PortalHome.jsx**

```jsx
// modules/portal/frontend/pages/PortalHome.jsx
import { useState, useEffect } from 'react';
import CarruselNoticias from '../components/CarruselNoticias';
import { usarAuth } from '../context/AuthContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function obtenerToken() { return localStorage.getItem('token'); }

export default function PortalHome() {
  const { usuario } = usarAuth();
  const [noticias, setNoticias] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/noticias/publicas`)
      .then(r => r.json())
      .then(j => { if (j.exito) setNoticias(j.datos || []); })
      .catch(() => {})
      .finally(() => setCargando(false));
  }, []);

  const destacadas = noticias.slice(0, 5);
  const secundarias = noticias.slice(5, 10);

  return (
    <div className="contenido-principal">
      <h2 style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: '1.25rem' }}>
        Bienvenido, {usuario?.nombre || 'usuario'}
      </h2>

      {cargando ? (
        <p style={{ color: 'var(--color-texto-claro)' }}>Cargando noticias...</p>
      ) : (
        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
          {/* Noticia destacada con carrusel (60%) */}
          <div style={{ flex: '1.5', minWidth: '300px', minHeight: '320px' }}>
            {destacadas.length > 0
              ? <CarruselNoticias noticias={destacadas} modo="fondo" />
              : <div style={{ height: '320px', background: 'var(--color-superficie)', border: '1px solid var(--color-borde)', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-texto-claro)' }}>Sin noticias publicadas</div>
            }
          </div>

          {/* Lista lateral (40%) */}
          {secundarias.length > 0 && (
            <div style={{ flex: '1', minWidth: '240px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <h3 style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-texto-claro)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                Más noticias
              </h3>
              {secundarias.map(n => (
                <div key={n.id} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', background: 'var(--color-superficie)', border: '1px solid var(--color-borde)', borderRadius: '8px', padding: '0.75rem' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '6px', background: 'var(--color-primario)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 600, fontSize: '0.875rem', margin: '0 0 0.25rem', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{n.titulo}</p>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-texto-claro)' }}>
                      {n.fecha_publicacion ? new Date(n.fecha_publicacion).toLocaleDateString('es-MX') : ''}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Paso 8.2: Commit**

```bash
git add modules/portal/frontend/pages/PortalHome.jsx
git commit -m "feat: redisenar PortalHome con noticia destacada y lista lateral"
```

---

## Tarea 9: Actualizar MenuDinamico — Logo izquierda + Hamburguesa

**Archivos:**
- Modificar: `modules/portal/frontend/components/MenuDinamico.jsx`

- [ ] **Paso 9.1: Leer el archivo actual**

Leer `modules/portal/frontend/components/MenuDinamico.jsx` para entender la lógica existente de renderizado de módulos, luego reemplazar solo la estructura visual:

```jsx
// modules/portal/frontend/components/MenuDinamico.jsx
import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { usarAuth } from '../context/AuthContext';

const NOMBRE_EMPRESA = import.meta.env.VITE_NOMBRE_EMPRESA || 'Intranet';

// Mapeo de nombre de módulo → ruta
const RUTAS_MODULOS = {
  portal: '/',
  tickets: '/tickets',
  rh: '/rh',
  auditoria: '/auditoria',
  bi: '/bi',
  comercial: '/comercial',
};

export default function MenuDinamico({ modulos = [] }) {
  const { usuario, cerrarSesion } = usarAuth();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [dropdownAbierto, setDropdownAbierto] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  function handleCerrarSesion() {
    cerrarSesion();
    navigate('/inicio-sesion');
  }

  const modulosActivos = modulos.filter(m => m.activo);

  return (
    <nav style={{ background: 'var(--color-primario)', position: 'relative' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 1.5rem', display: 'flex', alignItems: 'center', height: '56px', gap: '1rem' }}>

        {/* Logo izquierda */}
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', textDecoration: 'none', flexShrink: 0 }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
            🏢
          </div>
          <span style={{ color: '#fff', fontWeight: 700, fontSize: '1rem', whiteSpace: 'nowrap' }}>{NOMBRE_EMPRESA}</span>
        </Link>

        {/* Links de módulos — centro (desktop) */}
        <div className="menu-nav-links" style={{ display: 'flex', gap: '0.25rem', flex: 1, justifyContent: 'center' }}>
          {modulosActivos.map(m => {
            const ruta = RUTAS_MODULOS[m.nombre] || `/${m.nombre}`;
            const activa = location.pathname === ruta || location.pathname.startsWith(ruta + '/');
            return (
              <Link
                key={m.id}
                to={ruta}
                style={{
                  color: activa ? '#fff' : 'rgba(255,255,255,0.75)',
                  textDecoration: 'none',
                  padding: '0.4rem 0.875rem',
                  borderRadius: '6px',
                  fontWeight: activa ? 600 : 400,
                  fontSize: '0.9rem',
                  background: activa ? 'rgba(255,255,255,0.15)' : 'transparent',
                  whiteSpace: 'nowrap',
                }}
              >
                {m.nombre.charAt(0).toUpperCase() + m.nombre.slice(1)}
              </Link>
            );
          })}
        </div>

        {/* Avatar + nombre usuario — derecha (desktop) */}
        {usuario && (
          <div style={{ position: 'relative', flexShrink: 0 }} className="menu-usuario">
            <button
              onClick={() => setDropdownAbierto(!dropdownAbierto)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '20px', padding: '0.25rem 0.75rem 0.25rem 0.25rem', cursor: 'pointer', color: '#fff', fontSize: '0.875rem', fontWeight: 500 }}
            >
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem' }}>
                {usuario.nombre?.charAt(0).toUpperCase()}
              </div>
              <span className="menu-usuario-nombre">{usuario.nombre}</span>
              <span>▾</span>
            </button>

            {dropdownAbierto && (
              <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', background: '#fff', border: '1px solid var(--color-borde)', borderRadius: '8px', boxShadow: 'var(--sombra)', minWidth: '160px', zIndex: 200 }}>
                <Link to="/rh/perfil" onClick={() => setDropdownAbierto(false)} style={{ display: 'block', padding: '0.625rem 1rem', color: 'var(--color-texto)', textDecoration: 'none', fontSize: '0.9rem' }}>
                  Mi perfil
                </Link>
                <hr style={{ margin: '0.25rem 0', border: 'none', borderTop: '1px solid var(--color-borde)' }} />
                <button onClick={handleCerrarSesion} style={{ width: '100%', padding: '0.625rem 1rem', background: 'none', border: 'none', color: 'var(--color-error)', textAlign: 'left', cursor: 'pointer', fontSize: '0.9rem' }}>
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        )}

        {/* Hamburguesa (móvil) */}
        <button
          className="menu-hamburguesa"
          onClick={() => setMenuAbierto(!menuAbierto)}
          style={{ display: 'none', background: 'none', border: 'none', color: '#fff', fontSize: '1.5rem', cursor: 'pointer', padding: '0.25rem', marginLeft: 'auto' }}
        >
          {menuAbierto ? '✕' : '☰'}
        </button>
      </div>

      {/* Menú móvil desplegable */}
      {menuAbierto && (
        <div style={{ background: 'var(--color-primario-oscuro)', padding: '0.75rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {modulosActivos.map(m => {
            const ruta = RUTAS_MODULOS[m.nombre] || `/${m.nombre}`;
            return (
              <Link
                key={m.id}
                to={ruta}
                onClick={() => setMenuAbierto(false)}
                style={{ color: 'rgba(255,255,255,0.9)', textDecoration: 'none', padding: '0.625rem 0', fontSize: '0.95rem' }}
              >
                {m.nombre.charAt(0).toUpperCase() + m.nombre.slice(1)}
              </Link>
            );
          })}
          {usuario && (
            <button onClick={handleCerrarSesion} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', textAlign: 'left', padding: '0.625rem 0', fontSize: '0.95rem', cursor: 'pointer' }}>
              Cerrar sesión
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
```

- [ ] **Paso 9.2: Commit**

```bash
git add modules/portal/frontend/components/MenuDinamico.jsx
git commit -m "feat: actualizar MenuDinamico con logo izquierda, links centro y hamburguesa movil"
```

---

## Tarea 10: Revisión general y tests

- [ ] **Paso 10.1: Ejecutar todos los tests del portal**

```bash
cd modules/portal/backend && npm test
```

Salida esperada: PASS — todos los tests en verde.

- [ ] **Paso 10.2: Levantar Docker y verificar flujo completo**

```bash
docker compose -f docker-compose.dev.yml up -d
```

Verificar manualmente:
1. `http://localhost:3000/inicio-sesion` — split screen, logo, carrusel visible (si hay noticias publicadas).
2. Login con `admin@intranet.local` — redirige a Home.
3. Home — carrusel de noticias destacadas y lista lateral.
4. Navbar — logo izquierda, links de módulos al centro, avatar derecha.
5. En DevTools → responsive 375px — menú hamburguesa visible.
6. `http://localhost:3000/admin/permisos` — acordeón de módulos visible.

- [ ] **Paso 10.3: Verificar el endpoint de noticias públicas**

```bash
curl -s http://localhost:4000/api/noticias/publicas | jq '.exito'
```

Salida esperada: `true` (sin necesidad de token).

- [ ] **Paso 10.4: Commit final**

```bash
git add -A
git commit -m "fase 2: portal — modelo permisos granular + UI responsive + carrusel + login + navbar"
```
