---
name: decisions
description: ADRs del proyecto — decisiones de arquitectura con fecha y autor
type: project
---

# Decisiones de Arquitectura

### [2026-10-08] orquestador — Migración a Supabase self-hosted (DB + Auth + Storage): decisiones de Fase 0-1

**Contexto:** Se migra Postgres, auth (JWT/Azure AD casero) y archivos (disco local) a Supabase self-hosted en contenedores propios. Plan completo: `.claude/plans/` (sesión) / rama `feat/supabase-selfhosted`.

**Decisiones:**

1. **Línea base del esquema = `config/database/init.sql`** (no las migraciones de módulo ni la BD de dev). El código coincide con `init.sql` (`tickets.solicitante_id/tecnico_id`, tabla `permisos_ausencia` en singular con `respondedor_id`). Las migraciones `tickets/001` y `rh/001` (`usuario_id`, `permisos_ausencias`) están **obsoletas**; la BD de dev también (no tiene `empleado_hijos`, `ticket_comentarios`).
   - Se agregó a `init.sql` lo que faltaba: `tabla_calculo_vacaciones`, `solicitudes_vacaciones` (de `rh/002`) y `ticket_comentarios` (nueva `tickets/002`). Verificado: carga limpia con `ON_ERROR_STOP` y crea 28 tablas.
   - Diferencia conocida: `init.sql` define `empleados.clabe/nss/infonavit/fonacot` más angostos que la BD de dev (18/11/20/20 vs 20/20/50/50). Si un dump de staging tiene datos más largos, la restauración fallará: revisar antes del corte.
2. **Sin gateway (Kong/Envoy).** El compose oficial actual usa Envoy; aquí nginx enruta `/auth/v1/` → GoTrue y `/storage/v1/` → Storage (quita el prefijo y manda `X-Forwarded-Prefix`, requisito de las URLs firmadas). Menos piezas; PostgREST queda solo interno (dependencia de Storage). Studio+meta solo con perfil `admin` (sin gateway, solo Table/SQL editor).
3. **Imagen `supabase/postgres:17.6.1.136`** (PG 17 ≥ 16 actual). La base debe llamarse `postgres`: el backend pasa a `POSTGRES_DB=postgres`. El rol `postgres` es superusuario en esa imagen (ignora RLS).
4. **Secretos propios con prefijo `SUPABASE_*`** (`SUPABASE_JWT_SECRET`, etc.) para no chocar con el `JWT_SECRET` del auth actual durante la transición. `POSTGRES_PASSWORD` se comparte con el backend y debe ser URL-safe (va en URLs de GoTrue/Storage). Generador: `scripts/supabase/generar-secretos.sh`.
5. **RLS deny-all** en todas las tablas de `public` + revocar `anon/authenticated` (incl. privilegios por defecto): migración `portal/004-rls-deny-all.sql`. Necesario porque PostgREST/anon key expondrían `hash_password`, CURP, NSS, etc.

**Trampas encontradas al probar el stack (todas resueltas en `config/supabase/db/roles.sql` y el compose):**
   - `roles.sql` oficial falla en `supabase_functions_admin` (lo crea `webhooks.sql`, que omitimos) y se detiene: `supabase_storage_admin` queda sin password.
   - GoTrue falla con `must be owner of function uid`: la imagen crea `auth.uid/role/email` como `postgres`; se reasignan a `supabase_auth_admin`.
   - Healthcheck de Storage con `localhost` falla (resuelve a `::1`, Storage escucha en IPv4): usar `127.0.0.1`.

**Validado en pruebas (stack aislado, ya eliminado):** importar hash bcrypt con `password_hash` en `POST /admin/users` → login con la contraseña original OK, incorrecta rechazada; bucket privado → subida con service key OK, sin credenciales rechazado, URL firmada descarga OK, token alterado rechazado; `anon` sin acceso a `public` (tablas actuales y futuras).

### [2026-04-28] orquestador — Módulo Vacaciones RH: diseño e implementación

**Contexto:** El usuario pidió eliminar la opción "Perfil" del módulo RH y crear una nueva sección "Vacaciones" con formulario de solicitud, control de saldo, flujo de aprobación y registro en auditoría.

**Decisiones tomadas:**

1. **Nueva tabla `solicitudes_vacaciones`** (no reutilizar `permisos_ausencias`)
   - **Por qué:** `permisos_ausencias` es genérica (vacaciones, incapacidad, asunto_personal). Vacaciones necesita campos específicos: `dias_periodo`, `dias_disfrutados`, `dias_pendientes_inicial`, `dias_a_disfrutar`, `dias_pendientes_final`, `motivo_rechazo`, `fecha_regreso`, `numero_nomina`, datos desnormalizados del empleado para el formato impreso.
   - **Cómo aplicar:** Migración `002-solicitudes-vacaciones.sql`

