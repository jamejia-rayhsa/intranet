# PLAN DE IMPLEMENTACIÓN - INTRANET CORPORATIVA PERN

## Estado de Avance

| Etapa | Módulo             | Estado        | Archivos |
| ----- | ------------------ | ------------- | -------- |
| 0     | Auditoría + Docker | ✅ Completado | ~20      |
| 1     | Portal             | ✅ Completado | ~49      |
| 2     | Tickets            | ✅ Completado | ~30      |
| 3     | RH                 | ✅ Completado | ~31      |
| 4     | BI                 | ⏳ Pendiente  | ~22      |
| 5     | Comercial          | ⏳ Pendiente  | ~28      |

## Visión General

Este plan define 5 etapas secuenciales para construir la intranet corporativa modular usando el stack PERN (PostgreSQL, Express, React, Node) con Docker + WSL y CI/CD en GitHub Actions.

**Principios transversales a TODAS las etapas:**

- Todo código en español (variables, comentarios, mensajes de error).
- Integración obligatoria con módulo de auditoría (`SKILL.auditoria`).
- Entornos Docker: `dev`, `test`, `prod`.
- Cada módulo sigue la estructura: `backend/`, `frontend/`, `config/`, `tests/`, `README.md`.

---

## ETAPA 0: Infraestructura Base + Módulo de Auditoría

**Agente:** `docker-wsl-env` + `auditoria`

**Por qué primero:** El módulo de auditoría es transversal y todos los demás módulos dependen de él. La infraestructura Docker debe existir antes de construir cualquier módulo.

### Qué debe hacer el agente "plan" ahora mismo:

1. Definir la estructura de directorios raíz del proyecto.
2. Crear los archivos de Docker Compose para los 3 entornos.
3. Definir las variables de entorno base.
4. Establecer el flujo de CI/CD.

### Qué debe hacer el agente "build" después:

#### Archivos a generar:

```
./
├── docker-compose.dev.yml
├── docker-compose.test.yml
├── docker-compose.prod.yml
├── .env.dev
├── .env.test
├── .env.prod
├── .github/workflows/docker-build-deploy.yml
├── .gitignore
└── modules/
    └── auditoria/
        ├── backend/
        │   ├── models/
        │   │   └── auditoria.model.js
        │   ├── services/
        │   │   └── auditoria.service.js
        │   ├── middleware/
        │   │   └── auditoria.middleware.js
        │   ├── controllers/
        │   │   └── auditoria.controller.js
        │   ├── routes/
        │   │   └── auditoria.routes.js
        │   ├── config/
        │   │   └── database.js
        │   └── app.js
        ├── frontend/
        │   ├── pages/
        │   │   └── AuditoriaPage.jsx
        │   ├── components/
        │   │   ├── AuditoriaFiltros.jsx
        │   │   └── AuditoriaTabla.jsx
        │   └── routes/
        │       └── auditoria.routes.js
        ├── config/
        │   └── auditoria.config.js
        ├── tests/
        │   ├── auditoria.service.test.js
        │   └── auditoria.middleware.test.js
        └── README.md
```

#### Dependencias:

- **Ninguna** (es la base de todo).

#### SQL a ejecutar:

```sql
-- Tabla de auditoría (se crea primero porque todos la necesitan)
CREATE TABLE auditoria (
  id SERIAL PRIMARY KEY,
  usuario_id INT NOT NULL, -- FK pendiente hasta que exista usuarios
  modulo VARCHAR(100) NOT NULL,
  tabla VARCHAR(100) NOT NULL,
  registro_id VARCHAR(100) NOT NULL,
  accion VARCHAR(20) NOT NULL,
  valores_previos JSONB,
  valores_nuevos JSONB,
  ip_origen VARCHAR(45),
  user_agent TEXT,
  fecha TIMESTAMP DEFAULT NOW()
);
```

---

## ETAPA 1: Portal Central

**Agente:** `portal`

**Objetivo:** Construir el módulo central que gestiona autenticación (MS365 + local), roles, permisos, módulos y portal de noticias.

### Qué debe hacer el agente "plan" ahora mismo:

1. Definir los endpoints exactos del backend.
2. Definir las páginas y componentes del frontend.
3. Mapear permisos y roles iniciales.
4. Planificar la integración con auditoría.

### Qué debe hacer el agente "build" después:

#### Archivos a generar:

