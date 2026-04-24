# Intranet Corporativa PERN

Intranet corporativa modular construida con el stack **PERN** (PostgreSQL, Express, React, Node.js), contenerizada con **Docker + WSL** y CI/CD con **GitHub Actions**.

---

## Estado de Avance

| Etapa | Módulo                                        | Estado        | Archivos | Puerto |
| ----- | --------------------------------------------- | ------------- | -------- | ------ |
| 0     | Auditoría + Docker                            | ✅ Completado | ~20      | —      |
| 1     | Portal (auth, roles, permisos, noticias)      | ✅ Completado | ~49      | 4000   |
| 2     | Tickets (soporte TI)                          | ✅ Completado | ~30      | 4001   |
| 3     | RH (empleados, expedientes, permisos, nómina) | ✅ Completado | ~31      | 4002   |
| 4     | BI (Streamlit + MSSQL)                        | ⏳ Pendiente  | —        | —      |
| 5     | Comercial (cotizaciones, listas de precios)   | ⏳ Pendiente  | —        | —      |

**Total: ~130 archivos de código** en 3 módulos completados.

---

## Arquitectura

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (React)                  │
│  Portal:3000  │  Tickets  │  RH  │  Auditoria       │
└────────────────────────┬────────────────────────────┘
                         │ HTTP / REST API
┌────────────────────────▼────────────────────────────┐
│                    Backend (Express)                  │
│  Portal:4000  │  Tickets:4001  │  RH:4002           │
│  ┌──────────────────────────────────────────────┐   │
│  │  Middleware: Auth JWT + Permisos + Auditoria │   │
│  └──────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────┐
│              PostgreSQL (puerto 5432)                │
│  usuarios │ roles │ permisos │ modulos │ noticias    │
│  tickets  │ adjuntos │ encuestas                     │
│  empleados│ expediente │ permisos_ausencias │ recibos │
│  auditoria                                            │
└─────────────────────────────────────────────────────┘
```

---

## Requisitos Previos

| Herramienta | Versión mínima | Notas                             |
| ----------- | -------------- | --------------------------------- |
| Docker      | 24+            | Con Docker Compose v2             |
| WSL 2       | Ubuntu 22.04+  | Backend WSL 2 para Docker Desktop |
| Node.js     | 18+            | Para desarrollo local sin Docker  |
| Git         | 2.40+          | Control de versiones              |

---

## Inicio Rápido

### Opción A: Docker (recomendado)

```bash
# 1. Clonar el repositorio
git clone <url-del-repo>
cd uliweb

# 2. Copiar variables de entorno
cp .env.dev .env

# 3. Levantar todo el stack
docker compose -f docker-compose.dev.yml up -d

# 4. Verificar que todo funciona
curl http://localhost:4000/api/salud
```

**Servicios disponibles:**

| Servicio        | URL                   | Descripción             |
| --------------- | --------------------- | ----------------------- |
| Frontend        | http://localhost:3000 | React (Vite)            |
| Backend Portal  | http://localhost:4000 | API principal           |
| Backend Tickets | http://localhost:4001 | API de tickets          |
| Backend RH      | http://localhost:4002 | API de recursos humanos |
| PostgreSQL      | localhost:5432        | Base de datos           |
| pgAdmin         | http://localhost:5050 | Administración de BD    |

### Opción B: Desarrollo local (sin Docker)

```bash
# 1. Asegurarse de tener PostgreSQL corriendo localmente
# 2. Crear la base de datos
createdb intranet_dev

# 3. Ejecutar migraciones
psql -d intranet_dev -f config/database/init.sql

# 4. Instalar y levantar cada módulo
cd modules/portal/backend && npm install && npm run dev
cd modules/tickets/backend && npm install && npm run dev
cd modules/rh/backend && npm install && npm run dev