2. **Nueva tabla `tabla_calculo_vacaciones`** con los rangos de antigüedad → días
   - **Por qué:** El cálculo de días de vacaciones por antigüedad viene de un documento oficial (LFT). Se almacena en DB para que sea configurable sin code changes.
   - **Datos:** 1a=12, 2a=14, 3a=16, 4a=18, 5a=20, 6-10=22, 11-15=24, 16-20=26, 21-25=28, 26-30=30, 31-35=32, 36-40=34, 41-45=36, 46-50=38, 51-55=40, 56-60=42

3. **Saldo de vacaciones calculado on-the-fly**
   - `dias_periodo` = lookup en `tabla_calculo_vacaciones` según antigüedad del empleado en el año del periodo
   - `dias_disfrutados` = SUM de `dias_a_disfrutar` de solicitudes aprobadas del mismo empleado y periodo
   - `dias_pendientes_inicial` = `dias_periodo - dias_disfrutados` (antes de esta solicitud)
   - `dias_pendientes_final` = `dias_pendientes_inicial - dias_a_disfrutar` (campo calculado)

4. **Eliminar ruta `/rh/perfil` del sidebar y main.jsx** — no borrar el archivo `PerfilPage.jsx` porque `EmpleadoPage.jsx` usa `EmpleadoProfileCard` del componente separado `components/EmpleadoProfileCard.jsx`.

5. **Nueva ruta frontend `/rh/vacaciones`** registrada en `MenuDinamico.jsx` (SUB_RUTAS.rh) y `main.jsx`.

6. **Auditoría obligatoria** en crear solicitud (INSERT) y responder (UPDATE), usando `registrarAccion` de `auditoria.service.js`.

7. **Notificación al jefe inmediato** al crear solicitud (reutilizar `ServicioNotificacionRH.notificarNuevoPermiso`).

**Archivos a crear:**
- `modules/rh/backend/migrations/002-solicitudes-vacaciones.sql`
- `modules/rh/backend/models/solicitudVacaciones.model.js`
- `modules/rh/backend/controllers/vacaciones.controller.js`
- `modules/rh/backend/routes/vacaciones.routes.js`
- `modules/rh/frontend/pages/VacacionesPage.jsx`
- `modules/rh/frontend/services/vacaciones.service.js`

**Archivos a modificar:**
- `modules/portal/backend/app.js` — agregar `app.use("/api/vacaciones", ...)`
- `modules/portal/frontend/components/MenuDinamico.jsx` — reemplazar `/rh/perfil → /rh/vacaciones`
- `modules/portal/frontend/main.jsx` — reemplazar ruta `/rh/perfil → /rh/vacaciones`

---

### [2026-04-28] orquestador — Listado separado de vacaciones + visibilidad por rol + seed

**Contexto:** El usuario pidió separar el listado de solicitudes del formulario, aplicar visibilidad basada en rol y agregar datos de ejemplo.

**Decisiones tomadas:**

1. **Nueva página `VacacionesListadoPage.jsx`** en `/rh/vacaciones/listado`
   - Listado independiente al formulario de solicitud
   - `rh_admin` y `super_admin`: ven TODAS las solicitudes sin filtro
   - Empleados con subordinados (jefe): ven las propias + las de sus subordinados
   - Empleados sin subordinados: ven solo las propias (llegan aquí desde el sidebar)
   - Permite aprobar/rechazar solicitudes pendientes que NO sean del propio usuario

2. **`VacacionesPage.jsx` queda como formulario puro**
   - Mantiene: saldo, formulario de nueva solicitud, "Mis solicitudes" (solo propias, sin acciones de aprobación)
   - Se elimina la sección "Solicitudes pendientes de mi equipo" (pasa al listado)

3. **Modelo `solicitudVacaciones.model.js` — nuevo filtro `empleado_o_jefe_id`**
   - Cuando se pasa este filtro: `WHERE empleado_id = $X OR jefe_inmediato_id = $X`
   - Cuando se pasa `ver_todo: true`: sin filtro de empleado (solo admin)
   - El filtro individual `empleado_id` sigue funcionando (para "Mis solicitudes" en el form)

4. **Controlador `vacaciones.controller.js`** — `listar` reescrito:
   - Detecta rol con `req.user.rol_nombre`
   - `super_admin` o `rh_admin` → `ver_todo: true`
   - Cualquier otro empleado → `empleado_o_jefe_id: empleadoUsuario.id`
   - El campo `puede_responder` de cada solicitud se calcula en el controller:
     `puede_responder = solicitud.empleado_id !== empleadoUsuario.id && solicitud.estatus === 'pendiente'`

