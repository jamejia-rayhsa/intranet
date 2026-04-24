# Arquitectura — uliweb Intranet Corporativa

> Generado: 2026-04-14 | Actualizado: 2026-04-18 | Stack: Node.js + Express + React 18 + PostgreSQL + Docker

---

## Índice

1. [Visión general](#1-visión-general)
2. [Estructura modular](#2-estructura-modular)
3. [Interfaces y contratos entre módulos](#3-interfaces-y-contratos-entre-módulos)
4. [Esquema de base de datos](#4-esquema-de-base-de-datos)
5. [Sistema de autenticación](#5-sistema-de-autenticación)
6. [Sistema de permisos granulares](#6-sistema-de-permisos-granulares)
7. [Sistema de auditoría](#7-sistema-de-auditoría)
8. [Frontend React](#8-frontend-react)
9. [Infraestructura Docker](#9-infraestructura-docker)
10. [Puntos de extensión para nuevos módulos](#10-puntos-de-extensión-para-nuevos-módulos)

---

## 1. Visión general

```
┌─────────────────────────────────────────────────────────┐
│  Navegador (puerto 3000)                                │
│  React 18 + Vite — frontend único                       │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP / REST JSON
                     │ Authorization: Bearer <JWT>
┌────────────────────▼────────────────────────────────────┐
│  Backend Portal — Express (puerto 4000)                 │
│  Integra las rutas de TODOS los módulos                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │  Portal  │ │ Tickets  │ │    RH    │ │ Auditoría │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │ pg Pool
┌────────────────────▼────────────────────────────────────┐
│  PostgreSQL 16 (puerto 5432)                            │
│  Base de datos única — todas las tablas                 │
└─────────────────────────────────────────────────────────┘
```

**Decisión clave:** todos los módulos de backend son paquetes Node independientes pero sus rutas se montan en un solo proceso Express (puerto 4000). No hay microservicios HTTP entre módulos; la comunicación es código JS directo.

---

## 2. Estructura modular

### Árbol de directorios

```
uliweb/
├── config/
│   └── database/
│       └── init.sql              # Esquema completo + seeds
├── modules/
│   ├── portal/
│   │   ├── backend/              # API principal (puerto 4000)
│   │   └── frontend/             # App React (puerto 3000)
│   ├── tickets/
│   │   ├── backend/              # Rutas integradas en portal
│   │   └── frontend/             # Páginas importadas en main.jsx
│   ├── rh/
│   │   ├── backend/
│   │   └── frontend/
│   └── auditoria/
│       ├── backend/
│       └── frontend/
├── docs/
├── docker-compose.dev.yml
├── Dockerfile.backend
└── package.json                  # npm workspaces raíz
```

### Módulo Portal

**Propósito:** núcleo del sistema — autenticación, usuarios, roles, permisos, noticias y menú dinámico.

```
modules/portal/backend/
├── app.js                  # Entry point Express, monta todas las rutas
├── config/database.js      # Pool PostgreSQL
├── middleware/
│   ├── auth.middleware.js          # authenticateJWT, autorizar
│   ├── permisos.middleware.js      # verificarPermiso (Fase 2)
│   └── upload.noticia.middleware.js
├── models/
│   ├── usuario.model.js
│   ├── rol.model.js
│   ├── permiso.model.js
│   ├── modulo.model.js
│   └── noticia.model.js
├── controllers/
│   ├── auth.controller.js
│   ├── usuario.controller.js
│   └── noticia.controller.js
├── services/
│   ├── auth.service.js
│   └── ms365.service.js
├── routes/
│   ├── auth.routes.js      # /api/auth
│   ├── usuario.routes.js   # /api/usuarios
│   ├── rol.routes.js       # /api/roles
│   ├── modulo.routes.js    # /api/modulos
│   └── noticia.routes.js   # /api/noticias
└── migrations/
    ├── 001-crear-tablas-portal.sql
    └── 002-modelo-permisos-granular.sql
```

**Rutas expuestas:**

| Ruta | Método | Descripción |
|------|--------|-------------|
| `/api/auth/registro` | POST | Registro local |
| `/api/auth/inicio-sesion` | POST | Login local → JWT |
| `/api/auth/ms365` | GET | OAuth Azure AD |
| `/api/auth/perfil` | GET | Perfil autenticado |
| `/api/usuarios` | GET/POST/PUT/DELETE | CRUD usuarios |
| `/api/roles` | GET/POST/PUT/DELETE | CRUD roles |
| `/api/modulos` | GET/PUT | Gestión módulos |
| `/api/noticias` | GET/POST/PUT/DELETE | CRUD noticias |

---

### Módulo Tickets

**Propósito:** sistema de soporte TI con tickets, adjuntos, comentarios y encuestas de satisfacción.

```
modules/tickets/backend/
├── models/
│   ├── ticket.model.js
│   ├── ticketAdjunto.model.js
│   ├── ticketCategoria.model.js
│   ├── ticketComentario.model.js
│   └── ticketEncuesta.model.js
├── controllers/
├── routes/
│   ├── tickets.routes.js           # /api/tickets
│   ├── tickets.dashboard.routes.js # /api/tickets (dashboard KPIs)
│   ├── adjuntos.routes.js          # /api/adjuntos
│   ├── categorias.routes.js        # /api/categorias
│   └── comentarios.routes.js       # /api/comentarios
└── migrations/
    └── 001-crear-tablas-tickets.sql
```

**Estados de ticket:** `abierto` → `en_progreso` → `resuelto` → `cerrado`

**Niveles de atención:** `bajo`, `medio`, `alto`, `critico`

---

### Módulo RH

**Propósito:** gestión de Recursos Humanos — empleados, estructura organizacional, expedientes, permisos/vacaciones y nómina.

```
modules/rh/backend/
├── models/
│   ├── empleado.model.js
│   ├── departamento.model.js
│   ├── puesto.model.js
│   ├── ubicacion.model.js
│   ├── expedienteDocumento.model.js
│   ├── permisoAusencia.model.js
│   └── reciboNomina.model.js
├── routes/
│   ├── empleados.routes.js         # /api/empleados
│   ├── departamentos.routes.js     # /api/departamentos
│   ├── puestos.routes.js           # /api/puestos
│   ├── ubicaciones.routes.js       # /api/ubicaciones
│   ├── expediente.routes.js        # /api/expediente
│   ├── permisos.routes.js          # /api/permisos-rh
│   ├── recibos.routes.js           # /api/recibos
│   └── rh.dashboard.routes.js      # /api/rh
└── migrations/
    └── 001-crear-tablas-rh.sql
```

---

### Módulo Auditoría

**Propósito:** registro transversal de todas las acciones INSERT/UPDATE/DELETE de todos los módulos.

```
modules/auditoria/backend/
├── config/database.js
├── models/auditoria.model.js
├── services/auditoria.service.js
├── middleware/
│   └── auditoria.middleware.js     # auditoriaMiddleware, auditoriaConValoresPrevios
├── controllers/
│   ├── auditoria.controller.js
│   └── auditoria.dashboard.controller.js
├── routes/
│   ├── auditoria.routes.js         # /api/auditoria
│   └── auditoria.dashboard.routes.js
└── migrations/
    └── 001_crear_tabla_auditoria.sql
```

---

## 3. Interfaces y contratos entre módulos

### 3.1 Cómo app.js del portal integra los módulos

`modules/portal/backend/app.js` monta rutas de todos los módulos:

```js
// Portal
app.use("/api/auth",        require("./routes/auth.routes"));
app.use("/api/usuarios",    require("./routes/usuario.routes"));
app.use("/api/roles",       require("./routes/rol.routes"));
app.use("/api/noticias",    require("./routes/noticia.routes"));
app.use("/api/modulos",     require("./routes/modulo.routes"));

// RH
app.use("/api/empleados",      require("../../rh/backend/routes/empleados.routes"));
app.use("/api/departamentos",  require("../../rh/backend/routes/departamentos.routes"));
app.use("/api/puestos",        require("../../rh/backend/routes/puestos.routes"));
app.use("/api/ubicaciones",    require("../../rh/backend/routes/ubicaciones.routes"));
app.use("/api/expediente",     require("../../rh/backend/routes/expediente.routes"));
app.use("/api/permisos-rh",    require("../../rh/backend/routes/permisos.routes"));
app.use("/api/recibos",        require("../../rh/backend/routes/recibos.routes"));
app.use("/api/rh",             require("../../rh/backend/routes/rh.dashboard.routes"));

// Tickets
app.use("/api/tickets",     require("../../tickets/backend/routes/tickets.routes"));
app.use("/api/tickets",     require("../../tickets/backend/routes/tickets.dashboard.routes"));
app.use("/api/adjuntos",    require("../../tickets/backend/routes/adjuntos.routes"));
app.use("/api/comentarios", require("../../tickets/backend/routes/comentarios.routes"));
app.use("/api/categorias",  require("../../tickets/backend/routes/categorias.routes"));

// Auditoría
app.use("/api/auditoria",   require("../../auditoria/backend/routes/auditoria.routes"));
```

### 3.2 Contrato de autenticación (req.user)

Cada ruta que usa `authenticateJWT` recibe en `req.user`:

```js
{
  usuario_id: number,    // ID primario del usuario
  correo:     string,
  iat:        number,    // timestamp de emisión del JWT
  exp:        number,    // timestamp de expiración
  rol_id:     number,    // FK a roles.id (consultado en BD)
  rol_nombre: string,    // 'super_admin' | 'portal_admin' | 'rh_admin' | ...
  roles:      string[]   // [rol_nombre] — compatibilidad legado
}
```

### 3.3 Contrato de permisos

```js
// Lectura (acepta 'consulta' y 'edicion')
verificarPermiso('tickets', 'Tickets', 'consulta')

// Escritura (solo 'edicion')
verificarPermiso('rh', 'Empleados', 'edicion')
```

El middleware devuelve 403 con:
```json
{
  "exito": false,
  "mensaje": "No tienes permiso para realizar esta acción",
  "detalle": { "modulo": "rh", "opcion": "Empleados", "tipo": "edicion" }
}
```

### 3.4 Contrato de auditoría

Los módulos importan el middleware directamente:

```js
const { auditoriaMiddleware, auditoriaConValoresPrevios } =
  require('../../../auditoria/backend/middleware/auditoria.middleware');

// Para INSERT — captura req.body como valores_nuevos
router.post('/', auditoriaMiddleware('portal', 'noticias', 'INSERT'), controller.crear);

// Para UPDATE/DELETE — el controlador debe set req.valores_previos
router.put('/:id', auditoriaConValoresPrevios('rh', 'empleados', 'UPDATE'), controller.actualizar);
```

### 3.5 Contrato de respuesta API

Todas las respuestas siguen la misma forma:

```json
// Éxito
{ "exito": true, "datos": { ... } }
{ "exito": true, "datos": [ ... ] }

// Error
{ "exito": false, "mensaje": "Descripción del error" }
{ "exito": false, "mensaje": "...", "detalle": { ... } }
```

### 3.6 Contrato de paginación

```json
{
  "exito": true,
  "datos": {
    "registros": [ ... ],
    "total": 120,
    "pagina": 1,
    "paginas_totales": 6
  }
}
```

Parámetros de query: `?pagina=1&limite=20`

---

## 4. Esquema de base de datos

### 4.1 Tablas Portal (core)

```sql
-- Usuarios del sistema
CREATE TABLE usuarios (
  id                       SERIAL PRIMARY KEY,
  correo                   VARCHAR(255) UNIQUE NOT NULL,
  nombre                   VARCHAR(100) NOT NULL,
  apellido                 VARCHAR(100),
  auth_tipo                VARCHAR(20) DEFAULT 'local',   -- 'local' | 'ms365'
  external_id              VARCHAR(100),                  -- OID de Azure AD
  hash_password            TEXT,
  activo                   BOOLEAN DEFAULT true,
  requiere_cambio_password BOOLEAN DEFAULT false,
  fecha_creacion           TIMESTAMP DEFAULT NOW()
);

-- Roles
CREATE TABLE roles (
  id     SERIAL PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE
  -- super_admin, portal_admin, rh_admin, rh_empleado,
  -- tickets_admin, tickets_tecnico, auditoria_viewer
);

-- Relación usuario-rol (legado multi-rol)
CREATE TABLE usuario_rol (
  usuario_id INT REFERENCES usuarios(id) ON DELETE CASCADE,
  rol_id     INT REFERENCES roles(id)    ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, rol_id)
);

-- Permisos simples (legado)
CREATE TABLE permisos (
  id     SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE
);
CREATE TABLE rol_permiso (
  rol_id     INT REFERENCES roles(id),
  permiso_id INT REFERENCES permisos(id),
  PRIMARY KEY (rol_id, permiso_id)
);

-- Módulos del sistema
CREATE TABLE modulos (
  id            SERIAL PRIMARY KEY,
  nombre        VARCHAR(100) NOT NULL UNIQUE,
  path_reactivo VARCHAR(150),  -- '/' | '/tickets' | '/rh' | '/auditoria'
  descripcion   TEXT,
  activo        BOOLEAN DEFAULT true
);

-- Noticias
CREATE TABLE noticias (
  id                  SERIAL PRIMARY KEY,
  titulo              VARCHAR(255) NOT NULL,
  subtitulo           TEXT,
  contenido           TEXT,
  tipo                VARCHAR(30),
  fecha_publicacion   DATE,
  publicada           BOOLEAN DEFAULT false,
  autor_id            INT REFERENCES usuarios(id),
  fecha_creacion      TIMESTAMP DEFAULT NOW(),
  fecha_actualizacion TIMESTAMP
);

-- Imágenes de noticias
CREATE TABLE noticia_imagenes (
  id             SERIAL PRIMARY KEY,
  noticia_id     INT NOT NULL REFERENCES noticias(id) ON DELETE CASCADE,
  ruta_archivo   VARCHAR(255) NOT NULL,
  nombre_archivo VARCHAR(255),
  orden          INT DEFAULT 0,
  fecha_subida   TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_noticia_imagenes_noticia ON noticia_imagenes(noticia_id);
```

### 4.2 Tablas de permisos granulares (Fase 2)

```sql
-- Opciones por módulo (ej: módulo=tickets, opción=Tickets)
CREATE TABLE modulo_opciones (
  id          SERIAL PRIMARY KEY,
  modulo_id   INT NOT NULL REFERENCES modulos(id) ON DELETE CASCADE,
  nombre      VARCHAR(100) NOT NULL,
  descripcion TEXT,
  orden       INT DEFAULT 0,
  UNIQUE(modulo_id, nombre)
);

-- Permisos por rol y opción
CREATE TABLE rol_opcion_permisos (
  rol_id    INT NOT NULL REFERENCES roles(id)           ON DELETE CASCADE,
  opcion_id INT NOT NULL REFERENCES modulo_opciones(id) ON DELETE CASCADE,
  tipo      VARCHAR(10) NOT NULL CHECK (tipo IN ('consulta', 'edicion')),
  PRIMARY KEY (rol_id, opcion_id, tipo)
);
```

**Opciones disponibles:**

| Módulo | Opción | Descripción |
|--------|--------|-------------|
| portal | Noticias | Gestión de noticias |
| portal | Usuarios | Gestión de usuarios |
| portal | Roles | Administración de roles |
| portal | Módulos | Activación de módulos |
| tickets | Tickets | Gestión de tickets |
| tickets | Categorías | Categorías de tickets |
| tickets | Adjuntos | Archivos adjuntos |
| tickets | Encuestas | Encuestas de satisfacción |
| rh | Empleados | Alta/baja/modificación |
| rh | Expedientes | Documentos laborales |
| rh | Permisos | Solicitudes de permisos |
| rh | Recibos | Recibos de nómina |
| auditoria | Logs | Registros de auditoría |

### 4.3 Tablas Tickets

```sql
CREATE TABLE ticket_categorias (
  id             SERIAL PRIMARY KEY,
  nombre         VARCHAR(100) NOT NULL UNIQUE,
  descripcion    TEXT,
  icono          VARCHAR(50) DEFAULT 'cog',
  activo         BOOLEAN DEFAULT true,
  fecha_creacion TIMESTAMP DEFAULT NOW()
);

CREATE TABLE tickets (
  id                  SERIAL PRIMARY KEY,
  solicitante_id      INT REFERENCES usuarios(id),
  tecnico_id          INT REFERENCES usuarios(id),
  titulo              VARCHAR(200) NOT NULL,
  descripcion         TEXT,
  categoria           VARCHAR(50),
  nivel_atencion      VARCHAR(20) DEFAULT 'bajo',    -- bajo|medio|alto|critico
  estado              VARCHAR(20) DEFAULT 'abierto', -- abierto|en_progreso|resuelto|cerrado
  fecha_creacion      TIMESTAMP DEFAULT NOW(),
  fecha_actualizacion TIMESTAMP,
  fecha_cierre        TIMESTAMP
);

CREATE TABLE ticket_adjuntos (
  id             SERIAL PRIMARY KEY,
  ticket_id      INT REFERENCES tickets(id) ON DELETE CASCADE,
  ruta_archivo   VARCHAR(255) NOT NULL,
  nombre_archivo VARCHAR(255),
  tipo_archivo   VARCHAR(100),
  fecha_subida   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ticket_encuestas (
  id             SERIAL PRIMARY KEY,
  ticket_id      INT REFERENCES tickets(id) ON DELETE CASCADE,
  calificacion   INT CHECK (calificacion BETWEEN 1 AND 5),
  comentarios    TEXT,
  fecha_respuesta TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_tickets_estado   ON tickets(estado);
CREATE INDEX idx_tickets_usuario  ON tickets(solicitante_id);
CREATE INDEX idx_tickets_tecnico  ON tickets(tecnico_id);
CREATE INDEX idx_tickets_nivel    ON tickets(nivel_atencion);
CREATE INDEX idx_tickets_fecha    ON tickets(fecha_creacion DESC);
```

### 4.4 Tablas RH

```sql
CREATE TABLE departamentos (
  id             SERIAL PRIMARY KEY,
  nombre         VARCHAR(100) NOT NULL UNIQUE,
  descripcion    TEXT,
  activo         BOOLEAN DEFAULT true,
  fecha_creacion TIMESTAMP DEFAULT NOW()
);

CREATE TABLE ubicaciones (
  id             SERIAL PRIMARY KEY,
  nombre         VARCHAR(100) NOT NULL,
  direccion      TEXT,
  ciudad         VARCHAR(100),
  estado         VARCHAR(100),
  codigo_postal  VARCHAR(10),
  telefono       VARCHAR(20),
  activo         BOOLEAN DEFAULT true,
  fecha_creacion TIMESTAMP DEFAULT NOW()
);

CREATE TABLE puestos (
  id              SERIAL PRIMARY KEY,
  nombre          VARCHAR(100) NOT NULL,
  descripcion     TEXT,
  departamento_id INT REFERENCES departamentos(id),
  nivel_salarial  VARCHAR(50),
  activo          BOOLEAN DEFAULT true,
  fecha_creacion  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE empleados (
  id                SERIAL PRIMARY KEY,
  usuario_id        INT REFERENCES usuarios(id),
  nombre            VARCHAR(100) NOT NULL,
  apellido          VARCHAR(100) NOT NULL,
  fecha_nacimiento  DATE,
  curp              VARCHAR(20),
  rfc               VARCHAR(20),
  puesto_id         INT REFERENCES puestos(id),
  departamento_id   INT REFERENCES departamentos(id),
  ubicacion_id      INT REFERENCES ubicaciones(id),
  jefe_inmediato_id INT REFERENCES empleados(id),
  estatus           VARCHAR(20) NOT NULL DEFAULT 'activo', -- activo|baja|suspendido
  fecha_ingreso     DATE,
  fecha_baja        DATE,
  motivo_baja       TEXT,
  fecha_creacion    TIMESTAMP DEFAULT NOW(),
  fecha_actualizacion TIMESTAMP
);

CREATE TABLE permisos_ausencia (
  id             SERIAL PRIMARY KEY,
  empleado_id    INT REFERENCES empleados(id),
  tipo           VARCHAR(30) NOT NULL, -- vacaciones|incapacidad|asunto_personal|otro
  fecha_inicio   DATE NOT NULL,
  fecha_fin      DATE NOT NULL,
  motivo         TEXT,
  estatus        VARCHAR(20) DEFAULT 'pendiente', -- pendiente|aprobado|rechazado
  fecha_solicitud  TIMESTAMP DEFAULT NOW(),
  fecha_respuesta  TIMESTAMP,
  respondedor_id   INT REFERENCES usuarios(id)
);

CREATE TABLE expediente_documentos (
  id              SERIAL PRIMARY KEY,
  empleado_id     INT REFERENCES empleados(id) ON DELETE CASCADE,
  tipo_documento  VARCHAR(50) NOT NULL,
  nombre_archivo  VARCHAR(255) NOT NULL,
  ruta_archivo    VARCHAR(500) NOT NULL,
  descripcion     TEXT,
  fecha_carga     TIMESTAMP DEFAULT NOW()
);

CREATE TABLE recibos_nomina (
  id            SERIAL PRIMARY KEY,
  empleado_id   INT REFERENCES empleados(id),
  periodo       VARCHAR(20) NOT NULL,
  fecha_pago    DATE,
  importe_total DECIMAL(10,2),
  ruta_archivo  VARCHAR(500),
  descripcion   TEXT,
  creado_por_id INT REFERENCES usuarios(id),
  fecha_creacion TIMESTAMP DEFAULT NOW()
);
```

### 4.5 Tabla Auditoría

```sql
CREATE TABLE auditoria (
  id              SERIAL PRIMARY KEY,
  usuario_id      INT NOT NULL REFERENCES usuarios(id),
  modulo          VARCHAR(100) NOT NULL,   -- 'portal'|'tickets'|'rh'|'auditoria'
  tabla           VARCHAR(100) NOT NULL,   -- tabla afectada
  registro_id     VARCHAR(100) NOT NULL,   -- PK del registro afectado
  accion          VARCHAR(20) NOT NULL,    -- 'INSERT'|'UPDATE'|'DELETE'
  valores_previos JSONB,                   -- snapshot antes (null en INSERT)
  valores_nuevos  JSONB,                   -- snapshot después (null en DELETE)
  ip_origen       VARCHAR(45),
  user_agent      TEXT,
  fecha           TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_auditoria_modulo  ON auditoria(modulo);
CREATE INDEX idx_auditoria_usuario ON auditoria(usuario_id);
CREATE INDEX idx_auditoria_fecha   ON auditoria(fecha DESC);
CREATE INDEX idx_auditoria_tabla   ON auditoria(tabla);
```

### 4.6 Diagrama de relaciones (simplificado)

```
usuarios ──FK──► roles
usuarios ──FK──► usuario_rol ◄──FK── roles
usuarios ──FK──► noticias (autor_id)
usuarios ──FK──► auditoria (usuario_id)
usuarios ──FK──► tickets (solicitante_id, tecnico_id)
usuarios ──FK──► empleados (usuario_id)

roles ──FK──► rol_permiso ◄──FK── permisos
roles ──FK──► rol_opcion_permisos ◄──FK── modulo_opciones ◄──FK── modulos

empleados ──FK──► puestos
empleados ──FK──► departamentos
empleados ──FK──► ubicaciones
empleados ──FK──► empleados (jefe_inmediato_id - self-ref)
empleados ──FK──► permisos_ausencias
empleados ──FK──► expediente_documentos
empleados ──FK──► recibos_nomina

tickets ──FK──► ticket_adjuntos
tickets ──FK──► ticket_encuestas

noticias ──FK──► noticia_imagenes
```

---

## 5. Sistema de autenticación

### 5.1 Flujo de login local

```
1. POST /api/auth/inicio-sesion { correo, contraseña }
       ↓
2. ServicioAuth.inicioSesionLocal()
   - SELECT usuario WHERE correo = $1
   - bcrypt.compare(contraseña, hash_password)
   - SELECT rol FROM usuario_rol WHERE usuario_id = $1
       ↓
3. jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' })
       ↓
4. → { exito: true, datos: { usuario, token } }
       ↓
5. Cliente: localStorage.setItem('token', token)
       ↓
6. Futuras peticiones: Authorization: Bearer <token>
       ↓
7. authenticateJWT:
   - jwt.verify(token, JWT_SECRET)
   - SELECT rol_id, rol_nombre FROM usuario_rol JOIN roles
   - req.user = { usuario_id, correo, rol_id, rol_nombre, roles }
```

### 5.2 Flujo Azure AD (ms365)

```
1. GET /api/auth/ms365
       ↓ redirige a
2. https://login.microsoftonline.com/<tenant>/oauth2/v2.0/authorize
       ↓ callback
3. GET /api/auth/ms365/callback?code=...
   - Intercambiar code por access_token (Graph API)
   - GET https://graph.microsoft.com/v1.0/me
   - Crear/buscar usuario con auth_tipo='ms365', external_id=mail
       ↓
4. Igual que login local → genera JWT
```

### 5.3 Variables de entorno requeridas

```bash
JWT_SECRET=<secret-seguro>
JWT_EXPIRES_IN=8h
AZURE_AD_CLIENT_ID=<app-id>
AZURE_AD_TENANT_ID=<tenant-id>
AZURE_AD_REDIRECT_URI=http://localhost:3000/auth/ms365/callback
```

---

## 6. Sistema de permisos granulares

### 6.1 Dos modelos coexisten

| Modelo | Tablas | Middleware | Estado |
|--------|--------|-----------|--------|
| Fase 1 (legado) | `permisos`, `rol_permiso` | `autorizar(['portal.admin'])` | Sin uso activo — tablas conservadas para compatibilidad |
| Fase 2 (actual) | `modulo_opciones`, `rol_opcion_permisos` | `verificarPermiso('modulo','Opcion','tipo')` | Único sistema en uso — todas las rutas migradas |

### 6.2 Lógica de verificarPermiso

```js
function verificarPermiso(modulo, opcion, tipo) {
  return async (req, res, next) => {
    // super_admin siempre pasa
    if (req.user.rol_nombre === 'super_admin') return next();

    // Si piden 'consulta', aceptan 'consulta' O 'edicion'
    const tiposAceptados = tipo === 'consulta'
      ? ['consulta', 'edicion']
      : ['edicion'];

    const resultado = await pool.query(`
      SELECT 1
      FROM rol_opcion_permisos rop
      JOIN modulo_opciones mo ON mo.id = rop.opcion_id
      JOIN modulos m ON m.id = mo.modulo_id
      WHERE rop.rol_id = $1
        AND m.nombre   = $2
        AND mo.nombre  = $3
        AND rop.tipo   = ANY($4::text[])
      LIMIT 1
    `, [req.user.rol_id, modulo, opcion, tiposAceptados]);

    if (!resultado.rows.length) return res.status(403).json({ ... });
    next();
  };
}
```

### 6.3 Matriz de permisos por rol

| Rol | portal | tickets | rh | auditoria |
|-----|--------|---------|-----|-----------|
| super_admin | Todo | Todo | Todo | Todo |
| portal_admin | consulta+edicion | — | — | — |
| tickets_admin | — | consulta+edicion | — | — |
| tickets_tecnico | — | Tickets/Adjuntos: edicion; Encuestas/Categorias: consulta | — | — |
| rh_admin | — | — | consulta+edicion | — |
| rh_empleado | — | — | Permisos: edicion; Recibos: consulta | — |
| auditoria_viewer | — | — | — | Logs: consulta |

---

## 7. Sistema de auditoría

### 7.1 Cómo funciona

El middleware intercepta `res.json()` **después** de que el controlador finaliza. Nunca bloquea la respuesta principal; los errores de auditoría se loguean pero no propagan.

```
Request → authenticateJWT → verificarPermiso → auditoriaMiddleware → Controller
                                                       ↑
                                              Sobrescribe res.json()
                                              Cuando Controller llama res.json():
                                                1. Extrae usuario_id de req.user
                                                2. Registra en tabla auditoria (async)
                                                3. Llama al res.json() original
```

### 7.2 Dos variantes del middleware

```js
// Para INSERT — toma req.body como valores_nuevos
auditoriaMiddleware('portal', 'noticias', 'INSERT')

// Para UPDATE/DELETE — el controlador carga req.valores_previos antes de res.json()
auditoriaConValoresPrevios('rh', 'empleados', 'UPDATE')
// En el controller:
//   const previo = await Empleado.obtenerPorId(id);
//   req.valores_previos = previo;
//   ... actualizar ...
//   res.json(actualizado);
```

### 7.3 Campos registrados por acción

| Campo | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|
| valores_previos | null | snapshot anterior | snapshot anterior |
| valores_nuevos | req.body | req.body | null |
| registro_id | respuesta.id o req.params.id | req.params.id | req.params.id |

### 7.4 API de consulta

```
GET /api/auditoria
  ?modulo=portal&tabla=noticias&accion=INSERT
  &usuario_id=5&fecha_desde=2026-01-01&fecha_hasta=2026-12-31
  &pagina=1&limite=20
```

Requiere: `verificarPermiso('auditoria','Logs','consulta')`

---

## 8. Frontend React

### 8.1 Estructura

```
modules/portal/frontend/
├── main.jsx               # Entry point — React Router + ProveedorAuth
├── App.jsx
├── context/
│   └── AuthContext.jsx    # useState(usuario) + localStorage(token)
├── utils/
│   └── api.js             # fetch wrapper — agrega Bearer token
├── services/
│   ├── auth.service.js
│   ├── modulos.service.js
│   └── noticias.service.js
├── pages/
│   ├── PortalLogin.jsx
│   ├── PortalHome.jsx
│   ├── PortalNoticias.jsx
│   ├── PortalAdminUsuarios.jsx
│   ├── PortalAdminRoles.jsx
│   └── ...
└── styles/globales.css
```

### 8.2 Protección de rutas

```jsx
// Requiere sesión activa
<Route path="/rh" element={
  <RutaProtegida>
    <RHDashboard />
  </RutaProtegida>
} />

// RutaProtegida: si !usuario → <Navigate to="/inicio-sesion" />
// Si usuario.requiere_cambio_password → <Navigate to="/cambiar-password" />
```

### 8.3 Cliente HTTP (api.js)

```js
const API_URL = import.meta.env.VITE_API_URL; // http://localhost:4000/api

export async function solicitar(ruta, opciones = {}) {
  const token = localStorage.getItem('token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...opciones.headers,
  };
  const resp = await fetch(`${API_URL}${ruta}`, {
    method: opciones.method || 'GET',
    headers,
    body: opciones.body,
  });
  const datos = await resp.json();
  if (!resp.ok) throw new Error(datos.mensaje || 'Error');
  return datos;
}
```

### 8.4 Rutas React registradas

| Path | Componente | Protegida |
|------|-----------|-----------|
| `/inicio-sesion` | PortalLogin | No |
| `/` | PortalHome | Sí |
| `/noticias` | PortalNoticias | Sí |
| `/admin/usuarios` | PortalAdminUsuarios | Sí |
| `/admin/roles` | PortalAdminRoles | Sí |
| `/admin/noticias` | PortalAdminNoticias | Sí |
| `/admin/modulos` | PortalAdminModulos | Sí |
| `/tickets` | TicketsDashboard | Sí |
| `/tickets/lista` | TicketPage | Sí |
| `/rh` | RHDashboard | Sí |
| `/rh/empleados` | EmpleadoPage | Sí |
| `/rh/perfil` | PerfilPage | Sí |
| `/auditoria` | AuditoriaDashboard | Sí |
| `/auditoria/logs` | AuditoriaPage | Sí |
| `/cambiar-password` | PortalCambiarPassword | Sí |

---

## 9. Infraestructura Docker

### 9.1 Servicios

| Servicio | Puerto | Imagen/Build |
|---------|--------|-------------|
| postgres | 5432 | postgres:16-alpine |
| backend | 4000 | Dockerfile.backend |
| frontend | 3000 (5173 interno) | Dockerfile.frontend |
| pgadmin | 5050 | dpage/pgadmin4 |

### 9.2 Inicialización de BD

`config/database/init.sql` se monta en `/docker-entrypoint-initdb.d/` de PostgreSQL. Se ejecuta automáticamente al crear el contenedor. Contiene:

1. Creación de todas las tablas
2. Inserción de roles base
3. Inserción de módulos
4. Inserción de modulo_opciones
5. Asignación de rol_opcion_permisos por rol
6. Usuarios de prueba

### 9.3 Volúmenes

```yaml
volumes:
  postgres_data_dev:    # Persistencia BD
  uploads_data:         # Archivos subidos (fotos noticias, expedientes)
```

### 9.4 Variables de entorno clave

```bash
# BD
POSTGRES_HOST=postgres
POSTGRES_PORT=5432
POSTGRES_DB=intranet_dev
POSTGRES_USER=postgres
POSTGRES_PASSWORD=dev_password_123

# JWT
JWT_SECRET=dev_secret_change_me_en_produccion
JWT_EXPIRES_IN=8h

# Frontend
VITE_API_URL=http://localhost:4000/api

# Azure AD (opcional)
AZURE_AD_CLIENT_ID=
AZURE_AD_TENANT_ID=
```

---

## 10. Puntos de extensión para nuevos módulos

### 10.1 Checklist de instalación

Para agregar un módulo `<nombre>` siguiendo el patrón establecido:

**Estructura de archivos:**
- [ ] `modules/<nombre>/backend/config/database.js` — Pool PostgreSQL con env vars
- [ ] `modules/<nombre>/backend/models/<nombre>.model.js`
- [ ] `modules/<nombre>/backend/services/<nombre>.service.js`
- [ ] `modules/<nombre>/backend/controllers/<nombre>.controller.js`
- [ ] `modules/<nombre>/backend/routes/<nombre>.routes.js`
- [ ] `modules/<nombre>/backend/migrations/001_crear_tabla_<nombre>.sql`
- [ ] `modules/<nombre>/backend/package.json`
- [ ] `modules/<nombre>/frontend/pages/`

**Integración backend:**
- [ ] Agregar rutas en `modules/portal/backend/app.js`
- [ ] Agregar `COPY modules/<nombre>/backend/package.json` en `Dockerfile.backend`

**Base de datos:**
- [ ] Crear tablas del módulo en `config/database/init.sql`
- [ ] Insertar en tabla `modulos` con `nombre` y `path_reactivo`
- [ ] Insertar opciones en `modulo_opciones` (al menos una por tipo de acción)
- [ ] Asignar permisos en `rol_opcion_permisos` para los roles relevantes

**Permisos en rutas:**
- [ ] `router.use(authenticateJWT)` en todas las rutas
- [ ] `verificarPermiso('<nombre>', '<Opcion>', 'consulta')` en GETs
- [ ] `verificarPermiso('<nombre>', '<Opcion>', 'edicion')` en POST/PUT/DELETE

**Auditoría:**
- [ ] `auditoriaMiddleware('<nombre>', '<tabla>', 'INSERT')` en rutas POST
- [ ] `auditoriaConValoresPrevios('<nombre>', '<tabla>', 'UPDATE')` en rutas PUT
- [ ] `auditoriaConValoresPrevios('<nombre>', '<tabla>', 'DELETE')` en rutas DELETE

**Docker:**
- [ ] Agregar volumen frontend en `docker-compose.dev.yml`

**Frontend:**
- [ ] Agregar rutas en `main.jsx` dentro de `<RutaProtegida>`
- [ ] Importar páginas del módulo

### 10.2 Plantilla de rutas

```js
// modules/<nombre>/backend/routes/<nombre>.routes.js
const { Router } = require('express');
const { authenticateJWT } = require('../../../portal/backend/middleware/auth.middleware');
const { verificarPermiso } = require('../../../portal/backend/middleware/permisos.middleware');
const { auditoriaMiddleware, auditoriaConValoresPrevios } =
  require('../../../auditoria/backend/middleware/auditoria.middleware');
const controller = require('../controllers/<nombre>.controller');

const router = Router();
router.use(authenticateJWT);

router.get('/',     verificarPermiso('<nombre>', 'Registros', 'consulta'), controller.listar);
router.get('/:id',  verificarPermiso('<nombre>', 'Registros', 'consulta'), controller.obtener);
router.post('/',    verificarPermiso('<nombre>', 'Registros', 'edicion'),
                    auditoriaMiddleware('<nombre>', '<tabla>', 'INSERT'), controller.crear);
router.put('/:id',  verificarPermiso('<nombre>', 'Registros', 'edicion'),
                    auditoriaConValoresPrevios('<nombre>', '<tabla>', 'UPDATE'), controller.actualizar);
router.delete('/:id', verificarPermiso('<nombre>', 'Registros', 'edicion'),
                    auditoriaConValoresPrevios('<nombre>', '<tabla>', 'DELETE'), controller.eliminar);

module.exports = router;
```

### 10.3 SQL de registro del módulo

```sql
-- 1. Registrar módulo
INSERT INTO modulos (nombre, path_reactivo, descripcion, activo)
VALUES ('<nombre>', '/<nombre>', 'Descripción del módulo', true)
ON CONFLICT (nombre) DO NOTHING;

-- 2. Registrar opciones
INSERT INTO modulo_opciones (modulo_id, nombre, descripcion, orden)
SELECT m.id, opc.nombre, opc.descripcion, opc.orden
FROM modulos m
JOIN (VALUES
  ('<nombre>', 'Registros',     'Ver/editar registros', 1),
  ('<nombre>', 'Configuracion', 'Configurar módulo',    2)
) AS opc(modulo_nombre, nombre, descripcion, orden) ON m.nombre = opc.modulo_nombre
ON CONFLICT (modulo_id, nombre) DO NOTHING;

-- 3. Asignar permisos (ejemplo: admin con todo, viewer solo consulta)
INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT r.id, mo.id, t.tipo
FROM roles r
JOIN modulos m ON m.nombre = '<nombre>'
JOIN modulo_opciones mo ON mo.modulo_id = m.id
CROSS JOIN (VALUES ('consulta'), ('edicion')) AS t(tipo)
WHERE r.nombre = '<nombre>_admin'
ON CONFLICT DO NOTHING;
```

### 10.4 Puertos disponibles

| Puerto | Módulo |
|--------|--------|
| 4000 | Portal (principal) |
| 4001 | Tickets |
| 4002 | RH |
| 4003 | Auditoría |
| **4004+** | **Nuevos módulos** |

---

## Usuarios de prueba

| Email | Contraseña | Rol |
|-------|-----------|-----|
| admin@empresa.com | Admin123! | super_admin |
| portal@empresa.com | Portal123! | portal_admin |
| rh@empresa.com | Rh123! | rh_admin |
| empleado@empresa.com | Empleado123! | rh_empleado |
| tickets@empresa.com | Tickets123! | tickets_admin |
| tecnico@empresa.com | Tecnico123! | tickets_tecnico |
| auditoria@empresa.com | Auditoria123! | auditoria_viewer |

---

*Documento generado desde el estado actual del código. Actualizar tras cambios estructurales significativos.*