```
./modules/portal/
├── backend/
│   ├── models/
│   │   ├── usuario.model.js
│   │   ├── rol.model.js
│   │   ├── permiso.model.js
│   │   ├── rolPermiso.model.js
│   │   ├── usuarioRol.model.js
│   │   ├── modulo.model.js
│   │   └── noticia.model.js
│   ├── controllers/
│   │   ├── auth.controller.js
│   │   ├── modulo.controller.js
│   │   ├── permiso.controller.js
│   │   ├── rol.controller.js
│   │   └── noticia.controller.js
│   ├── services/
│   │   ├── auth.service.js
│   │   ├── ms365.service.js
│   │   ├── jwt.service.js
│   │   └── correo.service.js
│   ├── middleware/
│   │   ├── auth.middleware.js
│   │   └── permisos.middleware.js
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── modulos.routes.js
│   │   ├── permisos.routes.js
│   │   ├── roles.routes.js
│   │   └── noticias.routes.js
│   ├── config/
│   │   └── database.js
│   ├── migrations/
│   │   └── 001-crear-tablas-portal.sql
│   ├── seeds/
│   │   └── 001-semilla-inicial.sql
│   └── app.js
├── frontend/
│   ├── pages/
│   │   ├── PortalHome.jsx
│   │   ├── PortalNoticias.jsx
│   │   ├── Login.jsx
│   │   ├── LoginMS365.jsx
│   │   ├── ModulosAdmin.jsx
│   │   ├── RolesAdmin.jsx
│   │   └── PermisosAdmin.jsx
│   ├── components/
│   │   ├── MenuDinamico.jsx
│   │   ├── NoticiaCard.jsx
│   │   ├── NoticiaGrid.jsx
│   │   ├── NewsEditorModal.jsx
│   │   ├── RolForm.jsx
│   │   ├── PermisoAsignador.jsx
│   │   └── ProtectedRoute.jsx
│   ├── services/
│   │   ├── auth.service.js
│   │   ├── noticias.service.js
│   │   └── modulos.service.js
│   ├── context/
│   │   └── AuthContext.jsx
│   ├── routes/
│   │   └── portal.routes.js
│   └── App.jsx
├── config/
│   └── portal.permisos.js
├── tests/
│   ├── auth.controller.test.js
│   ├── permisos.middleware.test.js
│   ├── noticia.controller.test.js
│   ├── auth.integration.test.js
│   └── noticias.integration.test.js
└── README.md
```

#### SQL a ejecutar:

```sql
CREATE TABLE usuarios (
  id SERIAL PRIMARY KEY,
  correo VARCHAR(255) UNIQUE NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100),
  auth_tipo VARCHAR(20) NOT NULL DEFAULT 'local',
  external_id VARCHAR(100),
  hash_password TEXT,
  activo BOOLEAN DEFAULT true,
  fecha_creacion TIMESTAMP DEFAULT NOW()
);

CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL
);

CREATE TABLE permisos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL
);

CREATE TABLE rol_permiso (
  rol_id INT REFERENCES roles(id),
  permiso_id INT REFERENCES permisos(id),
  PRIMARY KEY (rol_id, permiso_id)
);

CREATE TABLE usuario_rol (
  usuario_id INT REFERENCES usuarios(id),
  rol_id INT REFERENCES roles(id),
  PRIMARY KEY (usuario_id, rol_id)
);

CREATE TABLE modulos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  path_reactivo VARCHAR(150),
  descripcion TEXT,
  activo BOOLEAN DEFAULT true
);

CREATE TABLE noticias (
  id SERIAL PRIMARY KEY,
  titulo VARCHAR(255) NOT NULL,
  subtitulo TEXT,
  contenido TEXT,
  tipo VARCHAR(30),
  fecha_publicacion DATE,
  publicada BOOLEAN DEFAULT false,
  autor_id INT REFERENCES usuarios(id),
  fecha_creacion TIMESTAMP DEFAULT NOW(),
  fecha_actualizacion TIMESTAMP
);

-- FK de auditoria hacia usuarios (ahora sí existe)
ALTER TABLE auditoria ADD CONSTRAINT fk_auditoria_usuario
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id);
```

#### Permisos iniciales:

