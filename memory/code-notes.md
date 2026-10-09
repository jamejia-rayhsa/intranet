# code-notes — Memory Palace

### [2026-05-15] orquestador — Docker: volúmenes de frontend son explícitos por módulo

**Trampa:** El backend monta `./modules` completo (`- ./modules:/app/modules`), por lo que cualquier módulo nuevo queda disponible automáticamente dentro del contenedor. El frontend NO — monta cada módulo por separado.

**Síntoma:** Error Vite `Failed to resolve import "../../comercial/frontend/pages/..."` aunque el archivo sí existe en el host. El contenedor sencillamente no lo ve.

**Causa:** `docker-compose.dev.yml` servicio `frontend`, sección `volumes`, lista explícita:
```yaml
volumes:
  - ./modules/portal/frontend:/app/modules/portal/frontend
  - ./modules/auditoria/frontend:/app/modules/auditoria/frontend
  - ./modules/tickets/frontend:/app/modules/tickets/frontend
  - ./modules/rh/frontend:/app/modules/rh/frontend
  # ← módulos nuevos deben agregarse aquí
```

**Fix:** Agregar una línea por cada módulo frontend nuevo y recrear el contenedor:
```bash
docker compose -f docker-compose.dev.yml up -d --no-deps frontend
```

**Regla:** Cada vez que se cree un módulo nuevo con directorio `frontend/`, agregar su volumen en `docker-compose.dev.yml` ANTES de intentar levantar el frontend.

---

### [2026-05-15] orquestador — CSS: clase pagina-contenedor no existe en el proyecto

**Trampa:** La clase `pagina-contenedor` se usa como wrapper externo en los tres pages del módulo comercial (`SolicitudCreditoForm.jsx`, `SolicitudesListado.jsx`, `ComercialDashboard.jsx`) pero NO estaba definida en ningún archivo CSS del proyecto — ni en `globales.css` ni en `comercial.css`.

**Síntoma:** La página de registro de solicitud no tenía ningún contenedor aplicado: sin max-width, sin margen centrado, sin padding. El contenido se pegaba al borde izquierdo y se extendía hasta el 100% del ancho.

**Causa:** El patrón de RH usa inline styles para el wrapper externo (`style={{ maxWidth: "900px", margin: "0 auto", padding: "1.5rem" }}`). Al crear el módulo comercial se usó una clase CSS en su lugar, pero la clase nunca se definió.

**Fix:** Agregar al inicio de `comercial.css` (después del comentario de encabezado):
```css
.pagina-contenedor {
  max-width: 1100px;
  margin: 0 auto;
  padding: 1.5rem;
}
```

**Regla:** Si un módulo nuevo usa `className="pagina-contenedor"`, asegurarse de que esa clase esté definida en su CSS local. No existe una clase global con ese nombre — cada módulo que la use debe definirla en su propio CSS de módulo.

---

### [2026-05-15] coder — Módulo Comercial: Solicitudes de Crédito (Fase 1)

**Decisión de código:** Implementación completa del módulo comercial con 13 archivos creados o modificados.

Archivos creados:
- `modules/comercial/backend/migrations/001-activar-modulo-solicitudes.sql` — activa módulo, crea tabla, trigger, opción y permisos
- `modules/comercial/backend/models/solicitudCredito.model.js` — CRUD + estadísticas con filtros dinámicos y JSONB
- `modules/comercial/backend/controllers/solicitudCredito.controller.js` — 7 handlers con auditoría en crear/actualizar/cambiarEstado
- `modules/comercial/backend/routes/solicitudesCredito.routes.js` — 8 rutas; `GET /estadisticas` va ANTES de `GET /:id` para evitar que Express capture "estadisticas" como UUID
- `modules/comercial/frontend/styles/comercial.css` — 20+ bloques de estilos con variables CSS + @media print para PDF
- `modules/comercial/frontend/services/solicitudesCredito.service.js` — 6 funciones usando `solicitar()` de `../../../portal/frontend/utils/api`
- `modules/comercial/frontend/pages/ComercialDashboard.jsx` — KPIs de estadísticas
- `modules/comercial/frontend/pages/SolicitudesListado.jsx` — tabla filtrable con badges de estado
- `modules/comercial/frontend/pages/SolicitudCreditoForm.jsx` — formulario 7 pestañas con autoguardado en localStorage

Archivos modificados:
- `modules/portal/backend/app.js` — `app.use('/api/comercial/solicitudes', ...)` después de auditoria
- `modules/portal/frontend/components/MenuDinamico.jsx` — `SUB_RUTAS.comercial` con Dashboard y Solicitudes de Crédito
- `modules/portal/frontend/main.jsx` — 3 imports + 4 rutas React bajo `/comercial/*`
- `config/database/init.sql` — `comercial` activado (`true`), tabla + trigger + permisos al final

**Trampa evitada:** En el router de solicitudes, `GET /estadisticas` DEBE ir antes de `GET /:id`. Si va después, Express intenta parsear "estadisticas" como UUID y la ruta falla silenciosamente devolviendo 404. Mismo patrón documentado para `/mis-permisos` vs `/:rol_id` en code-notes.md [2026-04-29].

**Trampa evitada:** El trigger `CREATE TRIGGER trigger_numero_solicitud` usa `CREATE OR REPLACE TRIGGER` en init.sql (idempotente) pero `CREATE TRIGGER` en la migración (no idempotente — la migración se ejecuta una sola vez). En init.sql se usa `CREATE OR REPLACE` para que no falle en re-ejecuciones.

**Trampa evitada:** `AuditoriaService` exporta un objeto, no funciones individuales. La destructuración `const { registrarAccion } = require(...)` funciona porque `registrarAccion` es una propiedad del objeto exportado como `module.exports = AuditoriaService`. Verificar contra otros controllers como `vacaciones.controller.js:4` que usan el mismo patrón.

**Trampa evitada:** En `solicitudCredito.model.js → actualizar()`, `fecha_ultimo_cambio = NOW()` no consume un slot de `$N` en los params de PostgreSQL. El `params.push(id)` que viene inmediatamente después es el parámetro del `WHERE id = $${idx}`. El orden es: procesar campos → push usuario_id ($N) → push sin placeholder para NOW() → push id ($N+1). El WHERE usa `$${idx}` donde `idx = N+1` post-incremento. Es correcto pero antiintuitivo.

**Patrón reusable:** Import de `solicitar()` desde el directorio `modules/comercial/frontend/` usa path `'../../../portal/frontend/utils/api'`. La profundidad es 3 niveles (pages/ o services/ → frontend/ → comercial/ → modules/) antes de llegar a portal. Confirmar contra otros módulos: `modules/rh/frontend/services/vacaciones.service.js` usa el mismo path de 3 niveles `'../../../portal/frontend/utils/api'`.

**Patrón reusable:** El formulario multipestaña usa estado global `formulario` con un objeto plano. Los arrays dinámicos (bancarios, contactos, referencias) se actualizan con funciones `actualizar*` que hacen spread del array y reemplazan el elemento en el índice. Los campos JSONB anidados (domicilios, condiciones_comerciales) tienen su propia función `actualizarDomicilio` / `actualizarCondicion` que hace spread del objeto anidado. (SolicitudCreditoForm.jsx)

### [2026-05-13] coder — Fix dashboard RH (3 SQL bugs) + CSS permisos

**Decisión de código:** Corrección de 3 bugs críticos en `rh.dashboard.controller.js` y creación del sistema CSS para la página de permisos/ausencias.

Archivos modificados:
- `modules/rh/backend/controllers/rh.dashboard.controller.js` — 3 bugs SQL corregidos:
  - (Bug 1) `FROM permisos_ausencia` → `FROM permisos_ausencias` (2 ocurrencias: COUNT y JOIN). El nombre correcto de la tabla es en plural, consistente con el resto del modelo de datos.
  - (Bug 2) `e.apellido` → `e.apellido_paterno` en la query de permisos pendientes. La tabla `empleados` no tiene columna `apellido` — la columna correcta es `apellido_paterno` (documentado en decisions.md "bug crítico corregido").
  - (Bug 3) `SELECT COALESCE(departamento, ...) GROUP BY departamento` → query reescrita con `LEFT JOIN departamentos d ON d.id = e.departamento_id` y `COALESCE(d.nombre, 'Sin departamento') GROUP BY d.nombre`. La tabla `empleados` solo tiene `departamento_id` (FK), no una columna `departamento` desnormalizada.
