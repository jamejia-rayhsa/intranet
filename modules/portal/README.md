# Módulo Portal

Portal central de la intranet corporativa. Gestiona la identidad con Supabase Auth (GoTrue; Microsoft como proveedor opcional), roles, permisos, módulos dinámicos y portal de noticias/comunicados.

---

## Estado

✅ **Completado** — 49 archivos

---

## Estructura

```
modules/portal/
├── backend/
│   ├── config/
│   │   └── database.js                     # Pool centralizado PostgreSQL
│   ├── models/
│   │   ├── usuario.model.js                # CRUD usuarios
│   │   ├── rol.model.js                    # CRUD roles + permisos
│   │   ├── permiso.model.js                # CRUD permisos
│   │   ├── rolPermiso.model.js             # Relación rol-permiso
│   │   ├── usuarioRol.model.js             # Relación usuario-rol
│   │   ├── modulo.model.js                 # CRUD módulos
│   │   └── noticia.model.js                # CRUD noticias con paginación
│   ├── controllers/
│   │   ├── auth.controller.js              # Perfil y cambio de contraseña (login lo hace GoTrue)
│   │   ├── modulo.controller.js            # Gestión de módulos
│   │   ├── noticia.controller.js           # Gestión de noticias
│   │   ├── permiso.controller.js           # Gestión de permisos
│   │   └── rol.controller.js               # Gestión de roles
│   ├── services/
│   │   ├── supabaseAdmin.service.js        # Admin API de GoTrue (alta, contraseña, baja de cuentas)
│   │   ├── storage.service.js              # Supabase Storage (subir, URL firmada, eliminar)
│   │   └── correo.service.js               # Envío de correos (simulado en dev)
│   ├── middleware/
│   │   ├── auth.middleware.js              # authenticateJWT (token de GoTrue) + autorizar(permisos)
│   ├── routes/
│   │   ├── auth.routes.js                  # /api/auth/*
│   │   ├── modulos.routes.js               # /api/modulos/*
│   │   ├── noticias.routes.js              # /api/noticias/*
│   │   ├── permisos.routes.js              # /api/permisos/*
│   │   └── roles.routes.js                 # /api/roles/*
│   ├── migrations/
│   │   └── 001-crear-tablas-portal.sql     # Migración completa
│   ├── seeds/
│   │   └── 001-semilla-inicial.sql         # Datos iniciales
│   ├── app.js                              # Servidor Express
│   └── package.json
├── frontend/
│   ├── pages/
│   │   ├── PortalLogin.jsx                 # Login con Supabase Auth (+ botón Microsoft si VITE_MS365_LOGIN)
│   │   ├── PortalHome.jsx                  # Home con noticias, comunicados, ofertas
│   │   ├── PortalNoticias.jsx              # Listado con filtros y paginación
│   │   ├── PortalAdminModulos.jsx          # CRUD de módulos
│   │   └── PortalAdminRoles.jsx            # CRUD de roles + asignación de permisos
│   ├── components/
│   │   ├── MenuDinamico.jsx                # Menú según módulos activos
│   │   ├── NoticiaCard.jsx                 # Tarjeta de noticia
│   │   └── NewsEditorModal.jsx             # Editor de noticias
│   ├── services/
│   │   ├── auth.service.js                 # Llamadas API de auth
│   │   ├── modulos.service.js              # Llamadas API de módulos
│   │   └── noticias.service.js             # Llamadas API de noticias
│   ├── context/
│   │   └── AuthContext.jsx                 # Contexto de autenticación
│   ├── routes/
│   │   └── portal.routes.js                # Rutas React
│   ├── utils/
│   │   └── api.js                          # Función solicitar() con el token de Supabase
│   ├── App.jsx                             # Componente raíz con rutas
│   ├── main.jsx                            # Punto de entrada
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── config/
│   └── portal.permisos.js                  # Definición de permisos del portal
├── tests/
│   ├── auth.controller.test.js             # Tests unitarios de auth
│   ├── permisos.middleware.test.js         # Tests de middleware de permisos
│   ├── noticia.controller.test.js          # Tests de modelo noticias
│   ├── auth.integration.test.js            # Tests de integración auth
│   └── noticias.integration.test.js        # Tests de integración noticias
└── README.md
```