| Permiso              | Descripción                     |
| -------------------- | ------------------------------- |
| `portal.admin`       | Administración total del portal |
| `portal.view`        | Ver portal y noticias           |
| `rh.admin`           | Administración de RRHH          |
| `tickets.view`       | Ver tickets                     |
| `tickets.admin`      | Administrar tickets             |
| `tickets.technician` | Rol de técnico                  |
| `bi.view`            | Ver dashboards BI               |
| `bi.admin`           | Administrar dashboards BI       |
| `comercial.view`     | Ver cotizaciones                |
| `comercial.admin`    | Administrar cotizaciones        |
| `auditoria.view`     | Ver logs de auditoría           |

#### Semilla inicial:

```sql
-- Roles base
INSERT INTO roles (nombre) VALUES ('superadmin'), ('portal.admin'), ('rh.admin'), ('tecnico'), ('empleado'), ('comercial'), ('bi_viewer');

-- Permisos base
INSERT INTO permisos (nombre) VALUES ('portal.admin'), ('portal.view'), ('rh.admin'), ('tickets.view'), ('tickets.admin'), ('tickets.technician'), ('bi.view'), ('bi.admin'), ('comercial.view'), ('comercial.admin'), ('auditoria.view');

-- Módulos registrados
INSERT INTO modulos (nombre, path_reactivo, descripcion, activo) VALUES
  ('portal', '/', 'Portal central', true),
  ('tickets', '/tickets', 'Soporte TI', false),
  ('rh', '/rh', 'Recursos Humanos', false),
  ('bi', '/bi', 'Business Intelligence', false),
  ('comercial', '/comercial', 'Cotizaciones', false);
```

#### Dependencias:

- **auditoria** (middleware y servicio ya deben existir).
- Infraestructura Docker (PostgreSQL corriendo).

---

## ETAPA 2: Módulo de Tickets de Soporte TI

**Agente:** `tickets`

**Objetivo:** Construir el módulo de tickets con CRUD, adjuntos, encuestas de satisfacción y notificaciones por email.

### Qué debe hacer el agente "plan" ahora mismo:

1. Definir endpoints del backend de tickets.
2. Definir componentes del frontend.
3. Planificar el servicio de notificaciones por email.
4. Mapear integración con auditoría.

### Qué debe hacer el agente "build" después:

#### Archivos a generar:

```
./modules/tickets/
├── backend/
│   ├── models/
│   │   ├── ticket.model.js
│   │   ├── ticketAdjunto.model.js
│   │   └── ticketEncuesta.model.js
│   ├── controllers/
│   │   ├── ticket.controller.js
│   │   ├── adjunto.controller.js
│   │   └── encuesta.controller.js
│   ├── services/
│   │   ├── notificacion.service.js
│   │   └── archivo.service.js
│   ├── middleware/
│   │   └── upload.middleware.js
│   ├── routes/
│   │   ├── tickets.routes.js
│   │   └── adjuntos.routes.js
│   ├── config/
│   │   └── database.js
│   ├── migrations/
│   │   └── 001-crear-tablas-tickets.sql
│   └── app.js
├── frontend/
│   ├── pages/
│   │   ├── TicketPage.jsx
│   │   └── TicketDetail.jsx
│   ├── components/
│   │   ├── TicketForm.jsx
│   │   ├── TicketList.jsx
│   │   ├── TicketFiltros.jsx
│   │   ├── AdjuntosUploader.jsx
│   │   └── SatisfactionSurvey.jsx
│   ├── services/
│   │   └── tickets.service.js
│   └── routes/
│       └── tickets.routes.js
├── config/
│   └── tickets.permisos.js
├── tests/
│   ├── ticket.controller.test.js
│   ├── adjunto.controller.test.js
│   └── tickets.integration.test.js
└── README.md
```

#### SQL a ejecutar:

```sql
CREATE TABLE tickets (
  id SERIAL PRIMARY KEY,
  usuario_id INT REFERENCES usuarios(id),
  titulo VARCHAR(255) NOT NULL,
  descripcion TEXT,
  nivel_atencion VARCHAR(20) NOT NULL,
  estado VARCHAR(20) NOT NULL DEFAULT 'abierto',
  categoria VARCHAR(50),
  fecha_creacion TIMESTAMP DEFAULT NOW(),
  fecha_cierre TIMESTAMP,
  tecnico_asignado_id INT REFERENCES usuarios(id)
);

CREATE TABLE ticket_adjuntos (
  id SERIAL PRIMARY KEY,
  ticket_id INT REFERENCES tickets(id),
  nombre_archivo VARCHAR(255),
  tipo_mime VARCHAR(100),
  ruta_archivo VARCHAR(500)
);

CREATE TABLE ticket_encuestas (
  id SERIAL PRIMARY KEY,
  ticket_id INT REFERENCES tickets(id),
  calificacion INT NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
  comentarios TEXT,
  fecha TIMESTAMP DEFAULT NOW()
);
```