- `modules/rh/frontend/styles/permisos.css` — NUEVO. Archivo CSS con 17 bloques de estilos usando variables CSS del sistema (`var(--color-primario)`, `var(--color-fondo)`, `var(--color-borde)`, `var(--color-texto)`, `var(--color-texto-claro)`, `var(--sombra-tarjeta)`). Cubre: layout página, filtros, tabla, badges de estatus, botones aprobar/rechazar, paginación, estado vacío y estado cargando.
- `modules/rh/frontend/pages/RHAdminPage.jsx` — Agregado `import "../styles/permisos.css"` como último import (línea 7), antes del primer `const` del componente.

**Trampa evitada:** El nombre de la tabla en la BD es `permisos_ausencias` (plural), pero el controller la referenciaba como `permisos_ausencia` (singular). Este tipo de error no falla en tiempo de compilación — solo genera un error en runtime cuando se ejecuta el `Promise.all`. Verificar el nombre exacto de las tablas contra las migraciones SQL antes de escribir queries.

**Trampa evitada:** `departamento` como columna directa en `empleados` no existe — es un diseño normalizado con FK `departamento_id`. La query original intentaba hacer `GROUP BY departamento` que PostgreSQL rechaza con "column does not exist". El JOIN con la tabla `departamentos` es el patrón correcto y también habilita el COALESCE del nombre legible.

**Patrón reusable:** Archivos CSS de módulo van en `modules/<modulo>/frontend/styles/<nombre>.css` e importan con path relativo `"../styles/<nombre>.css"` desde las páginas. El directorio `styles/` se crea implícitamente al crear el primer archivo (no requiere `mkdir` explícito en Vite).

### [2026-04-29] coder — Fix bugs admin/roles/sidebar + CSS vacaciones

**Decisión de código:** Implementé 5 tareas de corrección de bugs y mejora de estilos.

Archivos modificados:
- `modules/portal/backend/routes/usuario.routes.js` — Agregada ruta `POST /:id/reset-password` ANTES de `/:id/rol`. El handler `resetearPassword` ya existía en el controller pero no estaba registrado como ruta — por eso daba 404. Middleware: `verificarPermiso('portal', 'Usuarios', 'edicion')` igual que las demás rutas de edición.
- `modules/portal/backend/routes/rol.routes.js` — Agregada ruta `PUT /:id/permisos` ANTES de `PUT /:id` para que Express no lo capture como actualizarRol. Handler: `ControladorRol.asignarPermisos` (ya existía en el controller pero no estaba registrado).
- `modules/portal/frontend/pages/PortalAdminRoles.jsx` — `solicitar('/permisos')` → `solicitar('/permisos/opciones')`. El endpoint `GET /api/permisos` no existe; el correcto es `GET /api/permisos/opciones` (registrado en permiso.routes.js línea 15).
- `modules/portal/frontend/components/MenuDinamico.jsx` — Agregado filtrado de módulos completos antes del `.map()`: `modulosVisibles = modulosActivos.filter(m => subRutas.some(sr => tieneAcceso(...)))`. Módulos sin sub-rutas en `SUB_RUTAS` siempre se muestran. `ADMIN_ITEMS` intacto.
- `modules/rh/frontend/pages/VacacionesPage.jsx` — Constantes de estilo (`estiloSeccion`, `estiloTituloSeccion`, `estiloInput`, `estiloLabel`, `estiloBotonPrimario`) movidas FUERA del componente (antes del `export default`), siguiendo el patrón de EmpleadoPage.jsx líneas 37-57. Botón submit refactorizado a usar `{ ...estiloBotonPrimario, cursor: ..., opacity: ... }`.
- `modules/rh/frontend/pages/VacacionesListadoPage.jsx` — Ídem: constantes `estiloInput`, `estiloBtnPrimario`, `estiloCard`, `estiloFiltros` movidas fuera del componente. Secciones de filtros y tabla usan las constantes en lugar de estilos inline repetidos.

**Trampa evitada:** En `rol.routes.js`, `PUT /:id/permisos` DEBE ir antes de `PUT /:id`. Si va después, Express captura la URL `/5/permisos` y la pasa al handler `actualizar` con `req.params.id = "5"` — el string "permisos" nunca llega al router porque Express ya capturó `:id`. Mismo patrón que el problema de `GET /mis-permisos` vs `GET /rol/:rol_id` documentado en la entrada anterior.

**Trampa evitada:** `resetearPassword` en `usuario.controller.js` ya estaba implementado (líneas 143-182) con una contraseña aleatoria de 8 caracteres (`Math.random().toString(36).slice(-8)`) y `requiere_cambio_password: true`. NO reimplementé — solo registré la ruta. El frontend (`PortalAdminUsuarios.jsx`) ya tenía el modal completo para mostrar la contraseña temporal.

**Trampa evitada:** En `MenuDinamico.jsx`, `tieneAcceso` es una declaración `function` (no expresión/arrow), por lo que es hoisted y está disponible cuando `modulosVisibles` se calcula, aunque aparezca después en el código fuente. Esto es correcto en JS pero puede confundir a quien lea el código linealmente.

**Trampa evitada:** `solicitar('/permisos')` resulta en `GET /api/permisos` — ruta que no existe. La ruta correcta es `/api/permisos/opciones`. Este es el tipo de bug silencioso: el `Promise.all` en `cargarDatos()` falla y el `catch` solo hace `console.error`, así que la página muestra la tabla vacía sin mensaje de error al usuario.

**Patrón reusable:** Constantes de estilo estáticas (sin lógica dinámica) van fuera del componente. Constantes con lógica dinámica (que dependen de estado/props) van dentro. Ejemplo: `estiloBotonPrimario` va fuera; `{ ...estiloBotonPrimario, opacity: enviando ? 0.7 : 1 }` se construye inline en el JSX. (VacacionesPage.jsx y VacacionesListadoPage.jsx)

### [2026-04-29] coder — Logo sidebar, logo login, filtrado permisos menú

**Decisión de código:** Implementé 3 mejoras en los componentes del portal.

Archivos modificados:
- `modules/portal/frontend/components/MenuDinamico.jsx` — (1) Logo: `height` 38px → 42px. (2) Contenedor `.sidebar-logo` con `display:flex,justifyContent:center,alignItems:center` inline para centrado explícito independiente de CSS global. (3) Prop `permisos=[]` añadida al componente. (4) Campo `opcion` añadido a cada entrada de `SUB_RUTAS` con el nombre exacto de `modulo_opciones` del seed. (5) Función `tieneAcceso(moduloNombre, opcion)` con fallback: si `permisos.length===0` retorna `true` (no rompe UX durante carga). (6) Filtro `.filter(sr => tieneAcceso(m.nombre, sr.opcion))` antes del `.map()` de sub-rutas. `ADMIN_ITEMS` intacto.
- `modules/portal/frontend/pages/PortalLogin.jsx` — Bloque emoji 🏢 reemplazado por `<img src="/logo-rayhsa.png">` con `height:80px`, `objectFit:contain` y `onError` que oculta la imagen (no interrumpe el flujo si no carga).
- `modules/portal/frontend/main.jsx` — Import de `solicitar` de `utils/api`. Estado `permisos` añadido. Llamada a `solicitar('/permisos/mis-permisos')` en el mismo `useEffect` que carga módulos. Prop `permisos={permisos}` pasada a `<MenuDinamico>`.
- `modules/portal/backend/models/permiso.model.js` — Método estático `obtenerPorUsuarioId(usuarioId)` añadido al objeto `Permiso`. JOIN entre `usuario_rol`, `roles`, `rol_opcion_permisos`, `modulo_opciones`, `modulos`. Retorna `{modulo, opcion, tipo}` para cada permiso del usuario.
- `modules/portal/backend/controllers/permiso.controller.js` — Handler `misPermisos(req, res)` añadido. Usa `Permiso.obtenerPorUsuarioId(req.user.usuario_id)`.
- `modules/portal/backend/routes/permiso.routes.js` — Import de `ControladorPermiso`. Ruta `GET /mis-permisos` registrada ANTES de `GET /rol/:rol_id` para evitar que `:rol_id` atrape la cadena literal "mis-permisos". `router.use(authenticateJWT)` ya cubre toda la ruta — no se añade middleware duplicado.

