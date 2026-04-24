# Especificación: Revisión Integral + Mejoras UI — Intranet Corporativa PERN

**Fecha:** 2026-04-11  
**Estado:** Aprobado  
**Enfoque:** Revisión por dependencias (Enfoque C)

---

## Contexto

La intranet corporativa PERN tiene 4 módulos completados (Auditoría, Portal, Tickets, RH) y 2 pendientes (BI, Comercial). El objetivo de este plan es:

1. Revisar y estabilizar todos los módulos existentes antes de construir los nuevos.
2. Implementar mejoras de UI transversales: responsive, carruseles de noticias, logo, navbar y dashboards por módulo.
3. Reemplazar el modelo de permisos actual por uno más granular basado en módulo + opción + tipo (consulta/edición).

---

## Requerimientos Transversales

### Responsive Design

- Enfoque **mobile-first** con breakpoints `sm` (480px), `md` (768px), `lg` (1024px).
- El menú de navegación colapsa a **hamburguesa** en móvil.
- Las tablas de datos muestran **scroll horizontal** en pantallas pequeñas.
- Los formularios usan **columna única** en móvil.
- Todos los carruseles y gráficas se adaptan al ancho del contenedor.
- Las variables y utilidades responsive se definen en `modules/portal/frontend/styles/globales.css` y son heredadas por todos los módulos.

### Librería de Gráficas

- **Recharts** — compatible con React, ligera y nativa responsive.
- Componentes compartidos en `modules/portal/frontend/components/`:
  - `TarjetaKPI.jsx` — tarjeta con número principal, etiqueta y color de acento.
  - `GraficaBarras.jsx` — barras mensuales configurables.
  - `GraficaDona.jsx` — distribución porcentual con leyenda.

---

## UI: Páginas Rediseñadas

### Login (`PortalLogin.jsx`) — Split Screen

**Desktop:**
- Panel izquierdo (50%): Logo de la empresa + nombre centrados → formulario de login.
- Panel derecho (50%): `CarruselNoticias` con noticias publicadas como fondo animado, título y descripción superpuestos con gradiente, navegación por puntos.

**Móvil:** Columna única — logo → carrusel → formulario.

**Notas técnicas:**
- El endpoint `GET /api/noticias/publicas` devuelve noticias sin requerir autenticación.
- El carrusel en login usa el mismo componente `CarruselNoticias.jsx` que la Home.

### Home (`PortalHome.jsx`) — Destacada + Lista Lateral

**Desktop:**
- Columna izquierda (60%): Noticia destacada con imagen/gradiente de fondo, título, subtítulo y controles de carrusel. Auto-play con pausa al hacer hover.
- Columna derecha (40%): Lista de noticias secundarias con miniatura, título y fecha.

**Móvil:** Columna única — destacada full-width → lista en columna.

### Navbar (`MenuDinamico.jsx`) — Horizontal con Logo

**Estructura:**
```
[Logo + Nombre empresa]    [Link módulo 1] [Link módulo 2] ... [Link módulo N]    [Avatar + Nombre usuario ▾]
```

- El logo se ubica en el extremo **izquierdo**.
- Los links de módulos se muestran **al centro** (solo los módulos activos y con permiso).
- El avatar y nombre del usuario se ubican en el extremo **derecho** con dropdown (perfil, cerrar sesión).
- En móvil: logo izquierda + botón hamburguesa derecha. El menú despliega en columna.

### Logo de la Empresa

- El logo se almacena como archivo estático en `modules/portal/frontend/assets/logo.png` (o `.svg`).
- Si no existe el archivo, se muestra el nombre de la empresa como texto con estilos.
- El nombre de la empresa se configura vía variable de entorno `VITE_NOMBRE_EMPRESA` en el frontend.

### Componente Carrusel (`CarruselNoticias.jsx`)

Componente reutilizable que acepta props:
- `noticias` — array de noticias publicadas.
- `autoPlay` — booleano, intervalo de 5 segundos por defecto.
- `modo` — `'fondo'` (texto superpuesto sobre imagen/gradiente) o `'tarjeta'` (card con imagen separada).

Características:
- Navegación por **puntos** y **flechas prev/next**.
- Pausa al hacer hover.
- **Swipe táctil** en móvil.
- Solo muestra noticias con `publicada = true`.

---

## Dashboards por Módulo

Cada módulo (excepto Portal) incluye una **home page con tablero resumen**. El layout es:

```
[ KPI 1 ] [ KPI 2 ] [ KPI 3 ] [ KPI 4 ]   ← fila de TarjetaKPI
[    Gráfica de Barras (ancho ~60%)    ] [ Dona (~40%) ]
[         Sección informativa extra          ]
```

### Rutas de los Dashboards

Los dashboards son la **landing page** de cada módulo (no reemplazan las páginas de listado):

| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/auditoria` | `AuditoriaDashboard.jsx` | Dashboard + enlace a "Ver logs" → `AuditoriaPage.jsx` |
| `/tickets` | `TicketsDashboard.jsx` | Dashboard + enlace a "Ver tickets" → `TicketPage.jsx` |
| `/rh` | `RHDashboard.jsx` | Dashboard + enlace a "Ver empleados" → `EmpleadoPage.jsx` |

### Dashboard Auditoría (`AuditoriaDashboard.jsx`)

| KPI | Valor |
|-----|-------|
| Eventos hoy | Total de registros con fecha = hoy |
| Eventos del mes | Total del mes en curso |
| Usuarios activos | Usuarios únicos con eventos este mes |
| Módulos monitoreados | Módulos con al menos un evento |

- **Barras:** eventos por día (últimos 30 días), agrupados por módulo.
- **Dona:** distribución por tipo de acción (INSERT / UPDATE / DELETE).

### Dashboard Tickets (`TicketsDashboard.jsx`)

| KPI | Valor |
|-----|-------|
| Total tickets | Todos los registros |
| Pendientes | Estado = abierto |
| En proceso | Estado = en_proceso |
| Cerrados hoy | Fecha cierre = hoy |

- **Barras:** tickets por mes (últimos 6 meses), apilados por estado.
- **Dona:** distribución actual por estado.
- **Sección extra:** ranking de técnicos por calificación promedio de encuestas (top 5).

### Dashboard RH (`RHDashboard.jsx`)

| KPI | Valor |
|-----|-------|
| Total empleados | Todos los registros |
| Activos | Estatus = activo |
| Bajas del mes | Fecha baja en el mes en curso |
| Permisos pendientes | Estatus = pendiente en permisos_ausencias |

- **Barras:** ingresos y bajas por mes (últimos 6 meses).
- **Dona:** distribución de empleados activos por departamento.
- **Sección extra:** lista de permisos/ausencias pendientes de aprobación (los más recientes).

---

## Nuevo Modelo de Permisos

### Principios

- Cada usuario tiene **exactamente un rol**.
- Los permisos se definen por **módulo → opción → tipo** (consulta o edición).
- **Edición implica consulta** automáticamente — no es necesario marcar ambos.
- El `superadmin` tiene acceso total sin restricciones.

### Cambios en el Esquema de Base de Datos

**Modificación a `usuarios`:**
```sql
ALTER TABLE usuarios ADD COLUMN rol_id INT REFERENCES roles(id);
-- Migrar datos de usuario_rol (un rol por usuario) a usuarios.rol_id
-- Eliminar tabla usuario_rol después de la migración
```

**Tablas nuevas:**
```sql
CREATE TABLE modulo_opciones (
  id SERIAL PRIMARY KEY,
  modulo_id INT REFERENCES modulos(id) ON DELETE CASCADE,
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  orden INT DEFAULT 0,
  UNIQUE(modulo_id, nombre)
);

CREATE TABLE rol_opcion_permisos (
  rol_id INT REFERENCES roles(id) ON DELETE CASCADE,
  opcion_id INT REFERENCES modulo_opciones(id) ON DELETE CASCADE,
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('consulta', 'edicion')),
  PRIMARY KEY (rol_id, opcion_id, tipo)
);
```

**Tabla `permisos` y `rol_permiso`:** se mantienen temporalmente para compatibilidad, se eliminan al finalizar la migración completa.

### Opciones Iniciales por Módulo (seed)

| Módulo | Opciones |
|--------|----------|
| portal | Noticias, Usuarios, Roles, Módulos |
| tickets | Tickets, Categorías, Adjuntos, Encuestas |
| rh | Empleados, Expedientes, Permisos/Ausencias, Recibos de Nómina |
| auditoria | Logs de Auditoría |

### Middleware Actualizado

```javascript
// Firma nueva
verificarPermiso(modulo, opcion, tipo)
// tipo: 'consulta' | 'edicion'