#### Puntos de auditoría:

| Acción           | Tabla              | Acción |
| ---------------- | ------------------ | ------ |
| Crear ticket     | `tickets`          | INSERT |
| Cambiar estado   | `tickets`          | UPDATE |
| Asignar técnico  | `tickets`          | UPDATE |
| Subir adjunto    | `ticket_adjuntos`  | INSERT |
| Eliminar adjunto | `ticket_adjuntos`  | DELETE |
| Enviar encuesta  | `ticket_encuestas` | INSERT |

#### Dependencias:

- **portal** (autenticación, tabla `usuarios`, permisos `tickets.view`, `tickets.admin`, `tickets.technician`).
- **auditoria** (middleware de auditoría).

---

## ETAPA 3: Módulo de Recursos Humanos

**Agente:** `rh`

**Objetivo:** Construir el módulo de RH con gestión de empleados, expedientes, permisos/ausencias, recibos de nómina e integración con noticias del portal.

### Qué debe hacer el agente "plan" ahora mismo:

1. Definir endpoints del backend de RH.
2. Definir componentes del frontend.
3. Planificar la integración con el portal de noticias.
4. Mapear integración con auditoría.

### Qué debe hacer el agente "build" después:

#### Archivos a generar:

```
./modules/rh/
├── backend/
│   ├── models/
│   │   ├── empleado.model.js
│   │   ├── expedienteDocumento.model.js
│   │   ├── permisoAusencia.model.js
│   │   └── reciboNomina.model.js
│   ├── controllers/
│   │   ├── empleado.controller.js
│   │   ├── expediente.controller.js
│   │   ├── permisos.controller.js
│   │   └── reciboNomina.controller.js
│   ├── services/
│   │   ├── archivo.service.js
│   │   └── notificacion.service.js
│   ├── middleware/
│   │   └── upload.middleware.js
│   ├── routes/
│   │   ├── empleados.routes.js
│   │   ├── expediente.routes.js
│   │   ├── permisos.routes.js
│   │   └── recibos.routes.js
│   ├── config/
│   │   └── database.js
│   ├── migrations/
│   │   └── 001-crear-tablas-rh.sql
│   └── app.js
├── frontend/
│   ├── pages/
│   │   ├── EmpleadoPage.jsx
│   │   ├── RHAdminPage.jsx
│   │   └── PerfilPage.jsx
│   ├── components/
│   │   ├── EmpleadoProfileCard.jsx
│   │   ├── ExpedienteUpload.jsx
│   │   ├── PermisosForm.jsx
│   │   ├── PermisosList.jsx
│   │   └── RecibosNominaList.jsx
│   ├── services/
│   │   ├── empleados.service.js
│   │   ├── permisos.service.js
│   │   └── recibos.service.js
│   └── routes/
│       └── rh.routes.js
├── config/
│   └── rh.permisos.js
├── tests/
│   ├── empleado.controller.test.js
│   ├── permisos.controller.test.js
│   ├── expediente.integration.test.js
│   └── rh.integration.test.js
└── README.md
```

#### SQL a ejecutar:

```sql
CREATE TABLE empleados (
  id SERIAL PRIMARY KEY,
  usuario_id INT REFERENCES usuarios(id),
  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100) NOT NULL,
  fecha_nacimiento DATE,
  curp VARCHAR(20),
  rfc VARCHAR(20),
  puesto VARCHAR(100),
  departamento VARCHAR(100),
  fecha_ingreso DATE,
  jefe_inmediato_id INT REFERENCES empleados(id),
  estatus VARCHAR(20) NOT NULL DEFAULT 'activo',
  fecha_baja DATE,
  motivo_baja TEXT,
  fecha_creacion TIMESTAMP DEFAULT NOW(),
  fecha_actualizacion TIMESTAMP
);

CREATE TABLE expediente_documentos (
  id SERIAL PRIMARY KEY,
  empleado_id INT REFERENCES empleados(id),
  tipo_documento VARCHAR(50) NOT NULL,
  nombre_archivo VARCHAR(255) NOT NULL,
  ruta_archivo VARCHAR(500) NOT NULL,
  fecha_carga TIMESTAMP DEFAULT NOW(),
  descripcion TEXT
);

CREATE TABLE permisos_ausencias (
  id SERIAL PRIMARY KEY,
  empleado_id INT REFERENCES empleados(id),
  tipo VARCHAR(30) NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  motivo TEXT,
  estatus VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  aprobado_por_id INT REFERENCES empleados(id),
  fecha_aprobacion TIMESTAMP,
  fecha_creacion TIMESTAMP DEFAULT NOW(),
  fecha_actualizacion TIMESTAMP
);

CREATE TABLE recibos_nomina (
  id SERIAL PRIMARY KEY,
  empleado_id INT REFERENCES empleados(id),
  periodo VARCHAR(20) NOT NULL,
  fecha_pago DATE,
  importe_total DECIMAL(10,2),
  ruta_archivo VARCHAR(500),
  descripcion TEXT,
  fecha_creacion TIMESTAMP DEFAULT NOW(),
  creado_por_id INT REFERENCES usuarios(id)
);
```

#### Puntos de auditoría:

| Acción                   | Tabla                   | Acción |
| ------------------------ | ----------------------- | ------ |
| Alta de empleado         | `empleados`             | INSERT |
| Modificación de empleado | `empleados`             | UPDATE |
| Baja de empleado         | `empleados`             | UPDATE |
| Subir documento          | `expediente_documentos` | INSERT |
| Eliminar documento       | `expediente_documentos` | DELETE |
| Solicitud de permiso     | `permisos_ausencias`    | INSERT |
| Aprobar/rechazar permiso | `permisos_ausencias`    | UPDATE |
| Crear recibo             | `recibos_nomina`        | INSERT |

#### Dependencias:

- **portal** (autenticación, tabla `usuarios`, permisos `rh.admin`, integración con noticias).
- **auditoria** (middleware de auditoría).

---

## ETAPA 4: Módulo BI con Streamlit + MSSQL

**Agente:** `bi`

**Objetivo:** Construir el módulo de BI con gestión de dashboards, grupos de usuarios, y aplicaciones Streamlit conectadas a MSSQL.

### Qué debe hacer el agente "plan" ahora mismo:

1. Definir endpoints del backend PERN para dashboards y grupos.
2. Definir estructura de las apps Streamlit.
3. Planificar la conexión segura a MSSQL.
4. Mapear integración con auditoría.

### Qué debe hacer el agente "build" después:

#### Archivos a generar:

```
./modules/bi/
├── backend/
│   ├── models/
│   │   ├── dashboard.model.js
│   │   ├── grupo.model.js
│   │   ├── dashboardGrupo.model.js
│   │   └── grupoUsuario.model.js
│   ├── controllers/
│   │   ├── dashboard.controller.js
│   │   └── grupo.controller.js
│   ├── services/
│   │   └── bi-auth.service.js
│   ├── routes/
│   │   ├── dashboards.routes.js
│   │   └── grupos.routes.js
│   ├── config/
│   │   └── database.js
│   ├── migrations/
│   │   └── 001-crear-tablas-bi.sql
│   └── app.js
├── frontend/
│   ├── pages/
│   │   ├── BiDashboardList.jsx
│   │   └── BiDashboardViewer.jsx
│   ├── components/
│   │   ├── DashboardCard.jsx
│   │   └── GrupoAsignador.jsx
│   ├── services/
│   │   └── bi.service.js
│   └── routes/
│       └── bi.routes.js
├── config/
│   └── bi.permisos.js
├── tests/
│   ├── dashboard.controller.test.js
│   └── bi.integration.test.js
└── README.md

./bi-streamlit/
├── Dockerfile
├── requirements.txt
├── app.py
└── dashboards/
    └── ventas/
        └── app.py
```

#### SQL a ejecutar (PostgreSQL):

```sql
CREATE TABLE dashboards (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  url_relativa VARCHAR(200),
  activo BOOLEAN DEFAULT true
);

CREATE TABLE grupos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL
);

CREATE TABLE dashboard_grupos (
  dashboard_id INT REFERENCES dashboards(id),
  grupo_id INT REFERENCES grupos(id),
  PRIMARY KEY (dashboard_id, grupo_id)
);

CREATE TABLE grupo_usuarios (
  grupo_id INT REFERENCES grupos(id),
  usuario_id INT REFERENCES usuarios(id),
  PRIMARY KEY (grupo_id, usuario_id)
);
```