**Trampa evitada:** La ruta `GET /mis-permisos` DEBE estar antes de `GET /rol/:rol_id` en el router. Express evalúa rutas en orden de definición; si `:rol_id` va primero, "mis-permisos" se interpreta como un `rol_id` con valor "mis-permisos", causando un error de base de datos.

**Trampa evitada:** El helper `solicitar` de `utils/api.js` lee el token de `localStorage.getItem("token")` internamente. No hay que extraer el token del contexto ni pasarlo manualmente. Este es el patrón del proyecto — usado también por `vacaciones.service.js` y otros servicios.

**Trampa evitada:** El campo `opcion` en `SUB_RUTAS` usa los nombres EXACTOS de `modulo_opciones` (case-sensitive en la comparación): "Empleados", "Permisos", "Vacaciones", "Tickets", "Categorías" (con tilde), "Encuestas", "Logs", "Noticias". Cualquier diferencia de mayúsculas o tildes rompe el filtro silenciosamente.

**Trampa evitada:** `Puestos`, `Departamentos` y `Ubicaciones` no tienen su propia `modulo_opcion` en el seed — se asignan a `opcion: 'Empleados'` porque son datos maestros de la gestión de empleados. Si en el futuro se crean opciones separadas, actualizar solo `SUB_RUTAS`.

**Patrón reusable:** El fallback `if (permisos.length === 0) return true` en `tieneAcceso` garantiza que mientras los permisos cargan (fetch asíncrono), el usuario siempre ve el menú completo. Cuando el fetch completa y `permisos` se llena, React re-renderiza y aplica el filtro real. (MenuDinamico.jsx línea 135)

### [2026-04-29] coder — Combos unificados, title case, nivel_salarial

**Decisión de código:** Implementé centralización de catálogos, title case en nombres y eliminación de nivel_salarial de la capa de aplicación.

Archivos modificados:
- `modules/rh/frontend/constants/catalogos.js` — Añadidas 4 constantes nuevas al final: `GENEROS` (3 opciones), `ESTADOS_CIVILES` (6), `NIVELES_ESCOLARIDAD` (8), `TIPOS_CONTRATO` (6). Las opciones de TIPOS_CONTRATO son en Título Case (ej. "Prácticas") — esto unifica los valores que antes diferían entre los dos forms (EmpleadoPage tenía "Determinado/Indeterminado", ProfileCard tenía "indefinido/temporal/por_obra").
- `modules/rh/frontend/pages/EmpleadoPage.jsx` — Import ampliado con 4 nuevas constantes. Los selects de `genero`, `estado_civil`, `escolaridad` y `tipo_contrato` migrados de opciones hardcodeadas a catálogos. Añadida función `manejarBlurNombre` (dentro del componente, para acceder a `setFormulario`) con `onBlur` en los 3 campos de nombre.
- `modules/rh/frontend/components/EmpleadoProfileCard.jsx` — Import ampliado. Selects inline de `genero`, `estado_civil`, `escolaridad` y `tipo_contrato` reemplazados por `<CampoSelect>`. Función `manejarBlurNombre` añadida. Componente `Campo` extendido con prop `onBlur`. `onBlur={manejarBlurNombre}` añadido a los 3 campos de nombre.
- `modules/rh/frontend/pages/PuestosPage.jsx` — Eliminado campo `nivel_salarial` del: estado inicial, reset en manejarEnvio, reset en botón "Nuevo Puesto", función `editar()`, JSX del formulario (label+input), `<th>` de la tabla y `<td>` de filas.
- `modules/rh/backend/models/puesto.model.js` — `crear()`: quitado `nivel_salarial` del destructuring, del INSERT y del array de valores ($4 eliminado). `actualizar()`: quitado el bloque `if (datos.nivel_salarial !== undefined)`.

**Trampa evitada:** `manejarBlurNombre` NO puede ser función de nivel de módulo (como `soloDigitos`) porque necesita acceder a `setFormulario` del estado React. Se define dentro del componente. `soloDigitos` sí puede ser de módulo porque solo muta `e.target.value` sin tocar el estado.

**Trampa evitada:** Al unificar los valores de los selects, los empleados existentes en BD con valores del formato antiguo (ej. "indefinido", "soltero", "masculino" en minúsculas, o "Bachillerato" vs "Preparatoria / Bachillerato") verán el campo vacío en el select al editar (el valor no coincide con ninguna opción). Esto es una inconsistencia de datos preexistente documentada por el investigador, no un bug nuevo. El usuario deberá actualizar esos registros manualmente.

**Trampa evitada:** El controller de puesto (`puesto.controller.js`) pasa `req.body` directamente al modelo sin desestructurar — no fue necesario modificarlo. El modelo ya no usa `nivel_salarial` aunque llegue en el body, por lo que el backend es tolerante hacia clientes que aún envíen el campo.

**Patrón reusable:** `CampoSelect` acepta array de strings planos como `opciones`. El valor guardado en BD ES el string exacto de la opción. Para catálogos con FK (departamentos, puestos) se siguen usando selects inline con objetos `{id, nombre}`. (EmpleadoProfileCard.jsx — función `CampoSelect`)


### [2026-04-29] coder — Validaciones y combos formularios empleado

**Decisión de código:** Implementé validaciones HTML5 nativas y selects con catálogos en los dos formularios de empleado del módulo RH. Archivos tocados:

- `modules/rh/frontend/constants/catalogos.js` — NUEVO. Exporta `ESTADOS_MEXICO` (32 estados) y `BANCOS_MEXICO` (23 bancos). Compartido por ambos formularios para mantener los datos sincronizados en un solo lugar.
- `modules/rh/frontend/pages/EmpleadoPage.jsx` — Formulario de ALTA: import de catálogos, helper `soloDigitos` a nivel de módulo (fuera del componente), campos `estado_nacimiento` y `estado_residencia` convertidos de `<input>` a `<select>` con `ESTADOS_MEXICO`, campo `banco` convertido a `<select>` con `BANCOS_MEXICO`, validaciones (`maxLength`, `minLength`, `pattern`, `title`, `onInput={soloDigitos}`) añadidas a CURP(18), RFC(13), NSS(11 dígitos), celular_personal(10 tel), celular_corporativo(10 tel), telefono_emergencia(10 tel), codigo_postal(5 dígitos), clabe(18 dígitos), cp_fiscal(5 dígitos).
- `modules/rh/frontend/components/EmpleadoProfileCard.jsx` — Formulario de EDICIÓN: import de catálogos, componente `Campo` extendido con props `minLength`, `pattern`, `title`, `onInput`, nuevo componente `CampoSelect` (label + select con opciones string), helper `soloDigitos`. Campos `estado_nacimiento`, `estado_residencia` y `banco` reemplazados por `<CampoSelect>`. Mismas validaciones numéricas en NSS, CURP, RFC, celulares, CLABE, CP, CP fiscal.

**Trampa evitada:** El componente `Campo` en EmpleadoProfileCard ya tenía un `maxLength={10}` hardcodeado en el campo `codigo_postal` — se cambió a `maxLength={5}` (correcto para CP mexicano) y se añadió `onInput={soloDigitos}`. El CP fiscal también tenía `maxLength={10}` incorrecto — corregido a 5.

**Trampa evitada:** `soloDigitos` usa `e.target.value = ...` (mutación directa) en lugar de `setState`. Funciona con `onInput` (evento nativo del DOM que dispara antes que `onChange`). NO usar en campos como CURP y RFC que admiten letras — solo en campos puramente numéricos (NSS, teléfonos, CLABE, CP).

**Trampa evitada:** El pattern del CURP en el componente `Campo` de ProfileCard se pasa como string sin doble barra (`\d` no `\\d`) porque JSX interpreta el atributo como string literal dentro de las llaves — a diferencia del HTML puro donde se escribe directamente en el atributo. En EmpleadoPage.jsx los patterns en JSX dentro de strings de atributo también usan una sola barra.

**Patrón reusable:** `CampoSelect` acepta un array de strings planos como `opciones` (no objetos `{id, nombre}`). Esto funciona para catálogos como estados y bancos donde el valor guardado en BD ES el nombre. Para catálogos con FK (departamentos, puestos, jefes) se siguen usando `<select>` inline con objetos. (EmpleadoProfileCard.jsx línea 691)