---

## Endpoints

### Autenticación

El login, el cierre de sesión y el refresco de token los resuelve el frontend directamente contra GoTrue (`/auth/v1`, mismo origen). **No hay registro público**: las cuentas las crea un administrador desde el portal (`/admin/usuarios`).

| Método | Ruta                        | Descripción                          | Autenticación |
| ------ | --------------------------- | ------------------------------------ | ------------- |
| GET    | `/api/auth/perfil`          | Perfil del usuario (sin hash)        | Token GoTrue  |
| POST   | `/api/auth/cambiar-password`| Cambiar contraseña (actualiza GoTrue)| Token GoTrue  |

### Módulos

| Método | Ruta                   | Descripción              | Permisos     |
| ------ | ---------------------- | ------------------------ | ------------ |
| GET    | `/api/modulos`         | Listar todos los módulos | portal.admin |
| GET    | `/api/modulos/activos` | Listar módulos activos   | Pública      |
| GET    | `/api/modulos/:id`     | Detalle de módulo        | portal.admin |
| POST   | `/api/modulos`         | Crear módulo             | portal.admin |
| PUT    | `/api/modulos/:id`     | Actualizar módulo        | portal.admin |
| DELETE | `/api/modulos/:id`     | Eliminar módulo          | portal.admin |

### Roles

| Método | Ruta                      | Descripción                 | Permisos     |
| ------ | ------------------------- | --------------------------- | ------------ |
| GET    | `/api/roles`              | Listar roles                | portal.admin |
| GET    | `/api/roles/:id`          | Detalle de rol con permisos | portal.admin |
| POST   | `/api/roles`              | Crear rol                   | portal.admin |
| PUT    | `/api/roles/:id`          | Actualizar rol              | portal.admin |
| PUT    | `/api/roles/:id/permisos` | Asignar permisos a rol      | portal.admin |
| DELETE | `/api/roles/:id`          | Eliminar rol                | portal.admin |

### Permisos

| Método | Ruta                | Descripción        | Permisos     |
| ------ | ------------------- | ------------------ | ------------ |
| GET    | `/api/permisos`     | Listar permisos    | portal.admin |
| POST   | `/api/permisos`     | Crear permiso      | portal.admin |
| PUT    | `/api/permisos/:id` | Actualizar permiso | portal.admin |
| DELETE | `/api/permisos/:id` | Eliminar permiso   | portal.admin |

### Noticias

| Método | Ruta                       | Descripción                          | Permisos               |
| ------ | -------------------------- | ------------------------------------ | ---------------------- |
| GET    | `/api/noticias/publicadas` | Noticias publicadas (con paginación) | Pública                |
| GET    | `/api/noticias`            | Todas las noticias (admin)           | portal.admin           |
| GET    | `/api/noticias/:id`        | Detalle de noticia                   | Pública                |
| POST   | `/api/noticias`            | Crear noticia                        | portal.admin, rh.admin |
| PUT    | `/api/noticias/:id`        | Actualizar noticia                   | portal.admin, rh.admin |
| DELETE | `/api/noticias/:id`        | Eliminar noticia                     | portal.admin           |

---

## Esquema de Base de Datos

### Tablas del Portal