# 5. En otra terminal, levantar el frontend
cd modules/portal/frontend && npm install && npm run dev
```

---

## Estructura de Directorios

```
uliweb/
├── README.md                           # Este archivo
├── PLAN.md                             # Plan de implementación por etapas
├── AGENTS.md                           # Definición de agentes OpenCode
├── AGENT.*.md                          # Agentes por módulo
├── skills/                             # Skills de OpenCode
│   └── SKILL.*.md
│
├── docker-compose.dev.yml              # Entorno de desarrollo
├── docker-compose.test.yml             # Entorno de pruebas
├── docker-compose.prod.yml             # Entorno de producción
├── .env.dev                            # Variables de desarrollo
├── .env.test                           # Variables de pruebas
├── .env.prod                           # Variables de producción
│
├── config/
│   ├── database/
│   │   └── init.sql                    # Migración inicial (tablas + seeds)
│   └── nginx/
│       └── nginx.conf                  # Configuración para producción
│
├── .github/workflows/
│   └── docker-build-deploy.yml         # CI/CD con GitHub Actions
│
├── scripts/
│   ├── dev/
│   │   ├── iniciar.sh                  # Script de inicio
│   │   └── detener.sh                  # Script de paro
│   └── test/
│       └── ejecutar-tests.sh           # Ejecutar todas las pruebas
│
└── modules/
    ├── auditoria/                      # Módulo transversal de auditoría
    │   ├── backend/
    │   │   ├── models/
    │   │   ├── services/
    │   │   │   └── auditoria.service.js    # Servicio central
    │   │   ├── middleware/
    │   │   │   └── auditoria.middleware.js # Middleware reutilizable
    │   │   ├── controllers/
    │   │   └── routes/
    │   └── frontend/
    │
    ├── portal/                         # Módulo central (Etapa 1)
    │   ├── backend/
    │   │   ├── models/                 # usuario, rol, permiso, modulo, noticia, usuarioRol, rolPermiso
    │   │   ├── controllers/            # auth, modulo, noticia, permiso, rol
    │   │   ├── services/               # auth, ms365, jwt, correo
    │   │   ├── middleware/             # auth, permisos
    │   │   ├── routes/
    │   │   ├── config/
    │   │   ├── migrations/
    │   │   └── seeds/
    │   ├── frontend/
    │   │   ├── pages/                  # Login, Registro, Home, Noticias, Admin
    │   │   ├── components/             # MenuDinamico, NoticiaCard, etc.
    │   │   ├── services/
    │   │   ├── context/
    │   │   └── utils/
    │   ├── config/
    │   └── tests/
    │
    ├── tickets/                        # Soporte TI (Etapa 2)
    │   ├── backend/
    │   │   ├── models/                 # ticket, adjunto, encuesta
    │   │   ├── controllers/            # ticket, adjunto, encuesta
    │   │   ├── services/               # notificacion, archivo
    │   │   ├── middleware/             # upload
    │   │   ├── routes/
    │   │   ├── config/
    │   │   └── migrations/
    │   ├── frontend/
    │   │   ├── pages/                  # TicketPage, TicketDetail
    │   │   ├── components/             # TicketForm, TicketList, etc.
    │   │   ├── services/
    │   │   └── routes/
    │   ├── config/
    │   └── tests/
    │
    └── rh/                             # Recursos Humanos (Etapa 3)
        ├── backend/
        │   ├── models/                 # empleado, expediente, permisos, recibos
        │   ├── controllers/            # empleado, expediente, permisos, recibos
        │   ├── services/               # notificacion, archivo
        │   ├── middleware/             # upload
        │   ├── routes/
        │   ├── config/
        │   └── migrations/
        ├── frontend/
        │   ├── pages/                  # EmpleadoPage, RHAdminPage, PerfilPage
        │   ├── components/             # ExpedienteUpload, PermisosForm, etc.
        │   ├── services/
        │   └── routes/
        ├── config/
        └── tests/
```

---

## Variables de Entorno

### Desarrollo (`.env.dev`)

| Variable                | Valor por defecto                           | Descripción                |
| ----------------------- | ------------------------------------------- | -------------------------- |
| `POSTGRES_HOST`         | `postgres`                                  | Host de PostgreSQL         |
| `POSTGRES_PORT`         | `5432`                                      | Puerto de PostgreSQL       |
| `POSTGRES_DB`           | `intranet_dev`                              | Nombre de la base de datos |
| `POSTGRES_USER`         | `postgres`                                  | Usuario de BD              |
| `POSTGRES_PASSWORD`     | `dev_password_123`                          | Contraseña de BD           |
| `JWT_SECRET`            | `dev_secret_change_me`                      | Secreto para firmar JWT    |
| `JWT_EXPIRES_IN`        | `8h`                                        | Expiración del token       |
| `AZURE_AD_CLIENT_ID`    | —                                           | Client ID de Azure AD      |
| `AZURE_AD_TENANT_ID`    | —                                           | Tenant ID de Azure AD      |
| `AZURE_AD_REDIRECT_URI` | `http://localhost:3000/auth/ms365/callback` | Redirect URI               |
| `BACKEND_PORT`          | `4000`                                      | Puerto del backend portal  |
| `FRONTEND_PORT`         | `3000`                                      | Puerto del frontend        |
| `PGADMIN_PORT`          | `5050`                                      | Puerto de pgAdmin          |

### Producción (`.env.prod`)

> ⚠️ **Nunca commitear valores reales de `.env.prod`**. Usar variables de entorno del servidor o un gestor de secretos.

---

## Base de Datos

### Tablas creadas

| Módulo        | Tablas                                                                               |
| ------------- | ------------------------------------------------------------------------------------ |
| **Portal**    | `usuarios`, `roles`, `permisos`, `rol_permiso`, `usuario_rol`, `modulos`, `noticias` |
| **Tickets**   | `tickets`, `ticket_adjuntos`, `ticket_encuestas`                                     |
| **RH**        | `empleados`, `expediente_documentos`, `permisos_ausencias`, `recibos_nomina`         |
| **Auditoría** | `auditoria`                                                                          |

### Migraciones

Las migraciones se ejecutan automáticamente al levantar PostgreSQL con Docker gracias al archivo `config/database/init.sql`.

Para ejecutar manualmente:

```bash
psql -h localhost -U postgres -d intranet_dev -f config/database/init.sql
```