#### Puntos de auditoría:

| Acción                  | Tabla            | Acción |
| ----------------------- | ---------------- | ------ |
| Crear dashboard         | `dashboards`     | INSERT |
| Modificar dashboard     | `dashboards`     | UPDATE |
| Acceso a dashboard      | `dashboards`     | VIEW   |
| Crear grupo             | `grupos`         | INSERT |
| Asignar usuario a grupo | `grupo_usuarios` | INSERT |

#### Dependencias:

- **portal** (autenticación, tabla `usuarios`, permisos `bi.view`, `bi.admin`).
- **auditoria** (middleware de auditoría).
- MSSQL corriendo en Docker (servicio `mssql` en docker-compose).

---

## ETAPA 5: Módulo Comercial (Cotizaciones y Listas de Precios)

**Agente:** `comercial`

**Objetivo:** Construir el módulo comercial con gestión de proveedores, productos, listas de precios (carga Excel/CSV), cotizaciones y exportación.

### Qué debe hacer el agente "plan" ahora mismo:

1. Definir endpoints del backend comercial.
2. Definir componentes del frontend.
3. Planificar el servicio de carga de archivos Excel/CSV.
4. Mapear integración con auditoría.

### Qué debe hacer el agente "build" después:

#### Archivos a generar:

```
./modules/comercial/
├── backend/
│   ├── models/
│   │   ├── proveedor.model.js
│   │   ├── producto.model.js
│   │   ├── listaPrecios.model.js
│   │   ├── listaPreciosDetalle.model.js
│   │   ├── cotizacion.model.js
│   │   └── cotizacionDetalle.model.js
│   ├── controllers/
│   │   ├── proveedor.controller.js
│   │   ├── producto.controller.js
│   │   ├── listaPrecios.controller.js
│   │   └── cotizacion.controller.js
│   ├── services/
│   │   ├── precio.service.js
│   │   ├── archivo.service.js
│   │   └── exportacion.service.js
│   ├── middleware/
│   │   └── upload.middleware.js
│   ├── routes/
│   │   ├── proveedores.routes.js
│   │   ├── productos.routes.js
│   │   ├── listas-precios.routes.js
│   │   └── cotizaciones.routes.js
│   ├── config/
│   │   └── database.js
│   ├── migrations/
│   │   └── 001-crear-tablas-comercial.sql
│   └── app.js
├── frontend/
│   ├── pages/
│   │   ├── ListaPreciosPage.jsx
│   │   └── CotizacionPage.jsx
│   ├── components/
│   │   ├── PrecioList.jsx
│   │   ├── ListaPreciosUploader.jsx
│   │   ├── CotizacionForm.jsx
│   │   ├── CotizacionList.jsx
│   │   └── CotizacionExport.jsx
│   ├── services/
│   │   ├── precios.service.js
│   │   └── cotizaciones.service.js
│   └── routes/
│       └── comercial.routes.js
├── config/
│   └── comercial.permisos.js
├── tests/
│   ├── cotizacion.controller.test.js
│   ├── listaPrecios.integration.test.js
│   └── comercial.integration.test.js
└── README.md
```

#### SQL a ejecutar:

```sql
CREATE TABLE proveedores (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  contacto VARCHAR(100),
  telefono VARCHAR(50)
);

CREATE TABLE productos (
  id SERIAL PRIMARY KEY,
  proveedor_id INT REFERENCES proveedores(id),
  codigo_proveedor VARCHAR(100),
  descripcion VARCHAR(255),
  categoria VARCHAR(50)
);

CREATE TABLE listas_precios (
  id SERIAL PRIMARY KEY,
  proveedor_id INT REFERENCES proveedores(id),
  fecha_inicio DATE,
  fecha_fin DATE,
  activa BOOLEAN DEFAULT false
);

CREATE TABLE lista_precios_detalle (
  id SERIAL PRIMARY KEY,
  lista_id INT REFERENCES listas_precios(id),
  producto_id INT REFERENCES productos(id),
  precio_unitario DECIMAL(10,2),
  moneda VARCHAR(3)
);

CREATE TABLE cotizaciones (
  id SERIAL PRIMARY KEY,
  numero_cotizacion VARCHAR(50),
  cliente_nombre VARCHAR(255),
  fecha DATE,
  vendedor_id INT REFERENCES usuarios(id),
  estatus VARCHAR(20)
);

CREATE TABLE cotizacion_detalle (
  id SERIAL PRIMARY KEY,
  cotizacion_id INT REFERENCES cotizaciones(id),
  producto_id INT REFERENCES productos(id),
  cantidad INT,
  precio_unitario DECIMAL(10,2),
  importe DECIMAL(12,2)
);
```