```
usuarios
├── id (SERIAL PK)
├── correo (VARCHAR UNIQUE)
├── nombre (VARCHAR)
├── apellido (VARCHAR)
├── auth_tipo (local|ms365)
├── auth_uid (UUID de auth.users en GoTrue)
├── external_id (Azure AD ID)
├── hash_password (TEXT, en desuso: las contraseñas viven en GoTrue)
├── activo (BOOLEAN)
└── fecha_creacion (TIMESTAMP)

roles
├── id (SERIAL PK)
└── nombre (VARCHAR UNIQUE)

permisos
├── id (SERIAL PK)
└── nombre (VARCHAR UNIQUE)

rol_permiso
├── rol_id (FK → roles)
└── permiso_id (FK → permisos)

usuario_rol
├── usuario_id (FK → usuarios)
└── rol_id (FK → roles)

modulos
├── id (SERIAL PK)
├── nombre (VARCHAR UNIQUE)
├── path_reactivo (VARCHAR)
├── descripcion (TEXT)
└── activo (BOOLEAN)

noticias
├── id (SERIAL PK)
├── titulo (VARCHAR)
├── subtitulo (TEXT)
├── contenido (TEXT)
├── tipo (noticia|comunicado|oferta_empleo)
├── fecha_publicacion (DATE)
├── publicada (BOOLEAN)
├── autor_id (FK → usuarios)
├── fecha_creacion (TIMESTAMP)
└── fecha_actualizacion (TIMESTAMP)
```

---

## Roles y Permisos Iniciales

### Roles Seed

| Rol                | Descripción                                       |
| ------------------ | ------------------------------------------------- |
| `super_admin`      | Acceso total a todos los módulos                  |
| `portal_admin`     | Administración del portal y noticias              |
| `rh_admin`         | Administración de recursos humanos                |
| `rh_empleado`      | Empleado normal (ve su perfil, solicita permisos) |
| `tickets_admin`    | Administración de tickets                         |
| `tickets_tecnico`  | Técnico de soporte                                |
| `bi_admin`         | Administración de dashboards BI                   |
| `bi_viewer`        | Solo visualización de dashboards                  |
| `comercial_admin`  | Administración de cotizaciones                    |
| `auditoria_viewer` | Visualización de logs de auditoría                |

### Permisos Seed

| Permiso                 | Descripción               |
| ----------------------- | ------------------------- |
| `portal.view`           | Ver portal                |
| `portal.admin`          | Administrar portal        |
| `portal.crear-noticias` | Crear/editar noticias     |
| `rh.view`               | Ver datos de RH           |
| `rh.admin`              | Administrar RH            |
| `rh.gestionar-permisos` | Aprobar/rechazar permisos |
| `rh.ver-recibos`        | Ver recibos de nómina     |
| `tickets.view`          | Ver tickets               |
| `tickets.create`        | Crear tickets             |
| `tickets.admin`         | Administrar tickets       |
| `tickets.technician`    | Rol de técnico            |
| `bi.view`               | Ver dashboards            |
| `bi.admin`              | Administrar dashboards    |
| `bi.gestionar-grupos`   | Gestionar grupos BI       |
| `comercial.view`        | Ver cotizaciones          |
| `comercial.create`      | Crear cotizaciones        |
| `comercial.admin`       | Administrar cotizaciones  |
| `auditoria.view`        | Ver logs de auditoría     |

---

## Guía de Autenticación

Resumen (detalle de arquitectura, Azure y troubleshooting en `docs/supabase.md`):

1. **Alta de cuentas:** un administrador crea el usuario desde el portal (`/admin/usuarios`); se crea en GoTrue y en la tabla `usuarios` enlazado por `auth_uid`.
2. **Inicio de sesión:** el frontend usa `supabase-js` (PKCE) contra `/auth/v1`; obtiene un `access_token` (1 h).
   ```bash
   curl -X POST "http://localhost:3000/auth/v1/token?grant_type=password" \
     -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
     -d '{"email":"juan@empresa.com","password":"..."}'
   ```
3. **Usar el token en la API:**
   ```bash
   curl http://localhost:4000/api/noticias/publicadas -H "Authorization: Bearer <access_token>"
   ```
   El backend verifica la firma (`SUPABASE_JWT_SECRET`) y busca al usuario por `auth_uid` (o por correo la primera vez). Un token válido de alguien sin fila activa en `usuarios` recibe 403.