### [2026-04-29] coder — Alta empleado: sincronización 40 campos

**Decisión de código:** Sincronicé el formulario de alta de empleado con el esquema completo de la tabla `empleados`. Archivos modificados:

- `modules/rh/backend/models/empleado.model.js` — método `crear()` ampliado de 12 campos a 38. INSERT explícito con `$1`–`$38`. Campos opcionales con `|| null`; `estatus` con `|| "activo"`.
- `modules/rh/backend/controllers/empleado.controller.js` — desestructuración completa de `req.body` (31 campos nuevos). Corregido `apellido` → `apellido_paterno` en validación, en `Usuario.crear()` y en `Empleado.crear()`. Mensaje de validación actualizado a "Nombre y apellido paterno son obligatorios".
- `modules/rh/frontend/pages/EmpleadoPage.jsx` — formulario modal rediseñado con 7 secciones scrollables (Datos básicos, Laborales, Personales, Contacto, Domicilio, Financieros, Acceso). Estado inicial (`formularioInicial`) extraído a constante para reutilizar en el reset. `empleadosJefes` cargado junto con los catálogos en `cargarCatalogos()`. Columna "Nombre" en tabla corregida: `{empleado.apellido}` → `{empleado.apellido_paterno}`.

**Bugs corregidos:**
1. `apellido` → `apellido_paterno` en controller (línea 14, 57, 60, 91, 124) y frontend (líneas 49, 172, 334–335, 906): el formulario de alta volcaba apellido_paterno a NULL en BD porque el field name no coincidía con la columna.
2. `{empleado.apellido}` → `{empleado.apellido_paterno}` en la tabla de listado (línea 906 del JSX nuevo): la columna mostraba undefined para todos los empleados.

**Trampa evitada:** El modelo `Usuario.crear()` sigue esperando el campo `apellido` (no `apellido_paterno`). En el controller se hace el mapping explícito: `apellido: apellido_paterno` para no romper la creación de usuario. NO cambiar el modelo de usuario.

**Trampa evitada:** `cargarCatalogos()` se llama una sola vez en `useEffect` inicial (junto con `cargarRoles()`). Añadir la llamada a `obtenerEmpleados` para jefes dentro del mismo `Promise.all` evita un fetch extra y mantiene consistencia.

**Patrón reusable:** El estado inicial del formulario se extrae a `const formularioInicial = { ... }` fuera del componente. El reset en `manejarEnvio` usa `{ ...formularioInicial, fecha_ingreso: new Date()... }` para no repetir el objeto completo. (EmpleadoPage.jsx línea 43)

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

### [2026-10-08] coder — Fase 2 paso 6: consolidación de pools pg
**Decisión de código:** auditoria/config/database.js ahora importa `grupo` de portal (igual que tickets/rh) y conserva su `probarConexion`; auditoria.model.js importa `grupo` de `../config/database` (sin Pool propio). Fallback `POSTGRES_DB` pasa de `intranet_dev` a `postgres` en portal/config/database.js y portal/scripts/migrar.js (este último conserva su Pool independiente, es un script).
**Trampa evitada:** auditoria.model.js tenía su propio Pool idéntico (2 pools extra por proceso); verificado `grupo` === en los 3 módulos. READMEs de portal y auditoria aún mencionan `-d intranet_dev` en comandos psql (fuera de alcance, no tocados).
**Patrón reusable:** `module.exports = { grupo, probarConexion }` sobre `require("../../../portal/backend/config/database")` (modules/tickets/backend/config/database.js:1).

### [2026-10-08] coder — Fase 2: app apuntada al Postgres de Supabase (solo infra Docker/env)
**Decisión de código:** `docker-compose.{dev,staging,prod}.yml` incluyen `docker-compose.supabase.yml` con `include:` (dev suma `docker-compose.supabase.dev.yml`, que publica supabase-db en `127.0.0.1:${POSTGRES_PORT:-5432}`). Se eliminaron `postgres`, `pgadmin` (dev) y volúmenes `postgres_data_*`. Backend: `POSTGRES_HOST=supabase-db`, `POSTGRES_DB=postgres`, `POSTGRES_USER=postgres`, `depends_on: supabase-db-init: service_completed_successfully`. Nuevo one-shot `supabase-db-init` (docker-compose.supabase.yml): si no existe `public.usuarios` carga `init.sql` (ON_ERROR_STOP), siempre aplica `004-rls-deny-all.sql`. Redes: `internal` declarada en dev y prod (staging ya la tenía). `.env.dev` con bloque SUPABASE_* de desarrollo; `.env.staging.example` actualizado; creado `.env.prod.example` (el .gitignore ya lo permitía, no existía el archivo).
**Trampa evitada:** en `command:` de compose, `$` del shell se escribe `$$` (si no, compose lo interpola). El `name:` del supabase.yml incluido no afecta: manda el del archivo raíz (dev=`intranet` por directorio, staging=`intranet-staging`); ojo: en staging y prod los volúmenes de Supabase quedan con prefijo del proyecto raíz. Los `container_name` fijos de supabase chocarían si se levantan dos proyectos a la vez (la prueba aislada usó una copia sin ellos). Para el entrypoint del one-shot se sobreescribe `entrypoint: ["/bin/sh","-ec"]` porque la imagen de Supabase trae su propio docker-entrypoint.
**Patrón reusable:** include con lista de archivos para overrides por entorno (docker-compose.dev.yml:1-20); init idempotente con `to_regclass('public.usuarios')` (docker-compose.supabase.yml, servicio supabase-db-init). Verificado: `config -q` OK en dev/staging/prod; init en DB vacía -> 28 tablas, 28 con RLS; segunda ejecución sale 0, omite init.sql, datos sin cambios (7 usuarios/10 roles/16 calc). Restaurar dump: antes del primer `up` completo o con psql contra supabase-db. Pendiente (otro coder/orquestador): volumen `intranet_postgres_data_dev` antiguo y contenedores `intranet_postgres_dev`/`intranet_pgadmin_dev` siguen en el host sin tocar; `.env.dev` aún trae `JWT_SECRET` propio (auth actual sigue vigente).

### [2026-10-08] coder — Fase 3B: migración de usuarios a GoTrue + escritura doble en usuario.controller
**Decisión de código:** `scripts/migrar-usuarios-supabase.js` (exporta `parsearArgs/leerPendientes/planificar/migrarUno/ejecutar`; `--dry-run`, `--only`, `--limit`; script npm `db:migrar-usuarios-supabase`). Importa el hash bcrypt tal cual (sin normalizar `$2b`→`$2a`: Go bcrypt acepta cualquier minor; NO verificado contra un GoTrue real, si lo rechaza normalizar en `migrarUno`). ms365 se crea sin password; locales sin hash se omiten. El correo se envía en minúsculas a GoTrue. Idempotencia: `UPDATE ... AND auth_uid IS NULL`; si rowCount=0 y se acababa de crear, se elimina el usuario GoTrue. 422/409 en crear => buscar y vincular. `usuario.controller.js`: alta crea en GoTrue primero (`passwordHash`), INSERT con `auth_uid`, compensación `eliminarUsuario` si falla; `actualizar` con `contraseña` y `resetearPassword` escriben GoTrue + hash local (sin `auth_uid`: solo local + `console.warn` sin datos sensibles); temporal de 12 chars con `crypto.randomInt`; `eliminar` borra también en GoTrue (best-effort, warn si falla); `sinSecretos()` quita `hash_password` y `auth_uid` de las respuestas obtener/crear/actualizar.
**Trampa evitada:** `obtener` devolvía `buscarPorId` completo (incluía el hash; el coder A lo quitó del modelo y además se filtra en el controlador). `main()` del script hace `require` del servicio de forma perezosa y solo en ejecución directa, para poder testear con mocks. Errores de conexión solo imprimen `code` y `message` (no credenciales).
**Pendiente:** el endpoint `actualizar` NO acepta cambio de correo; si se agrega, sincronizar en GoTrue (el contrato `supabaseAdmin` no tiene función; hay un TODO en el controlador). Desactivar usuario (`activo=false`) no toca GoTrue: depende de que el middleware rechace `activo=false` (no se modificó ni se verificó el middleware del coder A en esta tarea; sí se verificó que `actualizar` solo cambia la columna local).
**Patrón reusable:** mocks `jest.mock('../config/database')` + modelo + servicio (tests/usuario.controller.test.js, tests/migrar-usuarios-supabase.test.js); tests de scripts raíz importan `../../../../scripts/...`.