5. **Seed de datos de ejemplo** — `modules/rh/backend/seeds/002-vacaciones-ejemplo.sql`
   - Crea empleados para `rh@empresa.com` (jefe, ingreso 2023-02-01) y `empleado@empresa.com` (subordinado, ingreso 2022-03-15)
   - `rh@empresa.com` es jefe de `empleado@empresa.com`
   - Datos de `empleado@empresa.com`:
     - 2024 (2 años → 14 días): 2 solicitudes aprobadas que suman 14 días (periodo completo)
     - 2025 (3 años → 16 días): 2 aprobadas (10 días) + 1 pendiente (5 días) → 1 día libre
     - 2026 (4 años → 18 días): 1 pendiente (5 días) → 13 días libres
   - Datos de `rh@empresa.com`:
     - 2024 (1 año → 12 días): 2 aprobadas que suman 12 días (periodo completo)
     - 2025 (2 años → 14 días): 1 aprobada (7 días) → 7 días libres

6. **Sidebar** — agregar `{ path: '/rh/vacaciones/listado', label: 'Solicitudes' }` en SUB_RUTAS.rh

**Archivos a crear:**
- `modules/rh/frontend/pages/VacacionesListadoPage.jsx`
- `modules/rh/backend/seeds/002-vacaciones-ejemplo.sql`

**Archivos a modificar:**
- `modules/rh/backend/models/solicitudVacaciones.model.js` — añadir `ver_todo` y `empleado_o_jefe_id`
- `modules/rh/backend/controllers/vacaciones.controller.js` — reescribir `listar`
- `modules/rh/frontend/pages/VacacionesPage.jsx` — eliminar sección de equipo
- `modules/portal/frontend/components/MenuDinamico.jsx` — agregar entrada de listado
- `modules/portal/frontend/main.jsx` — agregar ruta `/rh/vacaciones/listado`

---

### [2026-04-29] orquestador — Alta empleado: sincronización formulario con esquema DB

**Contexto:** El usuario reportó que la página de alta de empleado no coincidía con los campos actualizados en la migración 001. La investigación del equipo confirmó que el formulario capturaba 9 de 38 campos y usaba `apellido` en lugar de `apellido_paterno`.

**Decisiones tomadas:**

1. **Modelo `Empleado.crear()` ampliado de 12 a 38 campos**
   - El INSERT ahora incluye todos los campos de la tabla `empleados` excepto los auto-calculados (`id`, `fecha_creacion`, `fecha_actualizacion`, `fecha_baja`, `motivo_baja`)
   - `estatus` tiene default `|| 'activo'` en el modelo

2. **Bug crítico corregido: `apellido` → `apellido_paterno`**
   - El controller desestructura `apellido_paterno` del body (antes: `apellido`)
   - Mapping explícito en `Usuario.crear()`: `apellido: apellido_paterno` — el modelo de `usuarios` sigue esperando `apellido` (no se toca para no romper el resto del sistema)
   - Validación actualizada: `!nombre || !apellido_paterno`

3. **Formulario modal reescrito con 7 secciones scrollables**
   - Datos básicos / Datos laborales / Datos personales / Contacto / Domicilio / Datos financieros / Crear usuario
   - `formularioInicial` extraído como constante para reusar en reset
   - Select de `jefe_inmediato_id` cargado con empleados activos (límite: 200)
   - Columna de tabla corregida: `empleado.apellido` → `empleado.apellido_paterno`

4. **Observación conocida (no bloqueante):** Select de jefe inmediato carga máximo 200 empleados. No es problema para el tamaño actual de la empresa.

**Revisión:** APROBADO CON OBSERVACIONES — sin bugs bloqueantes (revisor 2026-04-29)

**Archivos modificados:**
- `modules/rh/backend/models/empleado.model.js`
- `modules/rh/backend/controllers/empleado.controller.js`
- `modules/rh/frontend/pages/EmpleadoPage.jsx`

---

### [2026-04-29] orquestador — Validaciones y combos en formularios de empleado

**Contexto:** El usuario pidió convertir campos de texto libre a combos seleccionables (estados de la república, bancos) y agregar validaciones de longitud/formato en ambos formularios de empleado (alta y edición).

**Decisiones tomadas:**

1. **Constantes compartidas en `modules/rh/frontend/constants/catalogos.js`**
   - `ESTADOS_MEXICO` — 32 estados oficiales de la República Mexicana
   - `BANCOS_MEXICO` — 23 instituciones bancarias mexicanas más "Otro"
   - **Por qué:** DRY — ambos formularios importan del mismo archivo; cambiar un banco o estado en un solo lugar actualiza ambas vistas