// Ejemplo de uso en rutas
router.get('/tickets',
  verificarToken,
  verificarPermiso('tickets', 'Tickets', 'consulta'),
  ticketController.listar
);

router.post('/tickets',
  verificarToken,
  verificarPermiso('tickets', 'Tickets', 'edicion'),
  ticketController.crear
);
```

**Lógica interna:** busca en `rol_opcion_permisos` si el rol del usuario tiene el permiso exacto. Si el tipo solicitado es `'consulta'`, también acepta si tiene `'edicion'` (edición implica consulta).

### UI de Administración de Permisos (`PermisosAdminPage.jsx`)

- **Dropdown** de selección de rol en la parte superior.
- **Acordeón** — un bloque expandible por módulo.
- Dentro de cada módulo: lista de opciones con dos checkboxes — **Consulta** y **Edición**.
- Marcar Edición activa Consulta automáticamente en la UI.
- **Botón "Guardar"** por módulo (no global) para evitar guardados accidentales.
- Feedback visual al guardar (success/error inline).

---

## Plan de Ejecución por Fases

### Fase 1 — Módulo Auditoría

**Objetivo:** Revisar y estabilizar la base transversal. Agregar dashboard.

**Tareas:**
1. Revisión de código: `auditoria.service.js`, `auditoria.middleware.js`, modelo, controlador, rutas.
2. Verificar integración correcta en todos los módulos que usan el servicio.
3. Implementar `AuditoriaDashboard.jsx` con KPIs y gráficas (Recharts).
4. Levantar con Docker y verificar endpoints.
5. Ejecutar y corregir tests (`auditoria.service.test.js`, `auditoria.middleware.test.js`).
6. Commit: `Fase 1: Auditoría — revisión + dashboard`.

**Definition of Done:** Código limpio · Docker levanta · APIs responden · Tests en verde · Dashboard funcional.

---

### Fase 2 — Módulo Portal

**Objetivo:** Estabilizar el módulo central e implementar todas las mejoras de UI y el nuevo modelo de permisos.

**Tareas:**

**2a — Nuevo modelo de permisos:**
1. Crear migración: `modulo_opciones`, `rol_opcion_permisos`, columna `rol_id` en `usuarios`.
2. Seed: insertar opciones iniciales de los 4 módulos.
3. Migrar datos existentes de `usuario_rol` a `usuarios.rol_id`.
4. Actualizar `permisos.middleware.js` con la nueva firma `verificarPermiso(modulo, opcion, tipo)`.
5. Implementar `PermisosAdminPage.jsx` con acordeón y checkboxes.
6. Actualizar todas las rutas del Portal para usar el nuevo middleware.

**2b — UI y Responsive:**
1. Actualizar `globales.css`: variables CSS, breakpoints, clases utilitarias responsive.
2. Rediseñar `PortalLogin.jsx`: split screen con logo + carrusel.
3. Crear `CarruselNoticias.jsx`: auto-play, puntos, flechas, swipe táctil.
4. Agregar endpoint público `GET /api/noticias/publicas` (sin auth).
5. Rediseñar `PortalHome.jsx`: noticia destacada + lista lateral.
6. Actualizar `MenuDinamico.jsx`: logo izquierda, links centro, avatar derecha, hamburguesa móvil.

**2c — Revisión general del Portal:**
1. Revisar auth local (registro, login, JWT, refresh token, cambio de contraseña obligatorio).
2. Revisar auth MS365/Azure AD.
3. Revisar CRUD de roles, usuarios, módulos, noticias.
4. Verificar auditoría integrada en todos los cambios.
5. Docker: levantar stack y probar flujos completos.
6. Ejecutar y corregir tests.
7. Commit: `Fase 2: Portal — nuevo modelo permisos + UI responsive + carruseles`.

**Definition of Done:** Nuevo modelo de permisos funcionando · Login y Home rediseñados · Navbar con logo · Carrusel funcional · Responsive verificado · Tests en verde.

---

### Fase 3 — Tickets y RH (independientes, orden flexible)

**Objetivo:** Revisar, estabilizar y actualizar ambos módulos al nuevo modelo de permisos. Agregar dashboards.

> Tickets y RH no tienen dependencias entre sí — pueden ejecutarse en cualquier orden o en paralelo si hay dos desarrolladores. El orden recomendado si es un solo desarrollador: Tickets → RH.

**Tareas comunes (Tickets y RH):**
1. Revisión de código: modelos, controladores, servicios, rutas.
2. Actualizar todas las rutas para usar `verificarPermiso(modulo, opcion, tipo)`.
3. Implementar dashboard con `TarjetaKPI`, `GraficaBarras`, `GraficaDona`.
4. Verificar responsive (hereda `globales.css` del Portal).
5. Verificar auditoría integrada en operaciones críticas.
6. Docker: levantar stack y probar endpoints.
7. Ejecutar y corregir tests.

**Tareas específicas Tickets:**
- Dashboard: KPIs de tickets por estado + barras mensuales + dona + ranking técnicos.
- Verificar flujo completo: crear → asignar → resolver → encuesta.
- Verificar carga/descarga de adjuntos.

**Tareas específicas RH:**
- Dashboard: KPIs empleados + barras ingresos/bajas + dona departamentos + lista permisos pendientes.
- Verificar flujo de alta/baja de empleados.
- Verificar flujo de aprobación de permisos/ausencias.
- Verificar carga de recibos de nómina y documentos de expediente.

**Commit:** `Fase 3: Tickets + RH — dashboards + nuevo modelo permisos + responsive`.

**Definition of Done:** Dashboards funcionales · Permisos migrados · Responsive verificado · Tests en verde.

---

### Fase 4 — BI / Comercial

Se decide al completar Fase 3. Cada módulo nuevo incluirá desde el inicio:
- Dashboard con KPIs y gráficas.
- Permisos con el nuevo modelo (`modulo_opciones` + `rol_opcion_permisos`).
- Diseño responsive heredando `globales.css`.

---

## Criterio Global de Finalización

Antes de considerar el proyecto listo para producción:

- [ ] Todos los módulos pasan `npm test` sin errores.
- [ ] `docker compose -f docker-compose.dev.yml up` levanta sin errores.
- [ ] El nuevo modelo de permisos está activo en todos los módulos.
- [ ] Los dashboards están funcionales en Auditoría, Tickets y RH.
- [ ] Login, Home y Navbar rediseñados y responsive.
- [ ] Carrusel de noticias funcional en login y home.
- [ ] CI/CD en GitHub Actions pasa.

---

## Archivos Nuevos a Crear

| Archivo | Fase | Descripción |
|---------|------|-------------|
| `modules/portal/frontend/components/CarruselNoticias.jsx` | 2 | Carrusel reutilizable |
| `modules/portal/frontend/components/TarjetaKPI.jsx` | 2 | Tarjeta de KPI |
| `modules/portal/frontend/components/GraficaBarras.jsx` | 2 | Gráfica de barras Recharts |
| `modules/portal/frontend/components/GraficaDona.jsx` | 2 | Gráfica de dona Recharts |
| `modules/portal/frontend/pages/PermisosAdminPage.jsx` | 2 | Admin permisos acordeón |
| `modules/portal/backend/migrations/002-modelo-permisos-granular.sql` | 2 | Migración nuevo modelo |
| `modules/auditoria/frontend/pages/AuditoriaDashboard.jsx` | 1 | Dashboard auditoría |
| `modules/tickets/frontend/pages/TicketsDashboard.jsx` | 3 | Dashboard tickets |
| `modules/rh/frontend/pages/RHDashboard.jsx` | 3 | Dashboard RH |

## Archivos Modificados Principales

| Archivo | Fase | Cambio |
|---------|------|--------|
| `modules/portal/frontend/styles/globales.css` | 2 | Breakpoints + variables responsive |
| `modules/portal/frontend/pages/PortalLogin.jsx` | 2 | Split screen + logo + carrusel |
| `modules/portal/frontend/pages/PortalHome.jsx` | 2 | Destacada + lista lateral |
| `modules/portal/frontend/components/MenuDinamico.jsx` | 2 | Logo izquierda + hamburguesa |
| `modules/portal/frontend/main.jsx` | 2 | Rutas nuevas (dashboards, permisos admin) |
| `modules/portal/backend/middleware/permisos.middleware.js` | 2 | Nueva firma verificarPermiso |
| `modules/portal/backend/routes/*.routes.js` | 2 | Actualizar a nuevo middleware |
| `modules/tickets/backend/routes/*.routes.js` | 3 | Actualizar a nuevo middleware |
| `modules/rh/backend/routes/*.routes.js` | 3 | Actualizar a nuevo middleware |