### Seeds iniciales

El archivo `init.sql` incluye datos semilla:

- 10 roles base (super_admin, portal_admin, rh_admin, etc.)
- 18 permisos base
- 6 módulos registrados
- Usuario administrador: `admin@intranet.local`

---

## Autenticación

### Registro e inicio de sesión local

```bash
# Registrar un nuevo usuario
curl -X POST http://localhost:4000/api/auth/registro \
  -H "Content-Type: application/json" \
  -d '{"correo":"usuario@empresa.com","nombre":"Juan","apellido":"Pérez","contraseña":"mi_contraseña_123"}'

# Iniciar sesión
curl -X POST http://localhost:4000/api/auth/inicio-sesion \
  -H "Content-Type: application/json" \
  -d '{"correo":"usuario@empresa.com","contraseña":"mi_contraseña_123"}'
```

### Autenticación MS365 (Azure AD)

1. Configurar las variables `AZURE_AD_CLIENT_ID`, `AZURE_AD_TENANT_ID` y `AZURE_AD_CLIENT_SECRET`
2. El flujo OAuth2 redirige a Microsoft y devuelve un JWT al frontend

### Uso del token

```bash
curl http://localhost:4000/api/empleados \
  -H "Authorization: Bearer <tu_token_jwt>"
```

---

## Auditoría

El módulo de auditoría es **transversal**: registra cada INSERT, UPDATE y DELETE relevante en todos los módulos.

### Ejemplo de registro

```json
{
  "modulo": "tickets",
  "tabla": "tickets",
  "registro_id": "5",
  "accion": "INSERT",
  "valores_previos": null,
  "valores_nuevos": {
    "titulo": "No puedo acceder al correo",
    "nivel_atencion": "alto",
    "estado": "abierto"
  },
  "fecha": "2026-04-03T10:30:00.000Z"
}
```

### Cómo integrar auditoría en un nuevo módulo

```javascript
const {
  registrarAccion,
} = require("../../auditoria/backend/services/auditoria.service");

// Dentro de un controlador:
await registrarAccion(
  req,
  "nombre_modulo", // nombre del módulo
  "nombre_tabla", // tabla afectada
  registroId, // ID del registro
  "INSERT", // acción: INSERT, UPDATE, DELETE
  valoresAnteriores, // null para INSERT, objeto para UPDATE/DELETE
  valoresNuevos, // objeto con los datos nuevos
);
```

---

## Pruebas

### Ejecutar todas las pruebas

```bash
# Con Docker
docker compose -f docker-compose.test.yml up

# Localmente por módulo
cd modules/portal/backend && npm test
cd modules/tickets/backend && npm test
cd modules/rh/backend && npm test
```

### Cobertura

Cada módulo incluye tests unitarios y de integración. Los resultados se guardan en `coverage/`.

---

## Mapa de Dependencias

```
┌──────────────┐
│  Auditoría   │  ← Etapa 0 (base transversal)
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Portal     │  ← Etapa 1 (auth, roles, permisos)
└──────┬───────┘
       │
  ┌────┼────────────┐
  ▼    ▼            ▼
┌────┐ ┌────┐  ┌────┐
│Tix │ │ RH │  │ BI │  ← Etapas 2, 3, 4
└────┘ └────┘  └────┘
              ┌────┐
              │Com │  ← Etapa 5
              └────┘
```

**Regla:** No se construye ningún módulo sin que `auditoría` y `portal` estén completos.

---

## Módulos Pendientes

### Etapa 4: BI (Streamlit + MSSQL)

- Dashboards conectados a MSSQL
- Gestión de grupos de usuarios por dashboard
- Acceso protegido por sesión

### Etapa 5: Comercial (Cotizaciones)

- Listas de precios con carga Excel/CSV
- Generador de cotizaciones
- Exportación a PDF/Excel

---

## Scripts Útiles

```bash
# Iniciar entorno de desarrollo
./scripts/dev/iniciar.sh

# Detener entorno
./scripts/dev/detener.sh

# Ejecutar pruebas
./scripts/test/ejecutar-tests.sh

# Ver logs del backend
docker compose -f docker-compose.dev.yml logs -f backend

# Reiniciar un servicio
docker compose -f docker-compose.dev.yml restart backend

# Acceder a la base de datos
docker exec -it intranet_postgres_dev psql -U postgres -d intranet_dev
```

---

## Solución de Problemas

| Problema               | Solución                                                                |
| ---------------------- | ----------------------------------------------------------------------- |
| Puerto ya en uso       | Cambiar el puerto en `.env.dev` o matar el proceso con `lsof -i :4000`  |
| Error de conexión a BD | Verificar que PostgreSQL esté corriendo: `docker ps \| grep postgres`   |
| Token inválido         | Regenerar el token haciendo login nuevamente                            |
| Frontend no carga      | Verificar que `npm install` se ejecutó en `modules/portal/frontend`     |
| Migraciones fallan     | Ejecutar `psql -d intranet_dev -f config/database/init.sql` manualmente |

---

## Licencia

Uso interno corporativo.