### [2026-10-08] coder — Fase 3A: Supabase Auth en backend (middleware dual, servicio admin, auth_uid, hash fuera de la API)
**Decisión de código:**
- Migración `portal/migrations/005-auth-uid.sql` (+ columna en `init.sql`, + mount/psql en `supabase-db-init`). Sin FK a `auth.users` a propósito (el esquema `auth` no existe cuando init.sql corre en instalaciones previas).
- `services/supabaseAdmin.service.js`: fetch nativo (Node 24 en Dockerfile.backend), timeout 10 s con `AbortSignal.timeout`, errores con `.status` (red/timeout -> 503). `buscarPorCorreo` pagina `/admin/users` (GoTrue no filtra por email en el Admin API) hasta 50 000 usuarios.
- `middleware/auth.middleware.js`: 1) verifica con `SUPABASE_JWT_SECRET` (HS256, aud authenticated); 2) si no verifica y `AUTH_LEGACY_ENABLED !== "false"`, flujo legado idéntico; 3) token Supabase válido pero usuario no registrado -> 403, inactivo -> 403 (NO cae al flujo legado). Vinculación por correo con `UPDATE ... WHERE auth_uid IS NULL` + relectura por si otra petición vinculó en paralelo. Error de DB en la ruta Supabase responde 500 (el legado conserva su 401 de siempre). `req.user` añade `auth_uid`. Exporta `soloLegacy` (404 `{exito:false,mensaje}`) usado en registro, inicio-sesion, ms365, ms365/callback y renovar.
- `usuario.model.js` (cambio mínimo, avisar a B): constante `COLUMNAS_PUBLICAS`; `buscarPorId` y `buscarPorCorreo` ya NO devuelven `hash_password` (antes `buscarPorCorreo` era `SELECT *`); nuevos `buscarPorIdConHash`, `buscarPorCorreoConHash` (solo para verificar contraseñas), `actualizarAuthUid`; `crear` acepta `auth_uid`.
- `auth.service.registroLocal`: GoTrue primero con `passwordHash`, luego INSERT local con `auth_uid`; si falla el INSERT se elimina el de GoTrue. `auth.controller.cambiarPassword`: GoTrue primero (si hay `auth_uid`), luego local; si el local falla intenta restaurar la contraseña anterior en GoTrue. `/auth/perfil` ya no expone el hash.
- Compose dev/staging/prod: `SUPABASE_JWT_SECRET`, `SUPABASE_AUTH_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_LEGACY_ENABLED` y `depends_on: supabase-auth: service_healthy`; flag documentada en `.env.staging.example`/`.env.prod.example`. Verificado `config -q` en los tres.
**Trampa evitada:**
- Cualquier caller que dependiera de `buscarPorId`/`buscarPorCorreo` con hash: solo auth.controller.cambiarPassword y auth.service.inicioSesionLocal (migrados a los `...ConHash`). rh `empleado.controller` y `usuario.controller` solo usan existencia/datos públicos.
- Si el token Supabase es válido pero el usuario no existe, no se prueba el flujo legado (evita 401 engañoso).
- `callbackMS365` legado crea usuarios locales sin GoTrue: se vinculan por correo al primer token Supabase, pero solo si existen también en GoTrue (Fase 4/B migra).
**Patrón reusable:** tests con `jest.mock('../config/database')` como `tests/permisos.middleware.test.js:3`; tests sin DB en `tests/auth.middleware.test.js` y `tests/supabaseAdmin.service.test.js` (fetch mockeado en `global.fetch`). Ejecutar: `npx jest modules/portal/backend/tests` desde la raíz.
**Seguimiento:** `eliminar` mantiene local-primero con comentario; `auth_uid`/hash se filtran en la capa de respuesta con `utils/sinSecretos.js` (perfil, login, registro; `auth.service` ya no incluye `auth_uid` en login); COLUMNAS_PUBLICAS intacto; frontend sin usos de `auth_uid`; tests nuevos de eliminar/actualizar y auth.respuestas.

### [2026-10-08] coder — Fase 4B: cableado infra del frontend con supabase-js (mismo origen)
**Decisión de código:** vite.config.js proxies `^/auth/v1(/|$)` -> supabase-auth:9999 y `^/storage/v1(/|$)` -> supabase-storage:5000 (rewrite quita prefijo, `changeOrigin:false`, `xfwd`, storage con `X-Forwarded-Prefix: /storage/v1`). Dockerfile.frontend: ARG/ENV `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL` (vacío = mismo origen), `VITE_MS365_LOGIN=false`. Compose dev (environment) y prod (build.args) pasan `SUPABASE_ANON_KEY` y `AZURE_AD_ENABLED`. `scripts/staging/publicar-ghcr.sh` lee SUPABASE_ANON_KEY/AZURE_AD_ENABLED del entorno o `.env.staging` (ENV_FILE) y aborta con mensaje si falta la anon key; encabezado de docker-compose.staging.yml documenta que la key se hornea en la imagen. `.env.dev` ya era correcto (PUBLIC_URL/SITE_URL :3000, REDIRECT_URLS .../auth/callback; GOTRUE_URI_ALLOW_LIST lee SUPABASE_REDIRECT_URLS).
**Trampa evitada:** clave de proxy como regex con `(/|$)` para que `/auth/callback` (ruta SPA) no caiga en el proxy; `changeOrigin:false` preserva Host (GoTrue usa API_EXTERNAL_URL). Hay que republicar la imagen de staging si cambia la anon key (JWT secret rotado). Buildx avisa SecretsUsedInArgOrEnv: falso positivo (anon key pública).
**Patrón reusable:** headers de proxy espejados de config/nginx/nginx.spa.conf:20-42. Validado: `config -q` dev/staging/prod, `node --check`, build de la imagen production OK. `nginx -t` suelto falla por upstream `backend` (preexistente, solo resuelve en la red compose). Vite proxy no probado en vivo.

### [2026-10-08] coder — Fase 4A: frontend sobre Supabase Auth (GoTrue)
**Decisión de código:** `lib/supabase.js` (cliente PKCE, mismo origen), `utils/token.js` (`obtenerToken()` única fuente), `AuthContext` reescrito (`usuario, cargando, errorAuth, iniciarSesion(correo, contraseña), iniciarSesionMicrosoft, cerrarSesion, recargarPerfil`), `pages/AuthCallback.jsx` + ruta pública `/auth/callback`, botón Microsoft en login bajo `VITE_MS365_LOGIN==='true'`, registro hace `signInWithPassword` tras el alta (404 -> "registro deshabilitado"), cambiar-password llama `recargarPerfil()` y navega a `/` (ya no cierra sesión). `utils/api.js` ahora adjunta `error.status` a los errores para distinguir 401/403/404.
**Trampa evitada:** (1) Había 5 lectores más de `localStorage["token"]` fuera del portal que el brief no listaba: `rh/.../expediente.service.js`, `tickets/.../adjuntos.service.js`, `tickets/.../TicketsDashboard.jsx`, `auditoria/.../AuditoriaPage.jsx` y `AuditoriaDashboard.jsx`; migrados a `obtenerToken()` (import relativo `../../../portal/frontend/utils/token`). Sin esto habrían mandado `Bearer null`. (2) `iniciarSesion` del contexto espera el perfil antes de resolver, para que `navigate('/')` no rebote en `RutaProtegida` con `usuario` aún nulo. (3) `onAuthStateChange` difiere con `setTimeout` y solo recarga el perfil si cambió el uid (evita recargas en cada refocus/refresh de token, que re-disparaban los efectos de `LayoutConMenu`). (4) `AuthCallback` espera `cargando===false` del contexto (no solo la sesión) antes de navegar.
**Patrón reusable:** fetch directo con token: `const token = await obtenerToken()` (ver `services/noticias.service.js`, `pages/PermisosAdminPage.jsx` helper `cabecerasAuth`). Errores del login se muestran desde `error || location.state?.error || errorAuth` (`pages/PortalLogin.jsx`). Solo queda `localStorage.removeItem("token")` en `context/AuthContext.jsx` (el resto de localStorage es el borrador de `SolicitudCreditoForm`, no token). Verificado: `VITE_SUPABASE_ANON_KEY=dummy npx vite build` OK; no hay tests de frontend.