2. **Combos `<select>` para campos categóricos**
   - `estado_nacimiento` y `estado_residencia` → `<select>` con ESTADOS_MEXICO en ambos forms
   - `banco` → `<select>` con BANCOS_MEXICO en ambos forms
   - `EmpleadoProfileCard` usa nuevo componente helper `CampoSelect` consistente con el patrón `Campo` existente

3. **Validaciones HTML5 nativas — sin librerías externas**
   - CURP: `minLength=18 maxLength=18`, pattern de 18 caracteres
   - RFC: `minLength=13 maxLength=13` (personas físicas)
   - CLABE: `minLength=18 maxLength=18 pattern="\d{18}"`
   - Teléfonos (celular_personal, celular_corporativo, telefono_emergencia): `minLength=10 maxLength=10 pattern="\d{10}"`
   - Código postal: `minLength=5 maxLength=5 pattern="\d{5}"`
   - Correo personal: `type="email"` (ya existía)
   - **Por qué:** Sin dependencias externas, funciona con el navegador nativo, fácil de mantener

4. **Helper `soloDigitos(e)`** — filtra no-dígitos en `onInput` para teléfonos, CLABE, CP
   - Bloquea la entrada de caracteres no numéricos en tiempo real
   - No aplica a CURP ni RFC (admiten letras)

5. **`Campo` extendido** en `EmpleadoProfileCard` para aceptar `pattern`, `minLength`, `title`, `onInput`

**Observaciones del revisor (no bloqueantes):**
- Pattern CURP falta en EmpleadoPage (solo en ProfileCard) — mejora futura
- `soloDigitos` duplicado en 2 archivos — candidato a extraer a `utils/validaciones.js`
- NSS sin pattern en ProfileCard — mejora futura por consistencia

**Revisión:** APROBADO CON OBSERVACIONES — sin bugs bloqueantes (revisor 2026-04-29)

**Archivos creados/modificados:**
- `modules/rh/frontend/constants/catalogos.js` (NUEVO)
- `modules/rh/frontend/pages/EmpleadoPage.jsx`
- `modules/rh/frontend/components/EmpleadoProfileCard.jsx`

---

### [2026-04-29] orquestador — Combos unificados, title case en nombres y eliminación de nivel_salarial

**Contexto:** Los formularios de alta y edición de empleado tenían opciones inconsistentes (tipo_contrato con valores distintos en cada form), campos categóricos como texto libre, y sin normalización de mayúsculas en nombres. La tabla de puestos mostraba un campo `nivel_salarial` sin uso real en los flujos de nómina.

**Decisiones tomadas:**

1. **4 nuevas constantes en `catalogos.js`** (DRY — reutilizadas en ambos formularios)
   - `GENEROS` — ["Masculino", "Femenino", "Otro"]
   - `ESTADOS_CIVILES` — ["Soltero", "Casado", "Divorciado", "Separado", "Viudo", "Unión libre"]
   - `NIVELES_ESCOLARIDAD` — 8 niveles (Sin estudios → Doctorado)
   - `TIPOS_CONTRATO` — ["Determinado", "Indeterminado", "Por obra", "Honorarios", "Confianza", "Prácticas"]
   - **Por qué:** `tipo_contrato` tenía opciones completamente distintas entre alta y edición (e.g. "Determinado" vs "indefinido") — riesgo de pérdida de datos al editar registros creados con el form de alta.

2. **`<select>` con catálogos centralizados** en EmpleadoPage.jsx y EmpleadoProfileCard.jsx
   - genero, estado_civil, escolaridad, tipo_contrato → `<select>` en ambos forms
   - ProfileCard usa el componente `<CampoSelect>` ya existente

3. **`manejarBlurNombre`** — normalización title case en blur (onBlur)
   - Aplica en nombre, apellido_paterno, apellido_materno en ambos forms
   - Implementado dentro del componente (no como helper de módulo) porque necesita acceso al setter de estado (setFormulario / setDatosEditados)
   - `soloDigitos` sí puede ser helper externo porque solo manipula `e.target.value`

4. **`nivel_salarial` eliminado de la capa de aplicación** (frontend + backend modelo)
   - Eliminado de: estado inicial PuestosPage, JSX formulario, tabla de listado, puesto.model.js CREATE y UPDATE
   - **NO se crea migración DROP COLUMN** — columna queda en BD inerte. El usuario decide ejecutarla cuando convenga.
   - El `puesto.controller.js` no desestructuraba el body explícitamente, por lo que no requirió cambios.

**Dato de compatibilidad:** Registros con valores legacy (e.g. "indefinido") en tipo_contrato no romperán el select — el browser mostrará valor vacío. Requiere normalización de datos si se quiere consistencia.

**Revisión:** APROBADO — sin bugs bloqueantes (revisor 2026-04-29)

