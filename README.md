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
│  │  Middleware: Token GoTrue + Permisos + Audit.│   │
│  └──────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────┐
│  Supabase self-hosted: Postgres + Auth + Storage     │
│  (ver docs/supabase.md)  base `postgres`, puerto 5432│
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

# 2. Levantar todo el stack (incluye Postgres, Auth y Storage de Supabase self-hosted)
docker compose -f docker-compose.dev.yml --env-file .env.dev up -d

# 3. Las cuentas las crea un administrador (no hay registro público);
#    más detalles de arranque, secretos y respaldos en docs/supabase.md

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
| Postgres (Supabase) | 127.0.0.1:5432    | Base de datos `postgres` (solo loopback) |
| Supabase Studio | http://127.0.0.1:54323 | Opcional: añadir `--profile admin` |

Auth (`/auth/v1`) y Storage (`/storage/v1`) se acceden por el mismo origen del frontend.

### Opción B: Backend/frontend fuera de Docker

El stack Supabase (Postgres, Auth, Storage) siempre corre en Docker. Solo se pueden ejecutar los módulos con Node localmente apuntando a él:

```bash
docker compose -f docker-compose.dev.yml --env-file .env.dev up -d supabase-db supabase-db-init supabase-auth supabase-storage
# Exponer Auth/Storage al host o usar los proxies de Vite del frontend (ver docs/supabase.md)
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
├── docker-compose.supabase.yml         # Stack Supabase self-hosted (lo incluyen dev/staging/prod)
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
├── docs/supabase.md                    # Runbook: arranque, migración, respaldos, troubleshooting
│
├── scripts/
│   ├── supabase/                       # generar-secretos.sh, backup.sh, restore.sh
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
    │   │   ├── services/               # supabaseAdmin, storage, correo
    │   │   ├── middleware/             # auth, permisos
    │   │   ├── routes/
    │   │   ├── config/
    │   │   ├── migrations/
    │   │   └── seeds/
    │   ├── frontend/
    │   │   ├── pages/                  # Login, Home, Noticias, Admin
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

| Variable                    | Valor por defecto      | Descripción                                   |
| --------------------------- | ---------------------- | --------------------------------------------- |
| `POSTGRES_HOST`             | `supabase-db`          | Host de Postgres (Supabase)                   |
| `POSTGRES_PORT`            | `5432`                 | Puerto de Postgres                            |
| `POSTGRES_DB`               | `postgres`             | Base (la imagen de Supabase la exige)         |
| `POSTGRES_USER`             | `postgres`             | Usuario de BD                                 |
| `POSTGRES_PASSWORD`         | `dev_password_123`     | Contraseña de BD (URL-safe)                   |
| `SUPABASE_JWT_SECRET`       | generado               | Secreto con que GoTrue firma los tokens       |
| `SUPABASE_ANON_KEY`         | generado               | Clave pública (se hornea en el frontend)      |
| `SUPABASE_SERVICE_ROLE_KEY` | generado               | Clave privada del backend (Admin API/Storage) |
| `SUPABASE_PUBLIC_URL`       | `http://localhost:3000`| Origen público de `/auth/v1` y `/storage/v1`  |
| `AZURE_AD_ENABLED`          | `false`                | Login con Microsoft (proveedor de GoTrue)     |
| `AZURE_AD_TENANT_ID/CLIENT_ID/CLIENT_SECRET` | —     | Credenciales de Entra ID                      |
| `BACKEND_PORT`              | `4000`                 | Puerto del backend portal                     |
| `FRONTEND_PORT`             | `3000`                 | Puerto del frontend                           |

Secretos nuevos: `bash scripts/supabase/generar-secretos.sh`. Lista completa: `.env.supabase.example` y `docs/supabase.md`.

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

El servicio one-shot `supabase-db-init` carga `config/database/init.sql` (solo si no existe `public.usuarios`) y aplica siempre las migraciones idempotentes `004` (RLS), `005` y `007` al levantar el stack. Para migrar datos desde el Postgres anterior, ver `docs/supabase.md` (sección 4).

### Seeds iniciales

El archivo `init.sql` incluye datos semilla:

- 10 roles base (super_admin, portal_admin, rh_admin, etc.)
- 18 permisos base
- 6 módulos registrados
- Usuario administrador: `admin@intranet.local`

---

## Autenticación

La autenticación la hace **Supabase Auth (GoTrue)**, con Microsoft/Azure como proveedor opcional. El backend solo acepta tokens de GoTrue; las contraseñas viven solo en GoTrue y las cuentas las crea un administrador (no hay registro público).

```bash
# Iniciar sesión (GoTrue, por el origen del frontend)
curl -X POST "http://localhost:3000/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"usuario@empresa.com","password":"..."}'

# Usar el access_token en la API
curl http://localhost:4000/api/empleados -H "Authorization: Bearer <access_token>"
```

Configuración de Microsoft (redirect `https://<host>/auth/v1/callback`, `AZURE_AD_*`): ver `docs/supabase.md`, sección 5. Aún no se ha probado con credenciales reales.

Archivos: Supabase Storage (buckets privados con URL firmada de 300 s; `noticias` público). Respaldos y restauración: `scripts/supabase/backup.sh` y `restore.sh` (docs/supabase.md, sección 6).

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
docker exec -it intranet_supabase_db psql -U supabase_admin -h /var/run/postgresql -d postgres
```

---

## Solución de Problemas

| Problema               | Solución                                                                |
| ---------------------- | ----------------------------------------------------------------------- |
| Puerto ya en uso       | Cambiar el puerto en `.env.dev` o matar el proceso con `lsof -i :4000`  |
| Error de conexión a BD | Verificar que PostgreSQL esté corriendo: `docker ps \| grep supabase_db`   |
| Token inválido         | Iniciar sesión de nuevo (tokens de Supabase Auth, 1 h)                  |
| Frontend no carga      | Verificar que `npm install` se ejecutó en `modules/portal/frontend`     |
| Migraciones fallan     | Ver `docker logs intranet_supabase_db_init` y docs/supabase.md (Troubleshooting) |

---

## Licencia

Uso interno corporativo.