### [2026-10-08] coder — Fase 5A: servicio compartido de Storage + noticias
**Decisión de código:** `modules/portal/backend/services/storage.service.js` (BUCKETS, subir, urlFirmada, urlPublica, eliminar, existe, asegurarBuckets, claveSegura) con el patrón de supabaseAdmin.service.js; `asegurarBuckets()` se invoca en `app.js` tras `probarConexion` (no fatal, reintento a 10 s). Noticias: multer memoryStorage; `ruta_archivo` guarda solo la clave; el modelo añade `imagenes[].url` (urlPublica) cuando no empieza con `/uploads/` (`conUrls` en noticia.model.js); el POST de imagen también devuelve `url`. Al subir, si falla el INSERT se borra el objeto; al borrar noticia/imagen se limpian objetos (fallo = console.warn). Se eliminó `express.static("/uploads")`. Frontend: `utils/storage.js: urlImagenNoticia` en 5 componentes (incluido CarruselNoticias.jsx, no listado en la tarea); `API_BASE` eliminado. Tests: tests/storage.service.test.js.
**Trampa evitada:** claves con acentos/espacios/`#` (claveSegura NFD + ASCII; subir codifica por segmento conservando `/`); `existe` usa HEAD `/object/info/...` tolerando 400/404 (la API de Storage a veces devuelve 400 para objeto inexistente; no verificado en vivo); URL firmada de Storage viene sin `/storage/v1`, se antepone. `Content-Type` JSON solo se fuerza para cuerpos objeto, no Buffer.
**Patrón reusable:** `solicitar(metodo, ruta, {cuerpo, cabeceras, timeout, tolerar})` (storage.service.js) para status tolerados; tests con `global.fetch = jest.fn()` como supabaseAdmin.service.test.js. Pendiente: filas legadas `/uploads/noticias/...` las resuelve el script de migración (C); `vite.config.js` aún proxifica `/uploads` (sin tocar).

### [2026-10-08] coder — Fase 5B: RH expedientes y recibos a Supabase Storage
**Decisión de código:** `upload.middleware.js` usa `multer.memoryStorage()` (fileFilter/límites/`TIPO_NO_VALIDO` intactos); `archivo.service.js` de RH queda solo con `validarTipo*` (se quitó el código de disco). Clave = `<empleadoId>/<claveSegura(original)>` en `rh-expedientes`/`rh-recibos`; `ruta_archivo` guarda la clave. Nuevos `GET /api/expediente/:id/url` y `GET /api/recibos/:id/url` (URL firmada 300 s, `descargar`; recibos usan `recibo-<periodo>.pdf`). Fila legada `/uploads/...` -> 409; sin archivo -> 404. Eliminar: borra objeto (warn sin datos sensibles si falla; se omite en filas legadas) y fila. Frontend: `obtenerUrlDocumento`/`obtenerUrlRecibo` + `window.open(url,"_blank","noopener")` en `PerfilPage.jsx` y `RecibosNominaList.jsx`. Tests: `modules/rh/backend/tests/archivos.storage.test.js` (9, storage mockeado).
**Trampa evitada:** (1) La autorización actual NO filtra por empleado propietario: ni listados ni `obtener` de expediente/recibos lo hacen, solo `verificarPermiso("rh","Expedientes"|"Recibos","consulta")` en la ruta (`expediente.routes.js:12`, `recibos.routes.js:12-24`); los `/url` replican exactamente ese permiso (no se abre ni se cierra acceso; si se quiere pertenencia por empleado es cambio de política aparte). (2) `empleadoId` entra a la clave: se valida `^\d+$` antes de subir (evita `../` y objetos huérfanos si el INSERT falla). (3) `GET /:id/url` va antes de `GET /:id` en recibos. (4) `git stash` para comparar tests rompe el trabajo de coders paralelos: no usarlo.
**Patrón reusable:** controlador + `storage.service` importado vía `require("../../../portal/backend/services/storage.service")`; mock con `jest.mock(ruta, factory, {virtual:true})` en `archivos.storage.test.js`. Falla preexistente no relacionada: `modules/rh/tests/empleado.controller.test.js` (2 tests de validación) ya fallaba antes.

### [2026-10-08] coder — Fase 5C: adjuntos de tickets en Storage, script de migración de archivos y cableado compose
**Decisión de código:** Tickets: `upload.middleware.js` usa `multer.memoryStorage()` (mismo fileFilter y 10 MB); `adjunto.controller.js` sube a `BUCKETS.TICKETS` con clave `${ticketId}/${claveSegura(original)}` y guarda esa clave en `ruta_archivo`; si falla el INSERT limpia el objeto; `eliminar` hace `console.warn` (solo id del adjunto, sin clave) si Storage falla y borra la fila igual; filas legadas `/uploads/` no llaman a Storage. Nuevo `GET /api/adjuntos/:id/url` (`adjuntos.routes.js`) -> `{url, nombre_archivo, expira_en:300}`; fila legada -> 409 "Archivo pendiente de migración a Storage". `archivo.service.js` perdió los helpers de disco (ya sin uso). Frontend: `abrirAdjunto(id)` en `adjuntos.service.js` (solicitar + `window.open(url,"_blank","noopener")`); `TicketDetail.jsx` ya no enlaza `ruta_archivo` (usa `<a href="#">` con preventDefault para conservar el CSS `.adjunto-item a`). `scripts/migrar-archivos-storage.js` (+ `npm run db:migrar-archivos-storage`) exporta `planificarTabla/migrarFila/ejecutar/parsearArgs/inferirMime/hayProblemas`. Compose dev/staging/prod: `SUPABASE_STORAGE_URL` + `depends_on supabase-storage healthy`; staging/prod montan `uploads_data:/app/uploads:ro` (+ volumen top-level) y el encabezado documenta el comando de migración.
**Autorización replicada (sin acceso nuevo):** el listado de adjuntos solo exige `authenticateJWT` + `verificarPermiso("tickets","Adjuntos","consulta")` (`adjuntos.routes.js:12`); `/:id/url` usa exactamente lo mismo. NO existe chequeo por ticket (solicitante/técnico) ni en adjuntos ni en `ticket.controller.obtener` (~L124-140); solo `listar` filtra por `usuario_id` a no-admins (L103-109). Es una limitación preexistente (cualquier usuario con permiso de consulta puede ver adjuntos de cualquier ticket por id); la URL firmada no la agrava, pero conviene endurecerla aparte.
**Trampa evitada:** (1) `GET /:ticketId` y `GET /:id/url` no chocan (distinta profundidad). (2) En el script, `UPDATE ... AND ruta_archivo=$vieja` + rowCount 0 => otra ejecución ya migró: se borra el objeto sobrante. (3) Rutas con `..` o fuera de `/uploads/<carpeta>/` se tratan como faltantes (no se leen). (4) `--dry-run` no llama `asegurarBuckets()` (crearía buckets). (5) Huérfanos en disco = archivos sin fila legada pendiente; incluyen los ya migrados (el origen nunca se borra) y no es exacto con `--limit`. (6) En staging/prod el volumen `uploads_data` nace VACÍO (antes los uploads vivían en el FS del contenedor): hay que copiar ahí los archivos viejos antes de migrar; en dev el volumen ya existente se reutiliza. (7) Dev no monta `./scripts`: pasar `-v $PWD/scripts:/app/scripts:ro`.
**Patrón reusable:** tests de controlador con `jest.mock(storage.service)` + modelo + auditoría (`modules/tickets/backend/tests/adjunto.controller.test.js`); verificación de permisos de ruta inspeccionando `router.stack` con `verificarPermiso` mockeado (mismo archivo, último describe); tests de scripts raíz con `../../../../scripts/...` y pg/fs/storage inyectados (`tests/migrar-archivos-storage.test.js`). Verificado: `npx jest modules/tickets` 30/30; script con `POSTGRES_PORT=5999` sale 1 con "ECONNREFUSED"; `config -q` OK en dev/staging/prod; build de Vite OK.
- Seguimiento 5B (2026-10-08): `init.sql` tenía `recibos_nomina` sin 5 columnas del modelo y `ruta_archivo NOT NULL`; corregido en `init.sql` + migración idempotente `modules/rh/backend/migrations/007-recibos-nomina-columnas.sql` (aplicada siempre desde `supabase-db-init`; verificada en postgres:16 desechable: init limpio, forma vieja corregida, 2.ª ejecución OK, INSERT del modelo OK). También `listarPorPeriodo` usaba `e.apellido` (inexistente) -> `e.apellido_paterno`; `PerfilPage` usaba `doc.fecha_carga` -> `fecha_subida`. Subida: si el INSERT falla se elimina el objeto (warn sin datos) y se re-lanza el error original (expediente y recibos). Trampa: comparar INSERT/UPDATE de modelos contra el esquema cargado en un postgres real detecta deriva que los mocks no ven.