**Archivos creados/modificados:**
- `modules/rh/frontend/constants/catalogos.js` — añadidos GENEROS, ESTADOS_CIVILES, NIVELES_ESCOLARIDAD, TIPOS_CONTRATO
- `modules/rh/frontend/pages/EmpleadoPage.jsx`
- `modules/rh/frontend/components/EmpleadoProfileCard.jsx`
- `modules/rh/frontend/pages/PuestosPage.jsx`
- `modules/rh/backend/models/puesto.model.js`

---

### [2026-04-29] orquestador — Logo sidebar +10%, logo login Rayhsa, filtrado menú por permisos

**Contexto:** El sidebar mostraba el logo pequeño y sin centrado explícito. La página de login usaba un emoji genérico 🏢. El menú dinámico exponía todas las sub-rutas de módulos activos a todos los usuarios, sin filtrar por los permisos del rol — los links aparecían en el sidebar aunque el backend los rechazara.

**Decisiones tomadas:**

1. **Logo sidebar: `height: 38px → 42px` + centrado inline**
   - 38 × 1.1 = 41.8 → redondeado a 42px (valor limpio)
   - `<div className="sidebar-logo">` recibe `style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}` para garantizar centrado sin depender del CSS externo

2. **Logo login: emoji 🏢 → `<img src="/logo-rayhsa.png">`**
   - El archivo `logo-rayhsa.png` existe en `modules/portal/frontend/public/`
   - `height: 80px, width: auto, objectFit: contain, display: block, margin: 0 auto`
   - `onError` oculta el `<img>` si no carga (no muestra imagen rota)
   - Se mantienen el `<h1>{NOMBRE_EMPRESA}</h1>` y el `<p>` de subtítulo

3. **Filtrado de menú por permisos — 3 capas:**

   **Backend — nuevo endpoint `GET /api/permisos/mis-permisos`** (autenticado con `verificarToken`)
   - Modelo: `Permiso.obtenerPorUsuarioId(usuarioId)` — JOIN completo:
     `usuario_rol → roles → rol_opcion_permisos → modulo_opciones → modulos`
   - Retorna: `[{ modulo: string, opcion: string, tipo: string }]`
   - Ruta registrada **antes** de `/rol/:rol_id` en el router para evitar que Express capture "mis-permisos" como `:rol_id`

   **Frontend main.jsx — cargar permisos tras autenticación**
   - `useEffect` adicional: fetch a `/api/permisos/mis-permisos` usando `solicitar()` (helper interno del proyecto)
   - Estado: `permisos = []`, se pasa como prop `permisos={permisos}` a `<MenuDinamico>`

   **Frontend MenuDinamico.jsx — anotar + filtrar SUB_RUTAS**
   - Cada entrada de `SUB_RUTAS` tiene campo `opcion`: nombre exacto de `modulo_opciones.nombre` del seed (o `null` si no requiere permiso específico, e.g. Dashboard)
   - Función `tieneAcceso(moduloNombre, opcion)`:
     - `super_admin` → siempre `true`
     - `opcion === null` → siempre `true`
     - `permisos.length === 0` → `true` (fallback: permisos aún cargando, evita menú vacío)
     - Caso normal: `permisos.some(p => p.modulo.toLowerCase() === modulo && p.opcion === opcion)`
   - El bloque `ADMIN_ITEMS` conserva su lógica original intacta

4. **Comparación módulo: case-insensitive (`toLowerCase()`), opción: case-sensitive**
   - Los nombres de módulos pueden tener inconsistencias de case en el seed; las opciones son exactas

**Revisión:** APROBADO CON OBSERVACIONES — sin bugs bloqueantes (revisor 2026-04-29)
- Observación 1 (baja): guard defensivo `p?.modulo?.toLowerCase()` — mejora futura
- Observación 2 (baja): contenedor del logo login sigue ocupando espacio en caso de error — mejora futura

**Archivos creados/modificados:**
- `modules/portal/frontend/components/MenuDinamico.jsx`
- `modules/portal/frontend/pages/PortalLogin.jsx`
- `modules/portal/frontend/main.jsx`
- `modules/portal/backend/models/permiso.model.js`
- `modules/portal/backend/controllers/permiso.controller.js`
- `modules/portal/backend/routes/permiso.routes.js`

---

### [2026-05-13] orquestador — Fix dashboard RH (3 SQL bugs) + CSS página Permisos

**Contexto:** El dashboard RH mostraba "Error al obtener el dashboard" al cargar. La página de Permisos/Ausencias no tenía estilos visuales (clases CSS usadas en JSX sin definición CSS).

**Decisiones tomadas:**

