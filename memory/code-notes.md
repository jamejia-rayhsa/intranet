# code-notes — Memory Palace

### [2026-04-28] coder — Listado separado vacaciones + seed

**Decisión de código:** Implementé separación de listado, visibilidad por rol y seed de datos. Archivos tocados:
- `modules/rh/backend/models/solicitudVacaciones.model.js` — reemplazado bloque `empleado_id`/`jefe_inmediato_id` por lógica `ver_todo`/`empleado_o_jefe_id`/`empleado_id` en `listar` y `contar`; agregado filtro `busqueda` con ILIKE en ambos métodos
- `modules/rh/backend/controllers/vacaciones.controller.js` — reescrito `listar` con detección de rol vía `req.user.rol_nombre`; corregido `req.user.id` → `req.user.usuario_id` en todos los métodos (JWT almacena `usuario_id`, no `id`)
- `modules/rh/frontend/pages/VacacionesPage.jsx` — eliminada sección 4, modal de rechazo, estados `pendientesJefe`/`modalRechazo`/`motivoRechazo`/`respondiendo` y funciones `handleAprobar`/`abrirModalRechazo`/`handleRechazar`; agregado enlace "Ver todas las solicitudes →" con `useNavigate`
- `modules/rh/frontend/pages/VacacionesListadoPage.jsx` — página nueva con filtros, tabla completa, modal de rechazo y lógica `puede_responder` delegada al backend
- `modules/portal/frontend/components/MenuDinamico.jsx` — agregada entrada `{ path: '/rh/vacaciones/listado', label: 'Solicitudes' }` en SUB_RUTAS.rh
- `modules/portal/frontend/main.jsx` — agregado import `VacacionesListadoPage` y ruta `/rh/vacaciones/listado` antes de `/rh/puestos`
- `modules/rh/frontend/services/vacaciones.service.js` — agregado parámetro `busqueda` en `listarSolicitudes`
- `modules/rh/backend/seeds/002-vacaciones-ejemplo.sql` — seed idempotente con empleados y solicitudes de ejemplo

**Trampa evitada:** `req.user` viene del JWT decodificado que almacena `usuario_id` (ver `jwt.service.js:6`), no `id`. El código anterior usaba `req.user.id` en todos los métodos del controlador — corregido a `req.user.usuario_id` en `obtenerSaldo`, `listar` y `responder`.

**Trampa evitada:** En el seed, `puestos` y `ubicaciones` NO tienen UNIQUE constraint en `nombre` (solo `departamentos` lo tiene). Se usó `INSERT ... WHERE NOT EXISTS` para `puestos`, `ubicaciones` y `empleados`; `ON CONFLICT (nombre) DO NOTHING` solo para `departamentos`. (init.sql:197-225)

**Trampa evitada:** Los usuarios de prueba son `@rayhsa.com.mx`, no `@empresa.com`. El seed de `001-semilla-inicial.sql` del portal usaba `@empresa.com` pero el `init.sql` canónico tiene `@rayhsa.com.mx`. El seed 002 usa `@rayhsa.com.mx`.

**Trampa evitada:** El filtro `empleado_o_jefe_id` usa el mismo parámetro `$N` DOS veces en la misma condición SQL (`empleado_id = $N OR jefe_inmediato_id = $N`). Esto es válido en PostgreSQL con `pg` porque el valor se agrega al array UNA sola vez y el placeholder se repite. (solicitudVacaciones.model.js — bloque `empleado_o_jefe_id`)

**Patrón reusable:** El campo `puede_responder` se calcula en el controller, no en el frontend. Esto evita que el cliente haga la lógica de permisos. El frontend solo lee `sol.puede_responder` para mostrar u ocultar botones. (vacaciones.controller.js — método `listar`)

### [2026-04-28] coder — Vacaciones RH

**Decisión de código:** Implementé el módulo completo de Vacaciones para el módulo RH. Archivos creados:
- `modules/rh/backend/migrations/002-solicitudes-vacaciones.sql` — tablas `tabla_calculo_vacaciones` y `solicitudes_vacaciones` con índices
- `modules/rh/backend/models/solicitudVacaciones.model.js` — modelo con cálculo de saldo on-the-fly
- `modules/rh/backend/controllers/vacaciones.controller.js` — 5 endpoints con auditoría y notificaciones
- `modules/rh/backend/routes/vacaciones.routes.js` — rutas bajo `/api/vacaciones`
- `modules/rh/frontend/services/vacaciones.service.js` — cliente fetch usando `solicitar` de utils/api
- `modules/rh/frontend/pages/VacacionesPage.jsx` — página con saldo, formulario, historial propio y gestión de subordinados

Archivos modificados:
- `modules/portal/backend/app.js` — agregada ruta `/api/vacaciones` después de `/api/permisos-rh`
- `modules/portal/frontend/components/MenuDinamico.jsx` — reemplazado `/rh/perfil` → `/rh/vacaciones`
- `modules/portal/frontend/main.jsx` — reemplazado import `PerfilPage` → `VacacionesPage` y ruta correspondiente

**Trampa evitada:** `PerfilPage.jsx` NO se borró — `EmpleadoPage.jsx` lo usa internamente vía `EmpleadoProfileCard`. El import en `main.jsx` se eliminó pero el archivo existe y sigue siendo usado.

**Trampa evitada:** El cálculo de traslape en el modelo usa `fecha_inicial <= $2 AND fecha_final >= $3` donde `$2=fechaFinal` y `$3=fechaInicial` — orden inverso intencional para detectar solapamiento correcto.

**Trampa evitada:** `calcularSaldo` usa require dinámico de `empleado.model` para evitar dependencia circular (SolicitudVacaciones ← Empleado ← posible circularidad si Empleado importara SolicitudVacaciones).

**Patrón reusable:** Servicio frontend sigue el patrón de `permisos.service.js` — importa `solicitar` de `../../../portal/frontend/utils/api` y construye URLSearchParams para filtros GET. (vacaciones.service.js:1)

**Patrón reusable:** Controlador sigue el patrón de `permisos.controller.js`: try/catch en cada método, auditoría en bloque try/catch separado para no abortar la respuesta si falla el log, notificaciones también en try/catch separado. (vacaciones.controller.js)

**Patrón reusable:** VacacionesPage muestra la sección de "solicitudes pendientes de mi equipo" solo cuando `pendientesJefe.length > 0`, evitando condicional de roles — el backend ya filtra por `jefe_inmediato_id` del empleado autenticado.