### [2026-10-08] coder — Fase 6A: autorización por propietario (recibos, expedientes, tickets)
**Decisión de código:** `tienePermiso(user, modulo, opcion, tipo)` en portal `permisos.middleware.js` (misma semántica que `verificarPermiso`; este no se tocó). RH backend: `middleware/acceso-empleado.middleware.js` (`accesoEmpleado({opcion, obtenerEmpleadoId, soloRH})`, `validarId`, `validarPeriodo`) cableado en `routes/recibos.routes.js` y `routes/expediente.routes.js` tras `verificarPermiso(consulta)`. RH = `tienePermiso(...,'edicion')` (incluye super_admin); dueño = `Empleado.obtenerPorUsuarioId`. No-RH con recurso inexistente/ajeno/sin empleado vinculado: 403 uniforme; RH pasa y el controlador responde 404. Tickets: `utils/acceso-ticket.js` (`esAdminTickets` = predicado exacto de `listar`, `puedeAccederTicket`), `middleware/acceso-ticket.middleware.js` para adjuntos y comentarios, y chequeo en `ticket.controller.obtener` (ya tiene el ticket cargado). Migración `rh/008-permisos-propios-rh-empleado.sql` (Expedientes:consulta a rh_empleado) en init.sql y en `supabase-db-init`.
**Trampa evitada:** cualquier test que monte las rutas RH con mock de `permisos.middleware` debe incluir `tienePermiso` en el mock (si no, 500; se ajustó `archivos.storage.test.js`). Los permisos en tickets usan `req.user.roles/permisos` (no `rol_nombre`/`rol_id`): no mezclar los dos modelos. Validar id numérico va ANTES del chequeo de acceso (400 no revela existencia). Comentarios/ticket: un `ticketId` no numérico daba 500, ahora 400.
**Patrón reusable:** middleware que recibe un resolver `(req) => dueño` (acceso-empleado.middleware.js, acceso-ticket.middleware.js); denegación = `console.warn` con `usuario_id` y recurso, sin `registrarAccion` (lecturas). Tests: `modules/rh/backend/tests/acceso-empleado.test.js`, `modules/tickets/backend/tests/acceso-ticket.test.js`, `tienePermiso` en `modules/portal/backend/tests/permisos.middleware.test.js`.
**Pendientes (no cubiertos):** RH `GET /empleados/:id` y listados, hijos, `vacaciones` (solicitudes de otros), `permisos` de ausencia, dashboard RH; tickets `GET /:ticketId/encuesta`, `PUT /:id/estado|asignar` y `DELETE /:id` (solo exigen edicion, sin propiedad), `POST /adjuntos/:ticketId` y `DELETE /adjuntos/:id` (edicion sin propiedad), dashboards de tickets. Verificar si la UI de empleado llama endpoints que ahora devuelven 403 (p.ej. `/recibos/periodo`).