1. **3 bugs SQL en `rh.dashboard.controller.js` (causa raíz del error):**
   - `permisos_ausencia` (singular) → `permisos_ausencias` (plural) — tabla real tiene 's'
   - `e.apellido` → `e.apellido_paterno` — la tabla `empleados` usa `apellido_paterno` desde la migración 001
   - `GROUP BY departamento` → `LEFT JOIN departamentos d ON d.id = e.departamento_id ... GROUP BY d.nombre` — `departamento` no existe como columna, solo `departamento_id` (FK normalizada)

2. **Mismo bug en `permisoAusencia.model.js` (detectado por revisor, corregido por orquestador):**
   - 6 ocurrencias de `permisos_ausencia` → `permisos_ausencias` (INSERT, 3×SELECT, UPDATE, COUNT)
   - 2 ocurrencias de `e.apellido` → `e.apellido_paterno` en joins con `empleados`
   - **Lección:** Cuando se corrige un nombre de tabla, buscar en TODO el código backend que referencia esa tabla

3. **CSS para Permisos — nuevo archivo `modules/rh/frontend/styles/permisos.css`**
   - Crea y define 15 clases: `.rh-admin-page`, `.admin-filtros`, `.filtros-grupo`, `.permisos-lista`, `.lista-encabezado`, `.permisos-tabla`, `.badge`, `.badge-pendiente/.aprobado/.rechazado`, `.boton-aprobar/.rechazar`, `.paginacion`, `.permisos-vacios`, `.cargando`
   - Usa variables CSS del sistema (`var(--color-primario)`, `var(--color-borde)`, etc.)
   - Colores semánticos de badges son fijos (verde suave / amarillo / rojo claro) — no variables del sistema
   - Importado en `RHAdminPage.jsx` con `import "../styles/permisos.css"`

4. **Bug adicional en `RHDashboard.jsx` — URL de fetch incorrecta (causa real del error en producción)**
   - El componente usaba `fetch` manual con `VITE_API_URL_RH || VITE_API_URL || 'http://localhost:4002'`
   - Ninguna de esas variables está definida en `.env` → fallback a puerto 4002 que no existe
   - El backend está en puerto 4000 con prefijo `/api` → URL correcta es `http://localhost:4000/api/rh/dashboard`
   - Solución: reemplazar `fetch` manual por `solicitar('/rh/dashboard')` (patrón estándar del proyecto)
   - Regla: **NUNCA usar `VITE_API_URL_RH` ni fetch manual en páginas RH** — siempre `solicitar()` de `utils/api.js`

**Revisión:** APROBADO — bug URL dashboard corregido post-revisión.

**Archivos creados/modificados:**
- `modules/rh/backend/controllers/rh.dashboard.controller.js` — 3 SQL bugs
- `modules/rh/backend/models/permisoAusencia.model.js` — 6 tabla + 2 apellido corregidos
- `modules/rh/frontend/pages/RHDashboard.jsx` — fetch manual → solicitar()
- `modules/rh/frontend/styles/permisos.css` (NUEVO)
- `modules/rh/frontend/pages/RHAdminPage.jsx` — import CSS agregado

---

### [2026-04-29] orquestador — Fix bugs admin/roles/sidebar + CSS vacaciones

**Contexto:** 5 problemas reportados en el portal admin y módulo RH:
1. Botón Resetear Clave falla con 404 — ruta faltante en backend
2. Página de Roles no carga — endpoint incorrecto en frontend
3. Botón Editar usuarios — handler ya existía y funcionaba (sin cambio necesario)
4. Sidebar muestra módulos aunque el usuario no tenga acceso a ninguna sub-ruta
5. VacacionesPage y VacacionesListadoPage usan colores hardcodeados sin variables CSS

**Decisiones tomadas:**

1. **`POST /api/usuarios/:id/reset-password` — solo faltaba registrar la ruta**
   - El handler `resetearPassword` YA existía en `usuario.controller.js` (genera contraseña temporal, hashea con bcrypt, actualiza BD, retorna `contrasena_temporal`)
   - Se registró la ruta en `usuario.routes.js` con el middleware correcto
   - La ruta va ANTES de otras rutas con `:id` para evitar captura por Express

2. **Roles no cargaba — URL incorrecta en frontend**
   - `PortalAdminRoles.jsx` llamaba `solicitar('/permisos')` → endpoint inexistente
   - Corregido a `solicitar('/permisos/opciones')` → endpoint correcto (`GET /api/permisos/opciones`)

3. **`rol.routes.js` — orden de rutas corregido**
   - `PUT /:id/permisos` registrado ANTES de `PUT /:id` para que Express no capture "permisos" como valor del parámetro `:id`