4. **Microsoft:** proveedor de GoTrue (`AZURE_AD_*`, `AZURE_AD_ENABLED`, redirect `https://<host>/auth/v1/callback`); el usuario debe existir antes en la intranet. Pendiente de probar con credenciales reales.

---

## Cómo Probar el Portal

### Flujo completo

1. **Levantar el stack:**

   ```bash
   docker compose -f docker-compose.dev.yml --env-file .env.dev up -d
   ```

2. **Verificar la base de datos:**

   ```bash
   docker exec -it intranet_supabase_db psql -U supabase_admin -h /var/run/postgresql -d postgres -c "SELECT count(*) FROM usuarios;"
   ```

3. **Crear una cuenta:** con un super_admin, en `/admin/usuarios` (no hay registro público). Los usuarios semilla de `init.sql` se crean en GoTrue con `scripts/migrar-usuarios-supabase.js` (ver `docs/supabase.md`).

4. **Obtener un token:** iniciar sesión en el frontend o con el `curl` de la sección anterior.

5. **Acceder al frontend:**
   - Abrir http://localhost:3000
   - Iniciar sesión con las credenciales creadas
   - Ver la página principal con noticias

6. **Crear una noticia (como admin):**
   ```bash
   curl -X POST http://localhost:4000/api/noticias \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <token>" \
     -d '{"titulo":"Bienvenidos","contenido":"Esta es la primera noticia","tipo":"noticia","publicada":true}'
   ```

---

## Integración con Auditoría

El portal registra en auditoría las siguientes acciones:

| Acción                            | Tabla         | Acción               |
| --------------------------------- | ------------- | -------------------- |
| Crear/actualizar/eliminar rol     | `roles`       | INSERT/UPDATE/DELETE |
| Crear/actualizar/eliminar permiso | `permisos`    | INSERT/UPDATE/DELETE |
| Asignar permisos a rol            | `rol_permiso` | INSERT/DELETE        |
| Crear/actualizar/eliminar módulo  | `modulos`     | INSERT/UPDATE/DELETE |
| Crear/actualizar/eliminar noticia | `noticias`    | INSERT/UPDATE/DELETE |

---

## Solución de Problemas

| Problema                                         | Causa probable               | Solución                                                               |
| ------------------------------------------------ | ---------------------------- | ---------------------------------------------------------------------- |
| `Token inválido o expirado`                      | Token expirado o mal formado | Iniciar sesión de nuevo (el token de GoTrue dura 1 h)                    |
| `No tienes permisos suficientes`                 | Usuario sin rol asignado     | Asignar rol desde `/admin/roles` o directamente en BD                  |
| `Error al conectar con Postgres (supabase-db)`               | Base de datos no corriendo   | `docker compose -f docker-compose.dev.yml --env-file .env.dev up -d supabase-db supabase-db-init`              |
| `Ya existe un usuario con ese correo`            | Correo duplicado             | Usar un correo diferente o eliminar el usuario existente               |
| `Ruta no encontrada`                             | Endpoint incorrecto          | Verificar la ruta en la tabla de endpoints arriba                      |
| `Frontend muestra "Cargando..." indefinidamente` | Backend no accesible         | Verificar que el backend responda en `http://localhost:4000/api/salud` |

---

## Ejecutar

```bash
# Con Docker (todo el stack)
docker compose -f docker-compose.dev.yml up -d

# Solo backend del portal
cd modules/portal/backend && npm install && npm run dev

# Solo frontend del portal
cd modules/portal/frontend && npm install && npm run dev

# Ejecutar pruebas
cd modules/portal/backend && npm test
```

---

## Dependencias

- **auditoria**: Servicio `AuditoriaService` para registrar cambios en roles, permisos, módulos y noticias
- **PostgreSQL**: Base de datos principal (tablas `usuarios`, `roles`, `permisos`, etc.)