### [2026-10-08] coder — Fase 6B: retirado el auth legado (backend portal, frontend, env/compose, tests)
**Decisión de código:**
- Backend portal: eliminados `services/ms365.service.js`, `services/jwt.service.js` y `services/auth.service.js` completo (tras quitar login/registro/recuperar/tokens no quedaba nada; un archivo vacío no aporta). `routes/auth.routes.js` = solo `GET /perfil` y `POST /cambiar-password`. `middleware/auth.middleware.js` exporta solo `authenticateJWT` (sin rama legada, `soloLegacy`, `autorizar`; `autorizar` solo la usaba su test obsoleto). `portal.permissions.js` limpiado.
- Contraseñas solo en GoTrue: `cambiarPassword` valida la actual con `supabaseAdmin.iniciarSesion(usuario.correo, actual)` (400/401/422 de GoTrue = "La contraseña actual es incorrecta"; 503/timeout se propaga sin confundirse con credenciales malas), luego `actualizarPassword` y solo `requiere_cambio_password=false` en local. `crear` usa `password` (ya no `passwordHash`) y no escribe `hash_password`; `actualizar`/`resetearPassword` escriben solo en GoTrue y responden 409 si el usuario no tiene `auth_uid` (antes escribían "solo local" y ya no hay nada local que escribir). Compensaciones conservadas: alta (GoTrue primero, si falla INSERT se elimina de GoTrue) y eliminar (local primero, GoTrue best-effort). `models/usuario.model.js`: fuera `buscarPorCorreoConHash`/`buscarPorIdConHash` y el `SET hash_password` de `actualizar`; `crear` aún acepta `hash_password` porque `modules/rh/backend/controllers/empleado.controller.js` lo pasa.
- Frontend: borrados `pages/PortalRegistro.jsx` y sus rutas/imports en `main.jsx`, `App.jsx` y `routes/portal.routes.js` (estos dos son código muerto, nadie los importa); `services/auth.service.js` solo `obtenerPerfil`; proxy `/uploads` fuera de `vite.config.js`; `localStorage.removeItem("token")` en `AuthContext.jsx` se conserva con comentario. `PortalLogin.jsx` no tenía enlace de registro.
- Env/compose: quitados `JWT_SECRET`, `JWT_EXPIRES_IN`, `AUTH_LEGACY_ENABLED`, `AZURE_AD_CLIENT_ID/TENANT_ID/REDIRECT_URI` del backend en dev/staging/prod/test compose, de `.env.dev`, `.env.test`, `.env.*.example` y de `JWT_SECRET` en `.github/workflows/docker-build-deploy.yml`. Los `.env*` versionados dejan `AZURE_AD_ENABLED/TENANT_ID/CLIENT_ID/CLIENT_SECRET` (los lee GoTrue). `.env` y `.env.staging` locales (no versionados) conservan variables viejas inofensivas.
- Tests: `auth.middleware.test.js` (token firmado con JWT_SECRET legado, otro secreto, audiencia errónea y alg none → 401 sin tocar BD), `auth.respuestas.test.js` reescrito (perfil, `cambiarPassword` actual correcta/incorrecta/GoTrue caído/sin auth_uid, rutas legadas 404 con supertest, solo quedan 2 rutas), `usuario.controller.test.js` (solo GoTrue en alta/reset/actualizar). Borrados los tests obsoletos de `modules/portal/tests/` (auth.controller, auth.integration, permisos.middleware con `autorizar`, noticias.integration que dependía de registro/login); esa carpeta ya estaba rota (rutas `../routes` inexistentes).
**Trampa evitada:**
- `bcrypt` y `axios` NO se desinstalaron: `axios` lo usa `modules/comercial/backend` (no es workspace; resuelve por hoisting desde portal) y `bcrypt` lo sigue importando `modules/rh/backend/controllers/empleado.controller.js` (que además crea el usuario local SIN cuenta en GoTrue y con `hash_password`: tras Fase 6 esos usuarios no pueden iniciar sesión; requiere que A/otro lo migre a `supabaseAdmin.crearUsuario`). Una vez migrado, `npm uninstall bcrypt --workspace=modules/portal/backend` (y quitar `hash_password` de `Usuario.crear`). `axios` conviene declararlo en el workspace que lo usa.
- `jest.clearAllMocks` no limpia `mockRejectedValue`: en `usuario.controller.test.js` hay `mockReset` de los mocks de supabaseAdmin en `beforeEach` o un rechazo se filtra al test siguiente.
- La columna `usuarios.hash_password` NO se tocó (la necesita `scripts/migrar-usuarios-supabase.js` para entornos aún sin migrar). Se puede eliminar (columna, script y `sinSecretos`) cuando todos los entornos estén migrados.
**Patrón reusable:** cliente GoTrue único en `services/supabaseAdmin.service.js` (errores con `.status`); validar credenciales actuales con `iniciarSesion` antes de cambiar contraseña (`controllers/auth.controller.js`); pruebas de rutas inexistentes montando el router real con supertest (`tests/auth.respuestas.test.js`).
**Seguimiento 6A (escrituras de tickets):** `PUT /:id/estado` = admin o técnico asignado (`puedeCambiarEstado`); `tecnico_id` del cuerpo solo se respeta si es admin (antes un técnico podía reasignar por esa vía); `PUT /:id/asignar` y `DELETE /:id` = `soloAdminTickets`; adjuntos POST/DELETE = `puedeAccederTicket`; encuesta POST = solo solicitante (ni admin), GET = `puedeAccederTicket`; ids numéricos 400; dashboard solo agregados (KPIs, conteos por mes/estado, top técnicos con calificación promedio), sin cambios. Hallazgo: `req.user.permisos` no se llena en auth.middleware, así que el "admin" real = super_admin/tickets_admin (la UI usa el mismo predicado y `tickets_tecnico` no ve los botones de estado: preexistente). Pendiente RH (sin tocar): `GET /empleados/:id` NO tiene `verificarPermiso` (cualquier autenticado lee cualquier empleado, con CLABE/NSS); `rh_empleado` del seed solo tiene Permisos consulta+edicion, Recibos y Expedientes consulta, por lo que `GET /permisos` y `/permisos/:id` pueden listar ausencias de otros; Empleados, hijos, dashboard y Vacaciones solo los tienen super_admin y rh_admin en el seed.
**Seguimiento (Fase 6B, 2.ª pasada):** `empleado.controller.crear` con `crear_usuario` ahora crea en GoTrue (contraseña del admin o temporal aleatoria de 12 caracteres devuelta una vez como `contraseña_temporal`), guarda `auth_uid`, marca `requiere_cambio_password=true` y compensa (elimina usuario local y de GoTrue) si falla cualquier paso posterior, incluida la creación del empleado. Generador extraído a `modules/portal/backend/utils/contrasenaTemporal.js` (lo comparten usuario.controller y empleado.controller). No hay import masivo que cree usuarios (grep). `bcrypt` desinstalado del workspace portal (nadie más lo requería; `scripts/migrar-usuarios-supabase.js` solo lee `hash_password` de la BD) y `hash_password` fuera de `Usuario.crear`. Los 2 tests preexistentes de `modules/rh/tests/empleado.controller.test.js` eran tautológicos (montaban un `express()` vacío y esperaban 401, recibían 404 y llamaban al campo `apellido`); la validación del controlador (`nombre` y `apellido_paterno`) es correcta, así que se reescribió el test contra el controlador real con mocks, más 5 tests del alta con usuario. CSS huérfano `.registro-contenedor` eliminado de `globales.css`. Trampa: `jest.resetAllMocks()` borra el `mockResolvedValue` de `registrarAccion`; se reasigna en `beforeEach`.
**Seguimiento 6A-2 (empleados, permisos de ausencia, vacaciones):** `acceso-empleado.middleware.js` ganó `opcionRH`/`tipoRH`/`permitirDueno`/`permitirSi` y `empleadoPropioEnPeticion` (fuerza o valida `empleado_id` de body/query). `GET /empleados/:id` = dueño o `Empleados:consulta` (antes abierto); `/hijos` y `/subordinados` mantienen `Empleados:consulta` + id numérico (la UI no usa subordinados: `obtenerSubordinados` sin consumidores; la fila trae CLABE/NSS, no se abre al jefe). Permisos de ausencia: "RH" = `Empleados:edicion` (NO `Permisos:edicion`, que tiene `rh_empleado` para solicitar); listar forzado al propio empleado, GET/:id dueño o RH, crear solo para sí (RH puede por otros), responder solo RH (la UI solo lo hace en RHAdminPage). Vacaciones: saldo/crear solo propio o RH; GET/:id dueño, jefe inmediato (`solicitud.jefe_inmediato_id`) o RH; responder jefe inmediato o RH, nunca el propio solicitante; `listar` ya no devuelve TODO a un usuario sin empleado vinculado (bug: caía sin filtro) y su `esAdmin` suma `Empleados:edicion`. Trampa: Express 5 `req.query` es getter, hay que redefinirlo para mutarlo. Abierto: `GET /empleados` lo sirve cualquier rol con `Empleados:consulta`; dashboard RH idem; permisos de ausencia no tienen flujo de jefe (solo RH responde); seed `rh/seeds/002` concede Vacaciones:edicion a rh_empleado (necesario, ahora acotado por propiedad).

### [2026-10-08] coder — Fase 6C: respaldos/restauración de Supabase y documentación
**Decisión de código:** `scripts/supabase/backup.sh` (pg_dump -Fc de public+auth+storage como `supabase_admin` dentro del contenedor; tar.gz del volumen de Storage con contenedor desechable `--network none`, volumen `:ro`; MANIFEST con imágenes, conteos y sha256; retención; cifrado opcional `openssl enc -aes-256-cbc -pbkdf2` con la frase por `-pass env:`; se construye en `.incompleto-*` y se renombra al final) y `scripts/supabase/restore.sh` (verifica sha256, confirmación `RESTAURAR`/`--yes`, para auth+storage, UNA transacción `TRUNCATE ... RESTART IDENTITY CASCADE` + `pg_restore --data-only --disable-triggers -f -` canalizado a `psql -1` como `supabase_admin`, vacía y extrae el volumen, compara conteos con el MANIFEST). Docs: `docs/supabase.md`, READMEs (raíz, portal, auditoría), `.claude/rules/core.md` y `backend/api.md`, `PLAN.md` (sección Supabase), `.gitignore` (`backups/`), `scripts/dev/{iniciar,detener}.sh`. Probado extremo a extremo en `-p ibk` (respaldo cifrado y sin cifrar -> `down -v` -> stack vacío -> restore): login del usuario OK (contraseña mala rechazada), conteos idénticos, objeto con mismo sha256 y content-type, secuencia continúa. Todo `ibk_*` eliminado; volúmenes `intranet_*` intactos.
**Trampa evitada:**
- Las imágenes de Supabase (postgres, storage) solo traen **busybox**: su `tar` no admite `--xattrs`, y el backend `file` de Storage guarda content-type/cache-control en xattrs `user.supabase.*`. Se usa `debian:bookworm-slim` (BACKUP_HELPER_IMAGE) con `--entrypoint tar`.
- Restaurar solo datos (no `--clean`): los esquemas auth/storage los crean las imágenes; se excluyen los datos de `auth.schema_migrations` y `storage.migrations` del dump para no pisar sus migraciones. El stack destino debe haber arrancado completo al menos una vez (el script lo comprueba).
- `pg_restore -f -` + `psql -1` en un solo flujo hace atómico el TRUNCATE+carga; con `postgres` falla (triggers del sistema), con `supabase_admin` por socket local no.
- `docker exec -i` dentro de un `while read` consumía el stdin del bucle (solo imprimía el primer conteo): `</dev/null` en las consultas del bucle.
- `find -regex '...\{8\}...'` no hace match con GNU find en `bash -c` (en la shell de la herramienta sí, porque `find` allí es otra implementación): usar `-name 'supabase-????????T??????Z'` y validar con regex de bash antes de `rm -rf`.
- `shellcheck` no está instalado: solo se verificó con `bash -n`.
**Patrón reusable:** variables de entorno `SUPABASE_DB_CONTAINER`/`SUPABASE_STORAGE_CONTAINER`/`SUPABASE_STORAGE_VOLUME` con defaults de dev (scripts/supabase/backup.sh:20-26); el volumen se autodetecta del montaje `/var/lib/storage`. Para probar sin tocar datos reales: `COMPOSE_PROJECT_NAME`/`-p ibk` y `down -v` solo de ese proyecto (los `container_name` son fijos, el stack real debe estar detenido). Pendiente documentado: la invocación de los scripts de migración dentro de la red del compose (`run --rm -v ./scripts:/app/scripts:ro backend node ...`) se propone en docs/supabase.md pero no se ejecutó aquí.