4. **Sidebar: filtrado a nivel de módulo completo**
   - `MenuDinamico.jsx`: nueva variable `modulosVisibles` filtra `modulos` antes del `.map()`
   - Lógica: módulo visible si tiene al menos una sub-ruta accesible para el usuario
   - Módulos sin SUB_RUTAS configuradas siempre visibles (fallback seguro)
   - `ADMIN_ITEMS` conserva su lógica original intacta
   - Respeta el fallback: `permisos.length === 0` → `tieneAcceso` retorna `true` → todos los módulos visibles mientras cargan los permisos

5. **CSS vacaciones — variables CSS en lugar de hex hardcodeados**
   - `VacacionesPage.jsx` y `VacacionesListadoPage.jsx`: constantes de estilo movidas fuera del componente (patrón EmpleadoPage)
   - Reemplazados `#007bff`, `#28a745`, `#dc3545` etc. por `var(--color-primario)`, `var(--color-exito)`, `var(--color-error)`
   - Sin refactor de estructura — misma lógica, solo estilos consistentes con el sistema de diseño

**Revisión:** APROBADO — sin bugs bloqueantes (revisor 2026-04-29)

**Archivos modificados:**
- `modules/portal/backend/routes/usuario.routes.js` — +ruta reset-password
- `modules/portal/backend/routes/rol.routes.js` — orden de rutas corregido
- `modules/portal/frontend/pages/PortalAdminRoles.jsx` — URL permisos corregida
- `modules/portal/frontend/components/MenuDinamico.jsx` — filtrado módulos completos
- `modules/rh/frontend/pages/VacacionesPage.jsx` — variables CSS
- `modules/rh/frontend/pages/VacacionesListadoPage.jsx` — variables CSS

---

### [2026-05-15] orquestador — Módulo Comercial: Solicitudes de Crédito (Fase 1)

**Contexto:** El usuario pidió desarrollar un módulo comercial completo para captura de solicitudes de crédito con formulario dinámico (Industria/Distribución), edición post-captura, auditoría, impresión PDF e integración MBA3. El módulo comercial ya existía parcialmente en la BD (inactivo) y en MenuDinamico (iconos/rutas registradas pero sin SUB_RUTAS ni páginas).

**Investigación previa:**
- MBA3_API.pdf no pudo leerse (herramientas PDF ausentes), pero sí existe `MBA3_API.md` con spec completa — leído en sesión 2026-05-15
- Módulo `comercial` ya existe en tabla `modulos` con `activo = false`
- `ICONOS_MODULOS` y `RUTAS_MODULOS` en MenuDinamico.jsx ya tienen entradas para `comercial`
- No existe directorio `modules/comercial/` — hay que crearlo desde cero
- No hay librería PDF instalada — se usará `window.print()` (CSS @media print) como primera aproximación; puppeteer se agrega después cuando haya acceso al spec del PDF original

**Decisiones tomadas:**

1. **Estructura de directorios — espejo exacto de módulo RH**
   ```
   modules/comercial/
   ├── backend/
   │   ├── migrations/
   │   ├── models/
   │   ├── controllers/
   │   └── routes/
   └── frontend/
       ├── pages/
       ├── services/
       └── styles/
   ```

2. **Tabla principal `solicitudes_credito` con columnas JSONB para arrays**
   - Campos simples: `id` (UUID), `numero_solicitud` (VARCHAR generado SC-YYYY-NNNN), `razon_social`, `rfc`, `tipo_cliente` (INDUSTRIA/DISTRIBUCION), `sucursal`, `regimen_fiscal`, `moneda` (USD/MN), `giro_negocio`, `metodo_pago`, `uso_cfdi`, `forma_pago` (array vía JSONB), `estado` (borrador/guardada/enviada_mba3/aprobada/rechazada)
   - Campos JSONB: `domicilio_fiscal`, `domicilio_entrega`, `datos_bancarios_nacionales`, `datos_bancarios_extranjeros`, `condiciones_comerciales`, `contactos`, `referencias_comerciales`
   - Auditoría interna: `usuario_creador_id`, `usuario_ultimo_cambio_id`, `fecha_creacion`, `fecha_ultimo_cambio`
   - MBA3: `sincronizado_mba3` BOOLEAN DEFAULT false, `referencia_mba3` VARCHAR nullable
   - **Por qué JSONB para arrays:** Los datos bancarios, contactos y referencias no se consultan en JOIN ni necesitan normalización — son estructuras cerradas que se muestran en bloque en el PDF/formulario. Evita complejidad de 4 tablas adicionales con FKs.

3. **Activación del módulo en BD — migración dedicada**
   - `modules/comercial/backend/migrations/001-activar-modulo-solicitudes.sql`
   - `UPDATE modulos SET activo = true WHERE nombre = 'comercial'`
   - `INSERT INTO modulo_opciones`: 'Solicitudes de Crédito' (orden 1)
   - `INSERT INTO rol_opcion_permisos`: super_admin y portal_admin → consulta + edicion
   - Se agrega el mismo bloque al `config/database/init.sql` para instalaciones nuevas