#### Puntos de auditoría:

| Acción                     | Tabla                   | Acción        |
| -------------------------- | ----------------------- | ------------- |
| Crear/modificar lista      | `listas_precios`        | INSERT/UPDATE |
| Actualizar detalle         | `lista_precios_detalle` | INSERT/UPDATE |
| Carga masiva desde archivo | `lista_precios_detalle` | INSERT        |
| Crear cotización           | `cotizaciones`          | INSERT        |
| Modificar cotización       | `cotizaciones`          | UPDATE        |
| Detalle de cotización      | `cotizacion_detalle`    | INSERT/UPDATE |

#### Dependencias:

- **portal** (autenticación, tabla `usuarios`, permisos `comercial.view`, `comercial.admin`).
- **auditoria** (middleware de auditoría).

---

## MAPA DE DEPENDENCIAS ENTRE MÓDULOS

```
Etapa 0: auditoria + docker-wsl-env
                │
                ▼
Etapa 1: portal (auth, roles, permisos, noticias)
         │       │       │
    ┌────┘       │       └────┐
    ▼            ▼            ▼
Etapa 2:    Etapa 3:      Etapa 4:    Etapa 5:
tickets     rh            bi          comercial
```

**Regla de oro:** No se construye ningún módulo sin que `auditoria` y `portal` estén completos y probados.

---

## CÓMO PASAR DE "PLAN" A "BUILD"

### Paso 1: Confirmar el plan

Revisar este documento con el equipo y confirmar que el orden, las dependencias y los archivos son correctos.

### Paso 2: Ejecutar Etapa 0 (Infraestructura + Auditoría)

```
@agent docker-wsl-env: Genera docker-compose, .env, CI/CD
@agent auditoria: Genera backend + frontend del módulo de auditoría
```

### Paso 3: Ejecutar Etapa 1 (Portal)

```
@agent portal: Genera backend + frontend del módulo portal
```

### Paso 4: Ejecutar Etapa 2 (Tickets)

```
@agent tickets: Genera backend + frontend del módulo tickets
```

### Paso 5: Ejecutar Etapa 3 (RH)

```
@agent rh: Genera backend + frontend del módulo rh
```

### Paso 6: Ejecutar Etapa 4 (BI)

```
@agent bi: Genera backend PERN + apps Streamlit del módulo bi
```

### Paso 7: Ejecutar Etapa 5 (Comercial)

```
@agent comercial: Genera backend + frontend del módulo comercial
```

### Validación después de cada etapa:

1. `docker compose -f docker-compose.dev.yml up` → Todo levanta sin errores.
2. `npm test` en cada módulo → Todos los tests pasan.
3. Verificar que los eventos de auditoría se registran correctamente.
4. Verificar que los permisos del portal funcionan para el nuevo módulo.

### Commit después de cada etapa:

```bash
git add .
git commit -m "Etapa X: Módulo <nombre> - descripción breve"
git push
```

---

## RESUMEN RÁPIDO

| Etapa | Módulo             | Agente                         | Dependencias | Archivos aprox. |
| ----- | ------------------ | ------------------------------ | ------------ | --------------- |
| 0     | Auditoría + Docker | `docker-wsl-env` + `auditoria` | Ninguna      | ~20             |
| 1     | Portal             | `portal`                       | Etapa 0      | ~35             |
| 2     | Tickets            | `tickets`                      | Etapa 0, 1   | ~25             |
| 3     | RH                 | `rh`                           | Etapa 0, 1   | ~28             |
| 4     | BI                 | `bi`                           | Etapa 0, 1   | ~22             |
| 5     | Comercial          | `comercial`                    | Etapa 0, 1   | ~28             |

**Total estimado:** ~158 archivos de código + configuración.