4. **Backend — rutas registradas en app.js**
   - Prefijo: `/api/comercial`
   - CRUD: `GET /solicitudes`, `POST /solicitudes`, `GET /solicitudes/:id`, `PUT /solicitudes/:id`
   - Acciones: `PUT /solicitudes/:id/estado` (cambiar estado)
   - PDF: `GET /solicitudes/:id/pdf-html` (retorna HTML para imprimir)
   - MBA3: `POST /solicitudes/:id/sincronizar-mba3` (stub — retorna 501 con mensaje pendiente)
   - `verificarPermiso('comercial', 'Solicitudes de Crédito', 'consulta/edicion')`

5. **Frontend — 3 páginas + 1 CSS**
   - `ComercialDashboard.jsx` → `/comercial` — KPIs simples (total, por estado, por tipo_cliente)
   - `SolicitudCreditoForm.jsx` → `/comercial/creditos/nueva` y `/comercial/creditos/:id/editar` — formulario 7 pestañas
   - `SolicitudesListado.jsx` → `/comercial/creditos` — tabla con búsqueda por RFC/razón social, acciones editar/PDF
   - `comercial.css` — clases propias del módulo (`.credito-tabs`, `.credito-tab-content`, `.credito-badge`, etc.)

6. **Formulario multipestaña — comportamiento dinámico**
   - Estado global del form en un objeto con todos los campos
   - Pestaña activa controlada por `useState`
   - Tabs 4, 5 muestran campos distintos según `formulario.tipo_cliente`
   - Arrays dinámicos (bancarios, contactos, referencias) con botones Agregar/Eliminar fila
   - Validación por pestaña al intentar avanzar (`validarPestana(n)`)
   - **NO se requiere guardar en BD al navegar entre pestañas** — solo al hacer submit final
   - localStorage para autoguardado de borrador (clave: `credito_borrador`)

7. **Impresión PDF — window.print() primera fase**
   - Botón "Imprimir/PDF" en la pestaña 7 llama `window.print()`
   - CSS `@media print` en `comercial.css` oculta tabs, sidebar, botones y muestra solo datos
   - Layout de impresión: encabezado Rayhsa + secciones ordenadas + líneas de firma
   - Segunda fase (cuando haya spec): backend con puppeteer genera PDF server-side

8. **MBA3 — stub documentado**
   - Endpoint `POST /solicitudes/:id/sincronizar-mba3` retorna `{ exito: false, mensaje: 'Integración MBA3 pendiente de especificación de API' }`
   - Comentario en el código indica los campos que se mapearán cuando llegue la documentación
   - Estado `enviada_mba3` no se activa en el stub

9. **MenuDinamico.jsx — agregar SUB_RUTAS comercial**
   ```js
   comercial: [
     { path: '/comercial', label: 'Dashboard', opcion: null },
     { path: '/comercial/creditos', label: 'Solicitudes de Crédito', opcion: 'Solicitudes de Crédito' },
   ]
   ```

10. **Auditoría** — `registrarAccion(req, 'comercial', 'solicitudes_credito', id, accion, previo, nuevo)` en crear, actualizar y cambiar estado

**Restricciones aceptadas:**
- MBA3 no implementado (spec en PDF no legible)
- PDF server-side no implementado (puppeteer no instalado)
- La validación RFC se hace solo por formato (13 chars) — sin consumo de API SAT en esta fase

**Archivos a crear:**
- `modules/comercial/backend/migrations/001-activar-modulo-solicitudes.sql`
- `modules/comercial/backend/models/solicitudCredito.model.js`
- `modules/comercial/backend/controllers/solicitudCredito.controller.js`
- `modules/comercial/backend/routes/solicitudesCredito.routes.js`
- `modules/comercial/frontend/pages/ComercialDashboard.jsx`
- `modules/comercial/frontend/pages/SolicitudCreditoForm.jsx`
- `modules/comercial/frontend/pages/SolicitudesListado.jsx`
- `modules/comercial/frontend/services/solicitudesCredito.service.js`
- `modules/comercial/frontend/styles/comercial.css`

**Archivos a modificar:**
- `config/database/init.sql` — agregar tabla solicitudes_credito + activar módulo + permisos
- `modules/portal/backend/app.js` — registrar rutas `/api/comercial`
- `modules/portal/frontend/main.jsx` — imports + rutas React para /comercial/*
- `modules/portal/frontend/components/MenuDinamico.jsx` — agregar SUB_RUTAS.comercial
