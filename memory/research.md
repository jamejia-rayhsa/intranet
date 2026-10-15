# Investigación — Memory Palace

## [2026-04-29] investigador — Auditoría módulo RH: brecha alta empleado

**Pregunta:** ¿Está sincronizada la página de alta/edición de empleado con los ~30 campos nuevos añadidos a la migración 001 en sesión anterior?

**Hallazgo:**

### Estado por página RH

| Página | Estado | Descripción |
|--------|--------|-------------|
| EmpleadoPage.jsx | ⚠️ **DESACTUALIZADA** | Formulario de "Nuevo Empleado" sólo captura 9 campos: nombre, apellido, departamento_id, puesto_id, ubicacion_id, fecha_ingreso, correo, contraseña, rol_id. No incluye los campos personales, domicilio, laborales estendidos o financieros. |
| EmpleadoProfileCard.jsx | ✅ **ACTUALIZADA** | Formulario de edición en expediente SÍ captura los ~30 campos nuevos incluyendo: apellido_paterno, apellido_materno, nss, genero, estado_civil, escolaridad, celular_personal, correo_personal, contacto_emergencia, telefono_emergencia, parentesco_emergencia, calle, colonia, codigo_postal, municipio, estado_residencia, numero_nomina, fecha_imss, fecha_renovacion, tipo_contrato, celular_corporativo, jefe_inmediato_id, banco, clabe, cp_fiscal, infonavit, fonacot. |
| RHDashboard.jsx | ✅ Solo lectura (KPIs, gráficas). |
| RHAdminPage.jsx | ✅ Solo lectura (gestión de permisos). |
| VacacionesPage.jsx | ✅ Solo lectura (gestión vacaciones personales). |
| VacacionesListadoPage.jsx | ✅ Solo lectura (listado admin vacaciones). |

### Tabla de campos: comparativa BD vs EmpleadoPage

| Campo | En DB (001-crear-tablas-rh.sql) | En form creación (EmpleadoPage) | En form edición (ProfileCard) | Notas |
|-------|---|---|---|---|
| **Personales** | | | | |
| nombre | ✅ | ✅ | ✅ | |
| apellido_paterno | ✅ | ❌ mapea a "apellido" genérico | ✅ | Conflict: form alta usa "apellido", modelo espera "apellido_paterno" |
| apellido_materno | ✅ | ❌ | ✅ | |
| fecha_nacimiento | ✅ | ❌ | ✅ | |
| curp | ✅ | ❌ | ✅ | |
| rfc | ✅ | ❌ | ✅ | |
| nss | ✅ | ❌ | ✅ | |
| genero | ✅ | ❌ | ✅ | |
| estado_civil | ✅ | ❌ | ✅ | |
| escolaridad | ✅ | ❌ | ✅ | |
| estado_nacimiento | ✅ | ❌ | ✅ | |
| **Contacto** | | | | |
| celular_personal | ✅ | ❌ | ✅ | |
| correo_personal | ✅ | ❌ (no confundir con correo usuario) | ✅ | |
| telefono_emergencia | ✅ | ❌ | ✅ | |
| parentesco_emergencia | ✅ | ❌ | ✅ | |
| contacto_emergencia | ✅ | ❌ | ✅ | |
| **Domicilio** | | | | |
| calle | ✅ | ❌ | ✅ | |
| colonia | ✅ | ❌ | ✅ | |
| codigo_postal | ✅ | ❌ | ✅ | |
| municipio | ✅ | ❌ | ✅ | |
| estado_residencia | ✅ | ❌ | ✅ | |
| **Laborales** | | | | |
| numero_nomina | ✅ | ❌ | ✅ | |
| fecha_imss | ✅ | ❌ | ✅ | |
| fecha_renovacion | ✅ | ❌ | ✅ | |
| tipo_contrato | ✅ | ❌ | ✅ | |
| celular_corporativo | ✅ | ❌ | ✅ | |
| puesto_id | ✅ | ✅ | ✅ | |
| departamento_id | ✅ | ✅ | ✅ | |
| ubicacion_id | ✅ | ✅ | ✅ | |
| jefe_inmediato_id | ✅ | ❌ | ✅ | |
| **Financieros** | | | | |
| banco | ✅ | ❌ | ✅ | |
| clabe | ✅ | ❌ | ✅ | |
| cp_fiscal | ✅ | ❌ | ✅ | |
| infonavit | ✅ | ❌ | ✅ | |
| fonacot | ✅ | ❌ | ✅ | |
| **Control** | | | | |
| estatus | ✅ | ❌ | ✅ | |
| fecha_ingreso | ✅ | ✅ | ✅ | |

### Campos que SÍ están en EmpleadoPage.jsx (form creación)

- nombre (línea 41)
- apellido (línea 42) — pero la BD espera apellido_paterno
- correo (línea 43) — correo usuario, NO correo_personal
- contraseña (línea 44)
- puesto_id (línea 45)
- departamento_id (línea 46)
- ubicacion_id (línea 47)
- fecha_ingreso (línea 48)
- estatus (línea 49)
- rol_id (línea 50)

### Inconsistencias detectadas

1. **Mismatch nombre de campo (CRÍTICA):**
   - EmpleadoPage envía `apellido` (línea 114)
   - EmpleadoProfileCard envía `apellido_paterno` (línea 133)
   - Modelo Empleado.crear() espera `apellido_paterno` (línea 62)
   - **Resultado:** El formulario de alta vuelca `apellido` a NULL en BD; sólo edición funciona.

2. **Falta de apellido_materno en forma de creación (línea 96-120):**
   - No se captura en el formulario modal
   - Se pasa NULL al crear
   - Única forma de agregarlo es via edición en expediente

3. **Controller Empleado.crear() es demasiado permisivo (lines 94-106):**
   - Acepta sólo 12 campos de los 40 permitidos
   - El CAMPOS_PERMITIDOS del modelo (40 campos) se ignora en creación
   - Sólo se usan en actualizar (línea 158)
   - Significa que crear un empleado desde alta no inicializa: nss, curp, rfc, genero, estado_civil, escolaridad, celular_personal, etc.

4. **Falta de "apellido" en CAMPOS_PERMITIDOS del modelo (line 3-40):**
   - El modelo lista "apellido_paterno" pero el formulario de alta envía "apellido"
   - El controlador no hace mapping/translation

### Implicación

- **Usuarios nuevos:** Entran a BD con nombre, apellido_paterno NULL, fecha_ingreso, puesto/depto/ubicación. Todos los demás campos (NSS, CURP, RFC, estado civil, etc.) quedan NULL.
- **Workaround actual:** Después de crear el empleado hay que ir a "Ver Expediente" y editar manualmente los campos faltantes. Esto añade 2-3 clics extra y es propenso a olvidos.
- **Riesgo de datos:** Nóminas y expedientes incompletos; permisos de vacaciones dependen de fecha_ingreso (presente) pero NSS, tipo_contrato, etc. quedan vacíos.

**Archivo relevante:** 
- `/home/jamejia/intranet/modules/rh/frontend/pages/EmpleadoPage.jsx` (líneas 40-147)
- `/home/jamejia/intranet/modules/rh/backend/controllers/empleado.controller.js` (líneas 10-134)
- `/home/jamejia/intranet/modules/rh/backend/models/empleado.model.js` (líneas 3-95)

---

## [2026-04-29] investigador — Auditoría nivel_salarial y campos combo

**Pregunta:** Dónde aparece `nivel_salarial` en el proyecto, estructura de formulario de puestos, y estado actual de campos de empleado (`estado_civil`, `escolaridad`, `genero`, `tipo_contrato`, `nombre/apellidos`).

### 1. nivel_salarial — Ubicación completa

**Apariciones:**
- **Backend BD:** Campo en tabla `puestos` (VARCHAR(50), nullable)
  - Migración 001-crear-tablas-rh.sql:30
  - Migración 004-corregir-tabla-empleados.sql:31 (también aparece en empleados)
- **Backend Modelo:** `puesto.model.js` líneas 5, 49-52 — captura en crear/actualizar
- **Backend Controller:** `puesto.controller.js` línea 21 — acepta via req.body
- **Frontend:** `PuestosPage.jsx` líneas 16-20, 65, 80, 112 — campo en formulario

**Impacto en empleado:**
- El campo `nivel_salarial` está en tabla `empleados` (migración 004) pero NO aparece en ningún formulario de empleado
- No se captura en EmpleadoPage.jsx (alta)
- No se captura en EmpleadoProfileCard.jsx (edición)
- **Conclusión:** Está en BD pero "huérfano" — sin UI para llenarlo

### 2. Formulario de PUESTOS — estructura actual

**Localización:** `modules/rh/frontend/pages/PuestosPage.jsx` (líneas 16-21, 120-185)

**Tipo:** Modal (`mostrarFormulario` state, línea 120)

**Campos:**
1. `nombre` — `<input type="text">` (línea 127-134, required)
2. `departamento_id` — `<select>` (línea 137-150, con opciones cargadas)
3. `nivel_salarial` — `<input type="text">` (línea 153-160, libre, sin validación)
4. `descripcion` — `<textarea>` (línea 163-169)

**Función de submit:** `manejarEnvio()` (línea 48-73)
- Convierte null: `departamento_id: formulario.departamento_id || null`
- Llama a `crearPuesto()` o `actualizarPuesto()` según `editando` state
- POST/PATCH a backend, que acepta todo via `req.body`

**Tabla visual:** Muestra `nombre`, `departamento_nombre` (join), `nivel_salarial`, acciones (editar/eliminar)

### 3. Campos estado_civil, escolaridad, genero, tipo_contrato — estado actual

**EmpleadoPage.jsx (Alta/Creación):**
- ✅ `genero` — `<select>` (línea 584-595, opciones hardcodeadas: Masculino/Femenino/No binario/Prefiero no decir)
- ✅ `estado_civil` — `<select>` (línea 597-610, opciones: Soltero/Casado/Divorciado/Viudo/Unión libre)
- ✅ `escolaridad` — `<select>` (línea 612-628, opciones: Primaria/Secundaria/Bachillerato/Técnico/Licenciatura/Maestría/Doctorado)
- ✅ `tipo_contrato` — `<select>` (línea 394-405, opciones: Determinado/Indeterminado/Honorarios/Confianza)
- **Patrón:** Todos son `<select>` con opciones inline hardcodeadas; NO importan de catalogos.js

**EmpleadoProfileCard.jsx (Edición):**
- ✅ `genero` — `<select>` (línea 463-469, opciones: masculino/femenino/otro) — NOTA: opciones diferentes a EmpleadoPage
- ✅ `estado_civil` — `<select>` (línea 471-480, opciones: soltero/casado/union_libre/divorciado/viudo) — NOTA: format diferente
- ✅ `escolaridad` — `<select>` (línea 482-492, opciones: primaria/secundaria/preparatoria/tecnico/licenciatura/posgrado) — NOTA: "preparatoria" vs "Bachillerato"
- ✅ `tipo_contrato` — `<select>` (línea 398-406, opciones: indefinido/temporal/por_obra/honorarios/practicas) — **CONFLICTO: opciones DIFERENTES a EmpleadoPage**
- **Patrón:** Todos son `<select>` con opciones inline hardcodeadas

**Inconsistencias (CRÍTICA):**
| Campo | EmpleadoPage | EmpleadoProfileCard | Notas |
|-------|---|---|---|
| genero | Masculino/Femenino/No binario/Prefiero no decir | masculino/femenino/otro | Caps diferentes, opciones distintas |
| estado_civil | Soltero (Caps) | soltero (lowercase) | Case inconsistente |
| escolaridad | Bachillerato | preparatoria | Distintos valores |
| tipo_contrato | **Determinado/Indeterminado/Honorarios/Confianza** | **indefinido/temporal/por_obra/honorarios/practicas** | **COMPLETO DESAJUSTE** |

### 4. Campos nombre, apellido_paterno, apellido_materno — onBlur

**EmpleadoPage.jsx:**
- `nombre` (línea 324-333) — NO tiene onBlur; `<input type="text">`
- `apellido_paterno` (línea 335-344) — NO tiene onBlur; `<input type="text">`
- `apellido_materno` (línea 346-354) — NO tiene onBlur; `<input type="text">`

**EmpleadoProfileCard.jsx:**
- Usa componente `Campo()` helper (línea 671-688)
- `nombre` (línea 327, via `Campo`) — NO tiene onBlur
- `apellido_paterno` (línea 328, via `Campo`) — NO tiene onBlur
- `apellido_materno` (línea 329, via `Campo`) — NO tiene onBlur

**Conclusión:** Ninguno de estos campos tiene onBlur actualmente.

### Implicación para el equipo

1. **nivel_salarial en empleados:** Huérfano en UI — necesita decisión: ¿eliminarlo de BD, o crear UI para capturarlo? Está en migración 004 pero nunca se usa.

2. **Inconsistencia tipo_contrato crítica:** Los valores guardados en una página no coinciden con las opciones de edición. Empleado creado con "Determinado" no podrá editarse sin perder el dato (select no lo reconocerá).

3. **genero/estado_civil/escolaridad:** Tienen valores en multiple formatos (Caps vs lowercase); pueden generar dups en BD o no coincidir en búsquedas.

4. **Oportunidad de centralización:** Estos 4 campos YA tienen selects inline — candidatos a extraer a catalogos.js como hizo el coder con ESTADOS_MEXICO y BANCOS_MEXICO.

5. **Sin onBlur en nombres:** Los campos de nombre/apellidos no tienen validación en blur. Si el usuario quiere normalizar (trim, uppercase) u otro comportamiento, no está implementado.

**Archivos relevantes:**
- `/home/jamejia/intranet/modules/rh/frontend/pages/PuestosPage.jsx` (líneas 16-20, 48-73, 120-185)
- `/home/jamejia/intranet/modules/rh/frontend/pages/EmpleadoPage.jsx` (líneas 324-354, 394-405, 584-628)
- `/home/jamejia/intranet/modules/rh/frontend/components/EmpleadoProfileCard.jsx` (líneas 327-329, 398-406, 463-492)
- `/home/jamejia/intranet/modules/rh/backend/models/puesto.model.js` (línea 5)
- `/home/jamejia/intranet/modules/rh/backend/migrations/001-crear-tablas-rh.sql` (línea 30)
- `/home/jamejia/intranet/modules/rh/backend/migrations/004-corregir-tabla-empleados.sql` (línea 31)

---

## [2026-04-29] investigador — Auditoría sidebar logo, login logo y permisos menú dinámico

**Pregunta:** 
1. ¿Dónde aparece el logo del sidebar, cuál es su ruta, tamaño y cómo se renderiza?
2. ¿Cuál es el logo de la página de login y dónde se captura?
3. ¿Cómo carga el menú dinámico las opciones y filtra según permisos?
4. ¿Cuál es la estructura de permisos en BD y qué endpoint retorna los módulos permitidos?

### 1. Logo del Sidebar

**Ubicación:** `modules/portal/frontend/components/MenuDinamico.jsx` líneas 75-96

**Componente:**
```jsx
function SidebarLogo() {
  const imgRef = useRef(null);
  const [imgError, setImgError] = useState(false);

  if (imgError) {
    return (
      <span style={{ color: '#fff', fontWeight: 800, fontSize: '1.15rem', letterSpacing: '0.04em' }}>
        RAYHSA
      </span>
    );
  }

  return (
    <img
      ref={imgRef}
      src="/logo-rayhsa.png"
      alt="RAYHSA"
      onError={() => setImgError(true)}
      style={{ height: '38px', width: 'auto', objectFit: 'contain' }}
    />
  );
}
```

**Renderizado en sidebar:**
```jsx
<div className="sidebar-logo">
  <SidebarLogo />
</div>
```

**Características:**
- **Ruta de imagen:** `/logo-rayhsa.png` (URL pública, ubicación física: `/modules/portal/frontend/public/logo-rayhsa.png`)
- **Tamaño:** `height: 38px, width: auto, objectFit: contain`
- **Fallback:** Si la imagen no carga, muestra texto "RAYHSA" en blanco (color: '#fff', fontWeight: 800, fontSize: 1.15rem)
- **Contenedor:** Clase CSS `sidebar-logo` (estilos en globales.css, no inline)
- **No hay centrado explícito:** El centrado viene del CSS de `.sidebar-logo` (probablemente flex)

**Archivos físicos de logo:**
- `/home/jamejia/intranet/modules/portal/frontend/public/logo-rayhsa.png` ✅ Existe
- `/home/jamejia/intranet/modules/portal/frontend/public/Logo-rayhsa.jpg` ✅ Existe (alternativa, case-sensitive)

### 2. Logo de la página de Login

**Ubicación:** `modules/portal/frontend/pages/PortalLogin.jsx` líneas 48-59

**JSX del logo:**
```jsx
{/* Logo */}
<div style={{ textAlign: 'center', marginBottom: '2rem' }}>
  <div style={{ width: '72px', height: '72px', borderRadius: '16px', background: 'var(--color-primario)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem', fontSize: '2rem' }}>
    🏢
  </div>
  <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-texto)', margin: 0 }}>{NOMBRE_EMPRESA}</h1>
  <p style={{ fontSize: '0.85rem', color: 'var(--color-texto-claro)', marginTop: '0.25rem' }}>Acceso al portal corporativo</p>
</div>
```

**Características:**
- **Logo actual:** Emoji 🏢 (buidling, no es un archivo)
- **Contenedor:** Caja de `72px × 72px`, radius 16px, fondo `var(--color-primario)` (color primario del theme)
- **Centrado:** `display: flex, alignItems: center, justifyContent: center` — perfectamente centrado
- **Nombre de empresa:** Usa variable `NOMBRE_EMPRESA` (línea 8) — por defecto "Intranet Corporativa"
- **NO usa archivo de imagen** — el logo es puro CSS + emoji

**Implicación:** Para cambiar el logo de login a uno de Rayhsa, habría que:
1. Reemplazar el emoji 🏢 con un `<img src="/logo-rayhsa.png" alt="RAYHSA" />`
2. Ajustar estilos del contenedor para mantener proporción imagen

### 3. Menú Dinámico — Lógica de carga y permisos

**Carga de módulos (Frontend):**
- **Archivo:** `modules/portal/frontend/main.jsx` líneas 62-75
- **Flow:**
  1. `LayoutConMenu` carga con usuario autenticado (línea 77)
  2. `useEffect` llama a `obtenerModulosActivos()` (línea 69)
  3. Backend retorna solo módulos con `activo = true`
  4. Se pasa el array `modulos` a `<MenuDinamico modulos={modulos} />` (línea 86)

**Endpoint de módulos:**
- **Ruta:** `GET /api/modulos/activos` (pública, sin autenticación)
- **Controller:** `modules/portal/backend/controllers/modulo.controller.js` línea 14-21
- **Modelo:** `Modulo.obtenerActivos()` (modulo.model.js línea 22-27)
- **Retorna:** Módulos de la tabla `modulos` donde `activo = true`, ordenados por nombre
- **NO filtra por rol/permiso en esta etapa** — todos los usuarios autenticados ven los mismos módulos activos

**Filtrado en MenuDinamico.jsx:**
- **SUB_RUTAS:** Array hardcodeado (líneas 7-32) — define qué subrutas tiene cada módulo
- **ICONOS_MODULOS:** Array hardcodeado (línea 53-60) — emojis para cada módulo
- **Renderizado:** Itera sobre `modulos` prop (línea 139) y renderiza cada uno si está en la lista
- **Admin items (ADMIN_ITEMS):** Líneas 43-49 — hardcodeado, solo visible si usuario tiene rol `super_admin` o `portal_admin` (línea 124)

**Implicación:**
- **Las SUB_RUTAS son estáticas** — hardcoded en el componente, no vienen de BD
- **No hay filtrado de opciones por permiso** — si un módulo está activo, todos los usuarios ven todas sus subrutas
- **No hay endpoint `/api/permisos` que devuelva menú del usuario** — ese endpoint (`/api/permisos/opciones`, `/api/permisos/rol/:rol_id`) existe pero NO se usa para construir el menú
- **Permisos se validan en el backend** — vía `verificarPermiso` middleware en cada ruta (ejemplo: modulo.routes.js línea 14)

### 4. Estructura de Permisos en BD (para validar constraint 3)

**Tablas relevantes:**
- `modulos` — nombre, activo, descripcion, path_reactivo
- `modulo_opciones` — nombre, descripcion, modulo_id, orden (opciones de cada módulo)
- `roles` — nombre, descripcion
- `rol_opcion_permisos` — rol_id, opcion_id, tipo (consulta/edicion)

**Endpoints de permisos:**
1. `GET /api/permisos/opciones` (línea 11-23 permiso.routes.js)
   - **Qué retorna:** Todas las opciones agrupadas por módulo: `{ modulo, id, nombre, descripcion, orden }`
   - **Uso:** Admin para gestionar permisos de roles
   - **NO se usa en frontend para construir menú**

2. `GET /api/permisos/rol/:rol_id` (línea 26-36)
   - **Qué retorna:** Permisos de un rol específico: `{ opcion_id, tipo }`
   - **Uso:** Admin, para saber qué opciones tiene asignadas un rol
   - **NO se usa en MenuDinamico**

3. `PUT /api/permisos/rol/:rol_id/modulo/:modulo` (línea 39-77)
   - **Para guardar permisos** de un módulo a un rol

**¿Dónde se valida el permiso?**
- Backend: `verificarPermiso('modulo', 'opcion', 'tipo')` middleware (modulo.routes.js línea 14)
- Este middleware verifica si el usuario actual (via JWT) tiene permiso en `rol_opcion_permisos`
- **Es una validación de acceso, no de visualización** — el menú NO filtra basado en esto

**Implicación crítica:**
- **MenuDinamico muestra todas las subrutas de los módulos activos, SIN filtrado por permiso del usuario**
- Si un usuario no tiene permiso para `/rh/empleados`, el link aparece en el sidebar, pero cuando navega allá, el backend rechaza la solicitud
- **UX problem:** El usuario ve la opción pero no puede usarla (el 404 o error viene del backend, no del frontend)

**Archivos relevantes:**
- `/home/jamejia/intranet/modules/portal/frontend/components/MenuDinamico.jsx` (líneas 75-96, 7-60, 139-187)
- `/home/jamejia/intranet/modules/portal/frontend/main.jsx` (líneas 62-75, 86)
- `/home/jamejia/intranet/modules/portal/frontend/pages/PortalLogin.jsx` (líneas 48-59)
- `/home/jamejia/intranet/modules/portal/backend/routes/modulo.routes.js` (línea 10)
- `/home/jamejia/intranet/modules/portal/backend/controllers/modulo.controller.js` (línea 14-21)
- `/home/jamejia/intranet/modules/portal/backend/routes/permiso.routes.js` (líneas 11-36)
- `/home/jamejia/intranet/modules/portal/frontend/public/logo-rayhsa.png`


---

## [2026-04-29] investigador — Auditoría bugs admin, roles, sidebar módulos y CSS páginas RH

**Preguntas:** 5 bugs y anomalías encontradas durante auditoría de componentes admin y páginas RH

### 1. PREGUNTA: Botón "Editar" en página de usuarios del módulo admin

**Hallazgo:**
El botón "Editar" **FUNCIONA CORRECTAMENTE** en `PortalAdminUsuarios.jsx`.

- **Ubicación del botón:** `/home/jamejia/intranet/modules/portal/frontend/pages/PortalAdminUsuarios.jsx` línea 323
- **Handler:** Función `editarUsuario(usuario)` en línea 92-105
- **Lógica:** Carga los datos del usuario en el formulario modal (estado `mostrarFormulario = true`) y marca `editando = usuario`
- **Formulario de edición:** El mismo modal (líneas 160-263) se reutiliza para crear y editar
- **Submit:** Envía PUT a `/usuarios/${editando.id}` si está en modo edición (línea 63)

**Conclusión:** Sin bugs. El flujo editar → modal → PUT funciona normalmente.

---

### 2. PREGUNTA: Reset-password "Ruta no encontrada: POST /api/usuarios/:id/reset-password"

**Hallazgo - CRÍTICO:**
La ruta **NO EXISTE en el backend.**

**Frontend (llama correctamente):**
- Archivo: `/home/jamejia/intranet/modules/portal/frontend/pages/PortalAdminUsuarios.jsx` línea 121
- Código: `POST /usuarios/${usuario.id}/reset-password`
- Se llama desde función `resetearPassword(usuario)` línea 118-133

**Backend (rutas disponibles):**
- Archivo: `/home/jamejia/intranet/modules/portal/backend/routes/usuario.routes.js` (16 líneas)
- Rutas definidas:
  - `GET /` — listar usuarios
  - `GET /:id` — obtener usuario
  - `PUT /:id` — actualizar usuario
  - `DELETE /:id` — eliminar usuario
  - `POST /:id/rol` — asignar rol
- **Falta:** `POST /:id/reset-password`

**Backend app.js:**
- Línea 36: `app.use("/api/usuarios", require("./routes/usuario.routes"));`
- Prefijo es `/api/usuarios` ✅ (correcto)

**Implicación:** El frontend intenta POST a una ruta que no existe. Backend retorna 404. El botón "Resetear Clave" en la tabla (línea 325-330) es funcional pero nunca llegará al handler.

---

### 3. PREGUNTA: Página de Roles no carga la lista

**Hallazgo - PARCIAL:**
La página de Roles (`PortalAdminRoles.jsx`) **CARGA CORRECTAMENTE** si el endpoint `/api/roles` existe.

**Frontend (correcto):**
- Archivo: `/home/jamejia/intranet/modules/portal/frontend/pages/PortalAdminRoles.jsx` línea 20
- Código: `solicitar('/roles')`
- También carga: `solicitar('/permisos')` línea 21
- **Notas:** No hay ruta completa especificada; `solicitar()` debería añadir `/api` (revisar helper)

**Backend:**
- Archivo: `/home/jamejia/intranet/modules/portal/backend/app.js` línea 33
- Ruta: `app.use("/api/roles", require("./routes/rol.routes"));`
- **Prefijo correcto:** `/api/roles` ✅

**Lógica de carga:**
- `cargarDatos()` en línea 17-30 usa `Promise.all([solicitar('/roles'), solicitar('/permisos')])`
- Renderizado: línea 139-163 muestra tabla si `!cargando`

**Implicación:** La estructura es correcta. Si la lista no carga, la causa es:
1. El helper `solicitar()` no antepone `/api` correctamente (revisar `modules/portal/frontend/utils/api.js`)
2. Rol.routes.js tiene un error interno
3. El endpoint GET /roles rechaza por permisos (middleware)

---

### 4. PREGUNTA: Sidebar — módulos sin acceso deberían desaparecer

**Hallazgo - INCOMPLETO:**
Las sub-rutas SÍ se filtran por permisos, pero **LOS MÓDULOS COMPLETOS NO SE FILTRAN** si todas sus sub-rutas son inaccesibles.

**Ubicación:** `/home/jamejia/intranet/modules/portal/frontend/components/MenuDinamico.jsx` líneas 150-200

**Lógica actual:**

```jsx
// Línea 150: itera sobre módulos activos
modulosActivos.map(m => {
  const subRutas = SUB_RUTAS[m.nombre];
  // ...
  return (
    <div key={m.id} className="sidebar-grupo">
      {/* Renderiza el botón de módulo */}
      <button className="sidebar-seccion-btn" ...>
      {/* Línea 186-196: Filtra SUB_RUTAS por permiso */}
      <div className="sidebar-subitems">
        {subRutas
          .filter((sr) => tieneAcceso(m.nombre, sr.opcion))
          .map(sr => ...)}
      </div>
    </div>
  );
})
```

**Problema:** El `.map()` sobre `modulosActivos` (línea 150) no filtra módulos. Renderiza el módulo AUNQUE todas sus sub-rutas sean inaccesibles.

**Ejemplo:** Un empleado sin acceso a RH:
1. Permiso: vacío para módulo "rh"
2. Sub-rutas filtradas: array vacío (línea 187)
3. Resultado: botón "👥 RH" aparece en sidebar, pero sin sub-items
4. El botón es clickeable pero no lleva a nada (vacío)

**Solución necesaria:** Filtrar módulos ANTES de renderizar:
```jsx
const modulosConAcceso = modulosActivos.filter(m => {
  const subRutas = SUB_RUTAS[m.nombre];
  if (!subRutas) return true; // módulos sin subrutas siempre visibles
  return subRutas.some(sr => tieneAcceso(m.nombre, sr.opcion));
});
modulosConAcceso.map(m => ...)
```

**Archivos relevantes:**
- `/home/jamejia/intranet/modules/portal/frontend/components/MenuDinamico.jsx` (líneas 98, 150, 186-196)

---

### 5. PREGUNTA: Estilos CSS en páginas Permisos/Ausencias, Vacaciones y Solicitudes

**Hallazgo - INCONSISTENCIA DE PATRONES:**

#### 5a. RHAdminPage (Permisos/Ausencias)
- **Archivo:** `/home/jamejia/intranet/modules/rh/frontend/pages/RHAdminPage.jsx` (99 líneas)
- **Estilos:** SOLO className — NO usa inline `style={}`
- **Patrón:** `<div className="rh-admin-page">`, `<div className="admin-filtros">`, `<div className="paginacion">`
- **Componente hijo:** `<PermisosList permisos={permisos} onResponder={...} />` (probablemente contiene estilos)
- **Estatus:** ✅ Usa clases CSS globales (probablemente en `modules/rh/frontend/` o `modules/portal/frontend/`)

#### 5b. VacacionesPage (Formulario de solicitud)
- **Archivo:** `/home/jamejia/intranet/modules/rh/frontend/pages/VacacionesPage.jsx` (200+ líneas)
- **Estilos:** MASIVAMENTE inline con `style={{ ... }}`
- **Ejemplos:**
  - Líneas 18-33: `BadgeEstatus` con `display: 'inline-block'`, `padding`, `borderRadius`, `background` inline
  - Líneas 36-68: `TarjetaSaldo` con estilos inline completos (border, borderRadius, padding, flex)
  - Líneas 182-197: Variables `estiloSeccion`, `estiloTituloSeccion`, `estiloInput` — diccionarios de estilo inline
- **Patrón:** Estilos calculados en constantes y aplicados con `style={{ ...estiloSeccion }}`
- **Estatus:** ❌ Prácticamente SIN clases CSS, todo hardcodeado

#### 5c. VacacionesListadoPage (Listado de solicitudes)
- **Archivo:** `/home/jamejia/intranet/modules/rh/frontend/pages/VacacionesListadoPage.jsx` (200+ líneas)
- **Estilos:** MASIVAMENTE inline con `style={{ ... }}`
- **Ejemplos:**
  - Líneas 125-132: `estiloInput` — diccionario inline
  - Líneas 134-143: `estiloBtnPrimario` — diccionario inline
  - Línea 146: `<div style={{ maxWidth: "1100px", ... }}>`
  - Línea 147: Anidado con estilos inline display, gap, etc.
- **Patrón:** Estilos inline en cada elemento, con constantes reutilizadas localmente
- **Estatus:** ❌ TODOS inline

#### 5d. EmpleadoPage (Comparativa — página de referencia)
- **Archivo:** `/home/jamejia/intranet/modules/rh/frontend/pages/EmpleadoPage.jsx` (600+ líneas)
- **Estilos:** MEZCLA — `className` + constantes `estiloSeccion`, `estiloGrid2`, `estiloGrid3` (líneas 37-57)
- **Patrón:** Define constantes de estilo inline al inicio, reutiliza en el render
- **Ejemplo:** Línea 47-57 define grillas, se usan en todo el formulario modal
- **Estatus:** ✅ CONSISTENTE — usa constantes inline pero de forma ordenada

### Inconsistencias detectadas

| Página | Patrón | Estatus |
|--------|--------|--------|
| RHAdminPage | `className` globales | ✅ Correcto |
| VacacionesPage | Inline masivo con constantes locales | ❌ Desorganizado |
| VacacionesListadoPage | Inline con constantes locales | ❌ Desorganizado |
| EmpleadoPage | Constantes inline + reutilizables | ✅ OK |

### Problemas específicos

1. **Falta de consistencia de clase CSS:** VacacionesPage y VacacionesListadoPage NO usan clases de CSS global (ej: `className="card"`, `className="button-primary"`). Todo inline.

2. **Variables CSS en componentes locales:** Ambas páginas de vacaciones usan `var(--color-primario)` etc. en inline styles (líneas 11-13, 40, 54, etc. en VacacionesPage). **NOTA:** Esto funciona pero no es "limpio" — mejor en CSS global.

3. **Componentes reutilizables sin extraer:** `BadgeEstatus` y `TarjetaSaldo` están definidos inline en VacacionesPage pero podrían estar en `modules/rh/frontend/components/`.

4. **Sin tablas HTML adecuadas:** VacacionesListadoPage no renderiza en las líneas 200+ (continuación no leída). Revisar si usa tablas o divs.

**Archivos relevantes:**
- `/home/jamejia/intranet/modules/rh/frontend/pages/RHAdminPage.jsx` (líneas 58-78)
- `/home/jamejia/intranet/modules/rh/frontend/pages/VacacionesPage.jsx` (líneas 10-34, 36-68, 182-197, 200+)
- `/home/jamejia/intranet/modules/rh/frontend/pages/VacacionesListadoPage.jsx` (líneas 5-28, 125-143, 145+)
- `/home/jamejia/intranet/modules/rh/frontend/pages/EmpleadoPage.jsx` (líneas 37-57)

**Implicación:** VacacionesPage y VacacionesListadoPage no siguen el patrón del proyecto. Deberían:
1. Extraer estilos inline a `modules/rh/frontend/styles/vacaciones.css` (o similar)
2. Usar `className` en lugar de `style={}`
3. Extraer componentes como `BadgeEstatus` a `modules/rh/frontend/components/BadgeEstatus.jsx`
4. Mantener constantes de estilo solo para valores dinámicos (colores según rol, etc.)


---

## [2026-04-29] investigador — Dashboard RH (error GET /rh/dashboard) y estilos página Permisos/Ausencias

**Preguntas:**
1. ¿Cuál es la causa raíz del error "error al obtener el dashboard" en RHDashboard.jsx?
2. ¿Cuál es el estado actual de la página de Permisos/Ausencias (RHAdminPage)?
3. ¿Qué constantes de estilo usa EmpleadoPage.jsx para que Permisos las replique?

### PREGUNTA 1: Dashboard RH — análisis de endpoint y errores

**Hallazgo: NO hay error en el endpoint — todo está correctamente implementado**

#### Endpoint: `GET /api/rh/dashboard`

**Frontend (RHDashboard.jsx, línea 16):**
```jsx
fetch(`${API}/rh/dashboard`, {
  headers: { Authorization: `Bearer ${token}` },
})
```

**Ruta en backend (rh.dashboard.routes.js, línea 8-13):**
```javascript
router.get(
  '/dashboard',
  authenticateJWT,
  verificarPermiso('rh', 'Empleados', 'consulta'),
  RHDashboardController.obtenerDashboard
);
```
- Prefijo registrado en app.js línea 39: `app.use("/api/rh", ...dashboard.routes)`
- **Ruta completa:** `GET /api/rh/dashboard` ✅

**Controller (rh.dashboard.controller.js, línea 4-74):**
- Ejecuta 7 queries en paralelo con `Promise.all()`
- Queries válidas: empleados totales, activos, bajas mes, permisos pendientes, movimientos por mes, por departamento, lista de permisos pendientes
- Respuesta exitosa: `{ exito: true, datos: { kpis, movimientos_por_mes, por_departamento, permisos_pendientes_lista } }`
- Manejo de error en catch: retorna `{ exito: false, mensaje: 'Error al obtener el dashboard', error: error.message }`

**Posibles causas de error (si ocurre):**
1. **Falta de permiso:** Middleware `verificarPermiso('rh', 'Empleados', 'consulta')` rechaza si usuario NO tiene ese permiso en `rol_opcion_permisos`
2. **Conexión a BD:** Una de las 7 queries falla (ejemplo: tabla `permisos_ausencia` no existe si no se ejecutó migración 001)
3. **Token inválido:** `authenticateJWT` rechaza si token no está en header o es inválido
4. **API_URL incorrecto:** `const API = import.meta.env.VITE_API_URL_RH || ... ` — verificar que `VITE_API_URL_RH` es correcto en `.env.local`

**Observación:** No hay bugs evidente en el código. Si reportan error, revisar:
- Logs del servidor (stderr del backend)
- Console del navegador (frontend)
- Variables de entorno y tokens

**Archivos relevantes:**
- `/home/jamejia/intranet/modules/rh/frontend/pages/RHDashboard.jsx` (línea 16)
- `/home/jamejia/intranet/modules/rh/backend/routes/rh.dashboard.routes.js` (línea 8-13)
- `/home/jamejia/intranet/modules/rh/backend/controllers/rh.dashboard.controller.js` (línea 4-74)
- `/home/jamejia/intranet/modules/portal/backend/app.js` (línea 39)

---

### PREGUNTA 2: Página Permisos/Ausencias (RHAdminPage) — estado actual de estilo

**Hallazgo: RHAdminPage usa CLASES CSS GLOBALES (className), NO estilos inline**

**Estructura de página (RHAdminPage.jsx, línea 57-100):**
```jsx
<div className="rh-admin-page">           // línea 58
  <h1>Panel de Administración RH</h1>
  
  <div className="admin-filtros">         // línea 61
    <h2>Solicitudes de Permisos</h2>
    <div className="filtros-grupo">       // línea 63 — botones de filtro
      {["pendiente", "aprobado", "rechazado", ""].map(...)}
    </div>
  </div>
  
  <PermisosList permisos={permisos} ... /> // línea 79
  
  <div className="paginacion">             // línea 82 — controles pagination
    ...
  </div>
</div>
```

**Clases CSS utilizadas:**
- `.rh-admin-page` — contenedor principal
- `.admin-filtros` — sección de filtros
- `.filtros-grupo` — botones de filtro
- `.paginacion` — controles de página
- (Internamente en `<PermisosList>`): `.permisos-lista`, `.permisos-tabla`, `.badge`, `.boton-aprobar`, `.boton-rechazar`

**Componente hijo: PermisosList.jsx (línea 23-109)**
- **SIN estilos inline**
- Usa clases CSS: `.permisos-lista`, `.lista-encabezado`, `.permisos-tabla`, `.badge`, `.badge-pendiente`, `.badge-aprobado`, `.badge-rechazado`, `.boton-aprobar`, `.boton-rechazar`
- Componente `PermisosForm.jsx` tiene SOLO 2 estilos inline (línea 83, 99) para avisos y readonly

**Conclusión:** RHAdminPage + PermisosList siguen patrón correcto (clases CSS). **NO necesita refactor de estilos.**

**Archivos relevantes:**
- `/home/jamejia/intranet/modules/rh/frontend/pages/RHAdminPage.jsx` (línea 57-100)
- `/home/jamejia/intranet/modules/rh/frontend/components/PermisosList.jsx` (línea 23-109)
- `/home/jamejia/intranet/modules/rh/frontend/components/PermisosForm.jsx` (línea 78-170)

---

### PREGUNTA 3: Constantes de estilo en EmpleadoPage — patrón de referencia para Permisos

**Hallazgo: EmpleadoPage define 3 constantes de estilo reutilizables (línea 37-57)**

**Constantes de estilo (línea 37-57 de EmpleadoPage.jsx):**

```javascript
const estiloSeccion = {
  borderBottom: "1px solid var(--color-borde)",
  paddingBottom: "0.75rem",
  marginBottom: "0.75rem",
  fontWeight: 700,
  color: "var(--color-primario)",
  fontSize: "0.88rem",
  marginTop: "1rem",
};

const estiloGrid2 = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "0.75rem",
};

const estiloGrid3 = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: "0.75rem",
};
```

**Cómo se usan en EmpleadoPage:**
- `style={estiloSeccion}` — encabezados de secciones (línea 336, 398, 530, 641, 708, 769, 837)
- `style={estiloGrid2}` — 2 campos lado a lado (línea 374, 439, 642, 813)
- `style={estiloGrid3}` — 3 campos lado a lado (línea 337, 399, 459, 553, 598, 669, 730, 770)

**Patrón: Constantes fuera del componente para evitar recreación en cada render.**

**Comparativa con VacacionesPage (línea 10-62):**

VacacionesPage SÍ sigue el patrón (define 5 constantes):
```javascript
const estiloSeccion = { background: "var(--color-superficie)", ... };
const estiloTituloSeccion = { fontSize: "1.05rem", ... };
const estiloInput = { width: "100%", ... };
const estiloLabel = { display: "block", ... };
const estiloBotonPrimario = { background: "var(--color-primario)", ... };
```

VacacionesListadoPage TAMBIÉN sigue el patrón (línea 11-49):
```javascript
const estiloInput = { ... };
const estiloBtnPrimario = { ... };
const estiloCard = { ... };
const estiloFiltros = { display: "flex", ... };
```

**Conclusión:** VacacionesPage y VacacionesListadoPage YA siguen el patrón de EmpleadoPage. NO necesitan cambio en estructura de estilos.

---

### Implicación para el equipo

1. **Dashboard:** Endpoint está correcto. Si hay error, es en permisos (rol_opcion_permisos) o BD (migración).
2. **RHAdminPage + PermisosList:** Ya usan clases CSS globales (correcto). Sin refactor necesario.
3. **VacacionesPage + VacacionesListadoPage:** Siguen patrón de constantes de estilo (correcto).
4. **Página de Permisos/Ausencias (RHAdminPage):** Es la página correcta. Está en `modules/rh/frontend/pages/RHAdminPage.jsx`.

**No hay hallazgos de bugs o inconsistencias en estilos.**

**Archivos relevantes:**
- `/home/jamejia/intranet/modules/rh/frontend/pages/EmpleadoPage.jsx` (línea 37-57)
- `/home/jamejia/intranet/modules/rh/frontend/pages/VacacionesPage.jsx` (línea 10-62)
- `/home/jamejia/intranet/modules/rh/frontend/pages/VacacionesListadoPage.jsx` (línea 5-49)
- `/home/jamejia/intranet/modules/rh/frontend/pages/RHAdminPage.jsx` (línea 57-100)
- `/home/jamejia/intranet/modules/rh/backend/controllers/rh.dashboard.controller.js` (línea 4-74)


---

## [2026-05-15] investigador — Módulo Comercial: MBA3 API, patrones RH, permisos y generación PDF

**Preguntas:** 6 investigaciones sobre estructura, patrones reutilizables y tecnologías para iniciar el módulo Comercial (cotizaciones, créditos, listas de precios).

### 1. PREGUNTA: Contenido de PDFs — MBA3 API y Solicitud de Crédito

**Hallazgo: Los PDFs están ENCRIPTADOS/COMPRIMIDOS — extracción de texto NO DISPONIBLE**

**Intento 1: pdftotext**
- ❌ No instalado en el sistema

**Intento 2: PyPDF2**
- ❌ No disponible en Python 3.12
- Versión: Python 3.12.1

**Intento 3: pdfplumber**
- ❌ No disponible; sistema no permite pip install (restricted environment)

**Intento 4: strings + regex**
- ✅ Ejecutado, pero ambos PDFs solo retornan metadata XML y streams comprimidos
- MBA3_API.pdf: 167 páginas, muy comprimido
- Solicitud_De_Crédito.pdf: 3 páginas, también comprimido

**Conclusión:** Para extraer contenido de estos PDFs, se requiere:
- Instalar pdfplumber en virtual environment local, O
- Convertir PDFs a imágenes + OCR, O
- Requerir al stakeholder versión editable (DOCX/ODT) de los documentos

**Acción necesaria:** Preguntar a usuario si puede proporcionar versión no-PDF o acceso a documentación en texto de los endpoints MBA3 y campos de Solicitud de Crédito.

**Archivos relevantes:**
- `/home/jamejia/intranet/docs/comercial/MBA3_API.pdf` (167 págs, comprimido)
- `/home/jamejia/intranet/docs/comercial/Solicitud De Crédito.pdf` (3 págs, comprimido)

---

### 2. PREGUNTA: Patrones de modelo, controller y rutas — reutilizable de RH

**Hallazgo: Arquitectura estándar PERN — Patrón Model/Controller/Routes claramente definido**

#### Patrón 2a: Modelo (ejemplo: empleado.model.js)

**Ubicación:** `modules/rh/backend/models/empleado.model.js`

**Estructura:**
```javascript
const { grupo } = require("../config/database");

const CAMPOS_PERMITIDOS = [
  "nombre",
  "apellido_paterno",
  // ... 38 campos más
];

const SELECT_EMPLEADO = `
  SELECT e.*,
    u.correo as usuario_correo,
    p.nombre as puesto,
    d.nombre as departamento,
    ub.nombre as ubicacion,
    jefe.nombre as jefe_nombre, jefe.apellido_paterno as jefe_apellido
  FROM empleados e
  LEFT JOIN usuarios u ON e.usuario_id = u.id
  LEFT JOIN puestos p ON e.puesto_id = p.id
  -- ... más JOINs
`;

const Empleado = {
  async crear(datos) { ... },
  async actualizar(id, datos) { ... },
  async obtener(id) { ... },
  async listar(filtro, pagina, limite) { ... },
  async eliminar(id) { ... },
};

module.exports = Empleado;
```

**Patrón:**
1. Conexión a BD via `const { grupo } = require("../config/database")` — instancia de `pg.Pool`
2. Array `CAMPOS_PERMITIDOS` — lista blanca de campos (seguridad)
3. Query `SELECT_*` con JOINs predefinida (reutilizable)
4. Objeto con métodos `async` que retornan resultados via `grupo.query()`
5. Métodos siguen patrón: `crear()`, `actualizar()`, `obtener()`, `listar()`, `eliminar()`

#### Patrón 2b: Controller (ejemplo: empleado.controller.js)

**Ubicación:** `modules/rh/backend/controllers/empleado.controller.js` (primeras 60 líneas)

**Estructura:**
```javascript
const bcrypt = require("bcrypt");
const Empleado = require("../models/empleado.model");
const Usuario = require("../../../portal/backend/models/usuario.model");
const { grupo } = require("../config/database");
const { registrarAccion } = require("../../../auditoria/backend/services/auditoria.service");

const ControladorEmpleado = {
  async crear(req, res) {
    try {
      const { nombre, apellido_paterno, ... } = req.body;
      
      // Validaciones
      if (!nombre || !apellido_paterno) {
        return res.status(400).json({
          exito: false,
          mensaje: '...'
        });
      }
      
      // Crear registro
      const resultado = await Empleado.crear(datosLimpios);
      
      // Registrar en auditoría
      await registrarAccion(req, 'rh', 'empleados', resultado.id, 'crear', null, resultado);
      
      // Responder
      return res.status(201).json({
        exito: true,
        datos: resultado
      });
    } catch (error) {
      return res.status(500).json({
        exito: false,
        mensaje: 'Error al crear empleado',
        error: error.message
      });
    }
  },
  
  async listar(req, res) { ... },
  async obtener(req, res) { ... },
  async actualizar(req, res) { ... },
};

module.exports = ControladorEmpleado;
```

**Patrón:**
1. Destructuring de `req.body`
2. Validaciones básicas (campos requeridos)
3. Llamada al método del modelo
4. Registro de auditoría via `registrarAccion(req, modulo, tabla, id, accion, antes, después)`
5. Respuesta estandarizada: `{ exito: true/false, datos: ..., mensaje: ... }`
6. Manejo de errores con try/catch → respuesta JSON con status HTTP

#### Patrón 2c: Rutas (ejemplo: empleados.routes.js)

**Ubicación:** `modules/rh/backend/routes/empleados.routes.js`

**Estructura:**
```javascript
const { Router } = require("express");
const ControladorEmpleado = require("../controllers/empleado.controller");
const { authenticateJWT } = require("../../../portal/backend/middleware/auth.middleware");
const { verificarPermiso } = require("../../../portal/backend/middleware/permisos.middleware");

const router = Router();

// Aplicar autenticación globalmente
router.use(authenticateJWT);

// Rutas con permisos granulares
router.get("/", verificarPermiso("rh", "Empleados", "consulta"), ControladorEmpleado.listar);
router.post("/", verificarPermiso("rh", "Empleados", "edicion"), ControladorEmpleado.crear);
router.get("/:id", ControladorEmpleado.obtener);
router.put("/:id", verificarPermiso("rh", "Empleados", "edicion"), ControladorEmpleado.actualizar);
router.delete("/:id", verificarPermiso("rh", "Empleados", "edicion"), ControladorEmpleado.eliminar);

// Rutas anidadas (ejemplo: hijos de empleados)
router.get("/:empleadoId/hijos", ControladorHijo.listar);
router.post("/:empleadoId/hijos", ControladorHijo.crear);

module.exports = router;
```

**Patrón:**
1. `Router()` de Express
2. `router.use(authenticateJWT)` global (todas las rutas requieren JWT válido)
3. `verificarPermiso(modulo, opcion, tipo)` middleware por ruta — permite granularidad (consulta vs edicion)
4. Rutas anidadas soportadas: `/api/rh/empleados/:empleadoId/hijos`
5. Manejo de IDs en params vs body

#### Patrón 2d: Frontend (ejemplo: EmpleadoPage.jsx, primeras 80 líneas)

**Ubicación:** `modules/rh/frontend/pages/EmpleadoPage.jsx`

**Estructura:**
```javascript
import { useState, useEffect } from "react";
import { obtenerEmpleados, crearEmpleado } from "../services/empleados.service";
import { solicitar } from "../../../portal/frontend/utils/api";
import {
  ESTADOS_MEXICO,
  BANCOS_MEXICO,
  GENEROS,
  ESTADOS_CIVILES,
  NIVELES_ESCOLARIDAD,
  TIPOS_CONTRATO,
} from "../constants/catalogos";

// Constantes de estilo reutilizables
const estiloSeccion = {
  borderBottom: "1px solid var(--color-borde)",
  paddingBottom: "0.75rem",
  marginBottom: "0.75rem",
  fontWeight: 700,
  color: "var(--color-primario)",
  fontSize: "0.88rem",
  marginTop: "1rem",
};

const estiloGrid2 = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "0.75rem",
};

const estiloGrid3 = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: "0.75rem",
};

const formularioInicial = {
  nombre: "",
  apellido_paterno: "",
  apellido_materno: "",
  // ... 35 campos más
};

export default function EmpleadoPage() {
  const [formulario, setFormulario] = useState(formularioInicial);
  const [empleados, setEmpleados] = useState([]);
  const [cargando, setCargando] = useState(false);
  // ... más estado

  useEffect(() => {
    cargarDatos();
  }, []);

  async function cargarDatos() {
    setCargando(true);
    const datos = await solicitar('/rh/empleados');
    if (datos?.exito) {
      setEmpleados(datos.datos);
    }
    setCargando(false);
  }

  async function manejarEnvio() {
    // POST/PUT a backend via solicitar()
    // Actualizar lista local
  }

  return (
    <div className="pagina-contenedor">
      {/* Modal de formulario */}
      {/* Tabla de listado */}
    </div>
  );
}
```

**Patrón:**
1. Imports: servicios, hooks, contextos, constantes
2. Constantes de estilo inline (evita recreación en cada render)
3. Estado inicial vacío/default para formularios
4. `useEffect` + `solicitar()` para obtener datos (util `solicitar()` añade `/api` automáticamente)
5. Funciones async para CRUD
6. Componentes Modales para formularios (create/edit)

**Archivos relevantes:**
- `/home/jamejia/intranet/modules/rh/backend/models/empleado.model.js` (línea 1-40)
- `/home/jamejia/intranet/modules/rh/backend/controllers/empleado.controller.js` (línea 1-60)
- `/home/jamejia/intranet/modules/rh/backend/routes/empleados.routes.js` (línea 1-51)
- `/home/jamejia/intranet/modules/rh/frontend/pages/EmpleadoPage.jsx` (línea 1-80)

---

### 3. PREGUNTA: Sistema de permisos — cómo agregar módulo Comercial

**Hallazgo: Sistema GRANULAR (Fase 2+) — modulo_opciones + rol_opcion_permisos**

#### 3a: Estructura en BD — 3 tablas clave

**Tabla 1: modulos**
```sql
CREATE TABLE modulos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,     -- 'comercial'
  path_reactivo VARCHAR(150),               -- '/comercial'
  descripcion TEXT,                        -- 'Cotizaciones y listas de precios'
  activo BOOLEAN DEFAULT true              -- false = no aparece en menú
);

-- Estado actual:
-- ('portal', '/', 'Portal central...', true),
-- ('auditoria', '/auditoria', '...', true),
-- ('tickets', '/tickets', '...', true),
-- ('rh', '/rh', '...', true),
-- ('bi', '/bi', '...', false),
-- ('comercial', '/comercial', '...', false)  ← YA EXISTE, PERO INACTIVO
```

**Tabla 2: modulo_opciones**
```sql
CREATE TABLE modulo_opciones (
  id SERIAL PRIMARY KEY,
  modulo_id INT NOT NULL REFERENCES modulos(id),
  nombre VARCHAR(100) NOT NULL,            -- 'Cotizaciones', 'Créditos', etc.
  descripcion TEXT,
  orden INT DEFAULT 0,
  UNIQUE(modulo_id, nombre)
);

-- Ejemplo para comercial:
-- modulo_id = (id de comercial), nombre = 'Cotizaciones', descripcion = 'Gestión de cotizaciones', orden = 1
-- modulo_id = (id de comercial), nombre = 'Créditos', descripcion = 'Solicitudes de crédito', orden = 2
-- modulo_id = (id de comercial), nombre = 'Precios', descripcion = 'Listas de precios', orden = 3
```

**Tabla 3: rol_opcion_permisos**
```sql
CREATE TABLE rol_opcion_permisos (
  rol_id INT NOT NULL REFERENCES roles(id),
  opcion_id INT NOT NULL REFERENCES modulo_opciones(id),
  tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('consulta', 'edicion')),
  PRIMARY KEY (rol_id, opcion_id, tipo)
);

-- Ejemplo para un rol 'comercial_admin':
-- (rol_id = comercial_admin, opcion_id = Cotizaciones, tipo = 'consulta'),
-- (rol_id = comercial_admin, opcion_id = Cotizaciones, tipo = 'edicion'),
-- (rol_id = comercial_admin, opcion_id = Créditos, tipo = 'consulta'),
-- (rol_id = comercial_admin, opcion_id = Créditos, tipo = 'edicion'),
```

#### 3b: Cómo activar el módulo Comercial

**Paso 1: Cambiar activo = true en BD**
```sql
UPDATE modulos SET activo = true WHERE nombre = 'comercial';
```

**Paso 2: Insertar opciones del módulo** (if not exists)
```sql
INSERT INTO modulo_opciones (modulo_id, nombre, descripcion, orden)
SELECT m.id, opc.nombre, opc.descripcion, opc.orden
FROM modulos m
JOIN (VALUES
  ('comercial', 'Cotizaciones', 'Gestión de cotizaciones de productos', 1),
  ('comercial', 'Créditos', 'Solicitudes de crédito a clientes', 2),
  ('comercial', 'Precios', 'Listas de precios y descuentos', 3)
) AS opc(modulo_nombre, nombre, descripcion, orden)
ON m.nombre = opc.modulo_nombre
ON CONFLICT (modulo_id, nombre) DO NOTHING;
```

**Paso 3: Asignar permisos a roles** (ejemplo: comercial_admin rol)
```sql
-- comercial_admin: acceso total a todas las opciones
INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT r.id, mo.id, t.tipo
FROM roles r
JOIN modulos m ON m.nombre = 'comercial'
JOIN modulo_opciones mo ON mo.modulo_id = m.id
CROSS JOIN (VALUES ('consulta'), ('edicion')) AS t(tipo)
WHERE r.nombre = 'comercial_admin'
ON CONFLICT DO NOTHING;
```

#### 3c: Middleware de verificación — cómo se valida en rutas

**Backend (ejemplo: rutas de Comercial)**
```javascript
const router = Router();
router.use(authenticateJWT);  // Todas las rutas requieren JWT

// Ruta con permiso granular
router.get("/", 
  verificarPermiso("comercial", "Cotizaciones", "consulta"), 
  ControladorCotizacion.listar
);

router.post("/", 
  verificarPermiso("comercial", "Cotizaciones", "edicion"), 
  ControladorCotizacion.crear
);

// verificarPermiso() middleware:
// - Extrae rol del usuario via JWT
// - Busca en rol_opcion_permisos (rol_id, opcion_id, tipo)
// - Si NO tiene permiso → res.status(403).json({ exito: false, mensaje: 'Sin permisos' })
// - Si SÍ tiene → next()
```

**Frontend (filtrado en menú)**
- `MenuDinamico.jsx` ya soporta filtrado de sub-rutas por permiso
- Si el módulo está activo en BD, aparece en el sidebar
- Las sub-rutas se filtran via `tieneAcceso(moduloNombre, opcion)` (línea 140-149)
- Permisos se obtienen del endpoint `GET /api/permisos/opciones` (cargado en main.jsx)

#### Nota sobre rol_id (cambio de arquitectura)

**Fase 1 (antiguo):** Multiple roles por usuario via tabla `usuario_rol`
**Fase 2+ (actual):** Un rol por usuario via columna `usuarios.rol_id` (más simple)

El proyecto ha migrado a Fase 2+. Ver `modules/portal/backend/models/usuario.model.js` para confirmar.

**Archivos relevantes:**
- `/home/jamejia/intranet/config/database/init.sql` (línea 352-470, sistema granular)
- `/home/jamejia/intranet/modules/portal/backend/middleware/permisos.middleware.js` (middleware)
- `/home/jamejia/intranet/modules/portal/frontend/components/MenuDinamico.jsx` (línea 140-149, filtrado)

---

### 4. PREGUNTA: Estructura exacta de SUB_RUTAS en MenuDinamico.jsx

**Hallazgo: SUB_RUTAS es array hardcodeado — define navegación y validación de permisos**

**Ubicación:** `modules/portal/frontend/components/MenuDinamico.jsx` línea 7-42

**Estructura exacta:**
```javascript
const SUB_RUTAS = {
  portal: [
    { path: '/', label: 'Inicio', opcion: null },
    { path: '/noticias', label: 'Noticias', opcion: 'Noticias' },
  ],
  rh: [
    { path: '/rh', label: 'Dashboard', opcion: null },
    { path: '/rh/empleados', label: 'Empleados', opcion: 'Empleados' },
    { path: '/rh/admin', label: 'Permisos y ausencias', opcion: 'Permisos' },
    { path: '/rh/vacaciones', label: 'Vacaciones', opcion: 'Vacaciones' },
    { path: '/rh/vacaciones/listado', label: 'Solicitudes', opcion: 'Vacaciones' },
    { path: '/rh/areas', label: 'Áreas', opcion: 'Empleados' },
    { path: '/rh/departamentos', label: 'Departamentos', opcion: 'Empleados' },
    { path: '/rh/puestos', label: 'Puestos', opcion: 'Empleados' },
    { path: '/rh/ubicaciones', label: 'Ubicaciones', opcion: 'Empleados' },
  ],
  comercial: [
    { path: '/comercial', label: 'Dashboard', opcion: null },
    { path: '/comercial/cotizaciones', label: 'Cotizaciones', opcion: 'Cotizaciones' },
    { path: '/comercial/creditos', label: 'Solicitudes de Crédito', opcion: 'Créditos' },
    { path: '/comercial/precios', label: 'Listas de Precios', opcion: 'Precios' },
  ],
};
```

**Campos por elemento:**
- `path: string` — ruta React (ej: `/rh/empleados`)
- `label: string` — texto visible en sidebar (ej: "Empleados")
- `opcion: string|null` — nombre de opción en `modulo_opciones` tabla (ej: "Empleados") → usado para validar permisos
  - `null` = dashboard, siempre visible

**Iconos por módulo:**
```javascript
const ICONOS_MODULOS = {
  portal: '🏠',
  rh: '👥',
  tickets: '🎫',
  auditoria: '📋',
  bi: '📊',
  comercial: '💼',  // ← Sugerencia: usar emoji comercial
};
```

**Rutas de módulos (para módulos SIN sub-rutas):**
```javascript
const RUTAS_MODULOS = {
  portal: '/',
  tickets: '/tickets',
  rh: '/rh',
  auditoria: '/auditoria',
  bi: '/bi',
  comercial: '/comercial',  // ← entrada ya existe
};
```

**Implicación:**
- Para activar Comercial, SOLO se necesita:
  1. Actualizar `modulos.activo = true` en BD
  2. Agregar SUB_RUTAS['comercial'] (ya está en código)
  3. Crear componentes React en `modules/portal/frontend/routes/` para cada ruta
  4. El sidebar automáticamente filtrará por permisos via `tieneAcceso()`

**Archivos relevantes:**
- `/home/jamejia/intranet/modules/portal/frontend/components/MenuDinamico.jsx` (línea 7-61)

---

### 5. PREGUNTA: Generación de PDF — ¿qué librería usar?

**Hallazgo: NO hay generación PDF instalada — Recomendación: Puppeteer + HTML→PDF**

**Búsqueda realizada:**
- Checklist: `puppeteer`, `pdf-lib`, `jspdf`, `pdfkit`, `html-pdf`
- Ubicación: `/home/jamejia/intranet/modules/*/backend/package.json`
- Resultado: NINGUNA librería PDF instalada

**Análisis de opciones:**

| Librería | Caso de uso | Pros | Contras |
|----------|---|---|---|
| **Puppeteer** (recomendado) | HTML → PDF servidor | Mantiene CSS, layout exacto, imágenes | Requiere Chrome/Chromium, ~100MB, más lento |
| **pdf-lib** | Crear PDF desde scratch | Ligero, sin dependencias | API compleja, sin manejo CSS |
| **jsPDF** | Generación simple | Ligero, usado en frontend | Sin CSS nativo, complicado para layouts complejos |
| **pdfkit** | Node.js solo | Ligero, soporta imágenes | Sintaxis compleja, sin CSS |

**Recomendación para Comercial:**
- **Puppeteer** si necesitas generar PDF de cotizaciones/créditos con formato visual exacto (logos, tablas, estilos)
- **pdfkit** si solo necesitas tablas y texto simple (más rápido, menor footprint)

**Instalación recomendada (Puppeteer):**
```bash
npm install --save puppeteer
# o
npm install --save puppeteer-core  # si Chrome está disponible system-wide
```

**Patrón de uso (ejemplo controller comercial):**
```javascript
const puppeteer = require('puppeteer');

async function generarPDFCotizacion(req, res) {
  try {
    const cotizacion = await Cotizacion.obtener(req.params.id);
    
    // Generar HTML (puede ser template file o string)
    const html = `
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; }
            .logo { width: 100px; }
          </style>
        </head>
        <body>
          <img src="/logo-rayhsa.png" class="logo" />
          <h1>Cotización ${cotizacion.numero}</h1>
          <table>...</table>
        </body>
      </html>
    `;
    
    // Convertir HTML a PDF
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.setContent(html);
    const pdf = await page.pdf({ format: 'A4' });
    await browser.close();
    
    // Enviar al cliente
    res.contentType('application/pdf');
    res.send(pdf);
  } catch (error) {
    return res.status(500).json({ exito: false, mensaje: error.message });
  }
}
```

**Implicación:**
- Agregar `puppeteer` a `modules/portal/backend/package.json` (usado por todos los módulos)
- Crear servicio `modules/comercial/backend/services/pdf.service.js`
- Rutas con permisos: `GET /comercial/cotizaciones/:id/pdf`

**Archivos relevantes:**
- `/home/jamejia/intranet/modules/portal/backend/package.json` (dependencies, falta puppeteer)

---

### 6. PREGUNTA: Firma exacta de registrarAccion — uso en comercial

**Hallazgo: Auditoría centralizada — `registrarAccion(req, modulo, tabla, registroId, accion, valoresPrevios, valoresNuevos)`**

**Ubicación:** `modules/auditoria/backend/services/auditoria.service.js` línea 4

**Firma exacta:**
```javascript
async registrarAccion(req, modulo, tabla, registroId, accion, valoresPrevios, valoresNuevos)
```

**Parámetros:**
- `req` — request object (extrae usuario_id, IP, user-agent)
- `modulo` — nombre módulo (string): "comercial", "rh", "tickets"
- `tabla` — tabla BD (string): "cotizaciones", "solicitudes_credito", "precios"
- `registroId` — ID del registro afectado (int|string, será convertido a string)
- `accion` — tipo acción (string): "crear", "actualizar", "eliminar", "cambiar_estado"
- `valoresPrevios` — JSONB (antes de cambio) — `null` para crear
- `valoresNuevos` — JSONB (después de cambio) — `{ campo: valor, ... }`

**Ejemplo de uso en controller comercial:**

```javascript
async crear(req, res) {
  try {
    const { numero, cliente_id, monto, detalles } = req.body;
    
    // Crear registro
    const cotizacion = await Cotizacion.crear({
      numero,
      cliente_id,
      monto,
      detalles,
      estatus: 'borrador'
    });
    
    // Registrar en auditoría (valoresPrevios = null para crear)
    await registrarAccion(
      req,                                    // request
      'comercial',                            // modulo
      'cotizaciones',                         // tabla
      cotizacion.id,                          // registroId
      'crear',                                // accion
      null,                                   // valoresPrevios (no hay previos en crear)
      {
        numero: cotizacion.numero,
        cliente_id: cotizacion.cliente_id,
        monto: cotizacion.monto,
        detalles: cotizacion.detalles,
        estatus: cotizacion.estatus
      }                                       // valoresNuevos
    );
    
    return res.status(201).json({
      exito: true,
      datos: cotizacion
    });
  } catch (error) {
    // Auditoría nunca interrumpe flujo
    return res.status(500).json({
      exito: false,
      mensaje: error.message
    });
  }
}
```

**Ejemplo de actualización:**

```javascript
async actualizar(req, res) {
  try {
    const id = req.params.id;
    const datosNuevos = req.body;
    
    // Obtener valores previos
    const cotizacionAnterior = await Cotizacion.obtener(id);
    
    // Actualizar
    const cotizacionActualizada = await Cotizacion.actualizar(id, datosNuevos);
    
    // Registrar cambios (solo campos modificados)
    const cambios = {};
    for (const [campo, valor] of Object.entries(datosNuevos)) {
      if (cotizacionAnterior[campo] !== valor) {
        cambios[campo] = valor;
      }
    }
    
    if (Object.keys(cambios).length > 0) {
      await registrarAccion(
        req,
        'comercial',
        'cotizaciones',
        id,
        'actualizar',
        { /* solo campos modificados */ },
        cambios
      );
    }
    
    return res.json({
      exito: true,
      datos: cotizacionActualizada
    });
  } catch (error) {
    return res.status(500).json({
      exito: false,
      mensaje: error.message
    });
  }
}
```

**Características de auditoría:**
- **Nunca interrumpe el flujo:** Si falla auditoría, se registra en logs pero la operación continúa
- **Almacena IP y user-agent:** Extrae de `req.headers['x-forwarded-for']` y `req.headers['user-agent']`
- **Usuarios anónimos soportados:** Si no hay usuario, `usuario_id = null`
- **JSONB completo:** Almacena cambios como JSON estructurado para búsqueda posterior

**Archivos relevantes:**
- `/home/jamejia/intranet/modules/auditoria/backend/services/auditoria.service.js` (línea 1-26)
- `/home/jamejia/intranet/config/database/init.sql` (línea 6-18, tabla auditoria)

---

### Implicación para el equipo

1. **PDFs:** Documentación MBA3 API y Solicitud Crédito necesitan ser extraídos manualmente o requerida como DOCX/TXT
2. **Patrones:** Comercial seguirá arquitectura estándar Model→Controller→Routes de RH (PERN)
3. **Permisos:** Módulo YA existe en BD (inactivo). Solo necesita:
   - Activar con `UPDATE modulos SET activo = true WHERE nombre = 'comercial'`
   - Agregar opciones a `modulo_opciones` (Cotizaciones, Créditos, Precios)
   - Asignar permisos a roles via `rol_opcion_permisos`
4. **Frontend:** SUB_RUTAS ya está hardcodeado para comercial. Solo necesita componentes React.
5. **PDF:** Agregar `puppeteer` a `modules/portal/backend/package.json` para generar PDFs de cotizaciones/créditos
6. **Auditoría:** Todos los CRUD automáticamente registrados via `registrarAccion(req, 'comercial', tabla, id, accion, antes, después)`

**Archivos clave para siguiente fase:**
- `/home/jamejia/intranet/modules/portal/frontend/components/MenuDinamico.jsx` (SUB_RUTAS ya listo)
- `/home/jamejia/intranet/config/database/init.sql` (sistema permisos)
- `/home/jamejia/intranet/modules/rh/backend/` (patrones a copiar: models, controllers, routes)
- `/home/jamejia/intranet/modules/portal/backend/package.json` (agregar puppeteer)


### [2026-10-14] [investigador] — Noticias, eventos e imágenes: estado actual para 500x750, boletín y carrusel
**Pregunta:** Estado actual (código y datos) de noticias/eventos para: (a) imagen vertical 500x750 centrada en el área de contenido; (b) categoría "boletín" solo con imagen; (c) varias imágenes por evento en carrusel. Sin diseño de solución.

**Hallazgo:**

**1. Base de datos**
- Tabla `noticias` (`config/database/init.sql:74-85`; igual en `modules/portal/backend/migrations/001-crear-tablas-portal.sql:55-66`): `id SERIAL`, `titulo VARCHAR(255) NOT NULL`, `subtitulo TEXT`, `contenido TEXT`, `tipo VARCHAR(30)` (línea 79), `fecha_publicacion DATE`, `publicada BOOLEAN DEFAULT false`, `autor_id INT REFERENCES usuarios(id)`, `fecha_creacion`, `fecha_actualizacion`. No hay columna de categoría distinta de `tipo`.
- Tabla `noticia_imagenes` (`init.sql:88-95`): `id`, `noticia_id INT NOT NULL REFERENCES noticias(id) ON DELETE CASCADE` (línea 90), `ruta_archivo VARCHAR(255) NOT NULL` (91), `nombre_archivo VARCHAR(255)` (92), `orden INT DEFAULT 0` (93), `fecha_subida`. No tiene ancho, alto ni proporción. Ninguna migración de `modules/portal/backend/migrations/` crea `noticia_imagenes`; solo existe en `init.sql` (baseline según `memory/decisions.md:177`).
- No hay CHECK, enum ni catálogo para `tipo` (`init.sql:79`). Valores que existen en código: `noticia`, `comunicado`, `oferta_empleo` (`modules/portal/frontend/components/NoticiaCard.jsx:3-7,15-19`; `NewsEditorModal.jsx:124-126`; `PortalNoticias.jsx:42-44`; `NewsCarousel.jsx:19`). El backend no valida `tipo`: lo pasa tal cual (`noticia.controller.js:84`), con default `"noticia"` en `noticia.model.js:44`.
- Sin seed de noticias en `init.sql` (no hay `INSERT INTO noticias`). En dev, según decisión previa, había 3 noticias con 3 imágenes cuyos archivos ya no existen en disco (`memory/decisions.md:66,84`). No se consultó la BD de staging ni producción (investigación solo de lectura de código).
- Límite de imágenes: 5 por noticia, aplicado en controlador (`noticia.controller.js:4,134-140`) y en UI (`NewsEditorModal.jsx:10,62-63,199`). No hay restricción en BD. El chequeo es "contar y luego insertar" (no atómico, `controller:134-140`). `orden` se asigna como el conteo actual al insertar (`noticia.model.js:166-167`); no hay UI para reordenar.
- Borrado: `ON DELETE CASCADE` borra filas de imágenes (`init.sql:90`). El controlador además borra los objetos de Storage con limpieza best-effort (`noticia.controller.js:108-117`, `8-15`).

**2. Backend**
- Rutas (`modules/portal/backend/routes/noticia.routes.js`): públicas sin JWT `GET /publicas`, `GET /publicadas` y `GET /:id` (líneas 12-14). Con JWT (línea 16): `GET /` requiere `Noticias:consulta` (18); `POST /`, `PUT /:id`, `DELETE /:id` y las imágenes requieren `Noticias:edicion` (19-21, 24-34). Montaje en `modules/portal/backend/app.js:41`.
- **Qué valida crear:** solo `titulo` obligatorio (`noticia.controller.js:76-78`). Actualizar no valida nada (`:96-106`). No hay validación de `tipo`, de fechas ni de `contenido`.
- **Imágenes:** `multer.memoryStorage()` con filtro por `mimetype` declarado por el cliente (`modules/portal/backend/middleware/upload.noticia.middleware.js:3,14,16`): JPG, PNG, GIF, WebP; límite 5 MB (`:22`). Se sube una imagen por petición, campo `imagen` (`noticia.routes.js:27`). No hay validación de dimensiones, proporción ni comprobación de contenido real (magic bytes). Ni `sharp`, `jimp` ni `canvas` están en `package.json` (solo `multer` en módulos rh/tickets).
- **Flujo:** clave `claveSegura()` (`modules/portal/backend/services/storage.service.js:205-219`), subida a bucket `noticias` (`:134`), insert en `noticia_imagenes` con compensación si falla (`noticia.controller.js:142-150`). La clave base del nombre no tiene longitud máxima, mientras `ruta_archivo` y `nombre_archivo` son `VARCHAR(255)`: un nombre largo puede fallar al insertar (riesgo, no comprobado).
- **Respuestas:** listado y detalle devuelven la noticia con `autor_nombre`, `autor_apellido` e `imagenes` (JSON agregado ordenado por `orden, fecha_subida`, `noticia.model.js:3-9`). Cada imagen recibe `url` pública vía `conUrls` (`:13-22`) salvo las legadas `/uploads/`. `GET /publicadas` devuelve `{noticias,total,pagina,limite,paginas_totales}` (`noticia.controller.js:24-33`). La subida devuelve `datos` con `url` (`:151-153`).
- **Riesgo de publicación:** `GET /api/noticias/:id` es público y `obtenerPorId` no filtra `publicada` (`noticia.model.js:82-92`; `noticia.routes.js:14`). Quien conozca el id puede leer un borrador. No contradice ninguna decisión previa (`memory/decisions.md` no fija visibilidad de borradores), pero es relevante si boletines o eventos se guardan como borrador.
- **Permisos:** `verificarPermiso('portal','Noticias',…)` en `noticia.routes.js` (líneas 18-34). Hay además `modules/portal/config/portal.permissions.js:43-49` con reglas distintas (p. ej. DELETE solo admin), pero ningún archivo lo importa (grep vacío): config muerta, divergente.
- **Auditoría:** solo en `POST /` (`noticia.routes.js:19`, `auditoriaMiddleware`). No hay auditoría en PUT, DELETE ni en imágenes (`:20-21,24-34`).
- **Tests:** solo `modules/portal/backend/tests/storage.service.test.js:17-49` menciona el bucket `noticias`. No hay tests de modelo, controlador, rutas ni middleware de noticias. No existen `modules/portal/tests/` ni `noticia.controller.test.js`/`noticias.integration.test.js` que cita `PLAN.md:209-211`. El frontend no tiene tests unitarios (`memory/decisions.md:126`).

**3. Frontend: vistas que pintan noticias o imágenes y cómo dimensionan hoy**
- **PortalHome → NewsCarousel** (`pages/PortalHome.jsx:75-80`): carrusel a pantalla completa (`components/NewsCarousel.jsx`). Usa solo `imagenes[0]` (`NewsCarousel.jsx:80`). Contenedor `.news-hero`: alto `calc(100dvh - 56px - 4rem)`, `min-height: 420px` (`styles/rayhsa-system.css:431-441`). Imagen `position:absolute; inset:0; width:100%; height:100%; object-fit:cover` (`:469-476`), es decir, recorte de cobertura al ancho completo de la diapositiva. En móvil `calc(100dvh - 56px - 2rem)` (`:619-627`).
  - Props: `noticias`, `onOpen`, `verTodasTo='/noticias'` (`NewsCarousel.jsx:31`). Qué incluye: `PortalHome.jsx:59-64` toma todo lo que no sea `oferta_empleo` y limita a 10 (`MAX_PUBLICACIONES`, `:16`). Viene de `obtenerNoticiasPublicadas(1, 50)` (`:53`).
  - Autoavance: no existe (cero `setInterval`). Navegación por scroll-snap horizontal, flechas (`NewsCarousel.jsx:140-141`), barras (`:122-135`), teclado (`:62-65`) y deslizar.
  - Etiquetas: `ETIQUETAS` solo cubre `comunicado` y `oferta_empleo` (`:19`). Un tipo nuevo se muestra como texto crudo (`:109`), y se clasifica como `noticia` a efectos de estilo (`:85`).
  - Sin imagen: fondo `news-hero__sin-imagen` (`rayhsa-system.css:478-485`).
- **PortalNoticias** (`pages/PortalNoticias.jsx:54-58`): cuadrícula `.grid-noticias` con `repeat(auto-fill, minmax(300px,1fr))` (`styles/globales.css:872-876`). Filtra por tipo en cliente después de paginar en servidor (`PortalNoticias.jsx:16,19-21`): los conteos y páginas no coinciden con el filtro. Opciones de filtro sin boletín (`:41-44`).
- **NoticiaCard** (`components/NoticiaCard.jsx:22-32`): primera imagen en `.noticia-imagen-preview`, altura fija 130px, `object-fit:cover` (`styles/globales.css:3127-3138`). Tipo desconocido: icono 📄 y etiqueta cruda (`NoticiaCard.jsx:36-38`).
- **ArticleModal** (`components/ArticleModal.jsx:33-34,56-65`): solo la primera imagen, como `background-image` con `cover` (`:58-62`). Contenedor `.rayhsa-modal__media` con altura fija 220px (`styles/rayhsa-system.css:997-1002`), `.rayhsa-modal` de ancho máx. 760px (`:959-963`); en ≤640px la altura pasa a 160px (`:2017-2024`). Solo distingue `comunicado` del resto (`PortalHome.jsx:78`). Los botones "Marcar como leído", "Compartir" y "Descargar PDF" no tienen `onClick` (`ArticleModal.jsx:83-84,128`).
- **NewsEditorModal** (`components/NewsEditorModal.jsx`): selector de tipo con 3 opciones (`:121-128`). Máx. 5 imágenes (`:10,62-63`). Cada subida es una imagen a la vez (`:55-78`, input sin `multiple`, `:202-209`). Exige guardar antes de subir (`:58-61,172-176`). Miniaturas de 80x60 con `cover` (`styles/globales.css:3077-3089`).
- **PortalAdminNoticias** (`pages/PortalAdminNoticias.jsx:72-109`): tabla sin miniaturas; muestra `noticia.tipo` crudo (`:87`); carga hasta 100 (`:20`).
- **Otros lugares:** `urlImagenNoticia` (`utils/storage.js:4-12`) solo usa `imagen.url` del backend o construye la URL pública. No hay otro carrusel reutilizable: `JobsTicker` es una cinta de texto para vacantes (`components/JobsTicker.jsx`). `App.jsx` duplica rutas de noticias (`:8,88`) pero no lo importa nadie (`index.html:14` carga `/main.jsx`): código muerto.
- **Área de contenido:** `main.app-contenido` (`main.jsx:142`) dentro de `.app-main` con `margin-left: var(--ancho-sidebar)` (`styles/rayhsa-system.css:182-187`; `--ancho-sidebar: 220px` en `:41`) y padding `1.5rem 2rem 2rem` (`:295-300`). Sin sesión se usa `main.contenido-principal` (`main.jsx:121`; `globales.css:503-507`). Ancho útil de escritorio ≈ viewport − 284 px.
- **Clases de modo móvil:** `.rayhsa.is-mobile` (`rayhsa-system.css:1175-1233`) e `is-tablet` (`:1444-1508`) no se aplican en ningún JSX (grep vacío). Solo funcionan las `@media` (768, 640, 480 px).

**4. Eventos**
- "Evento" **no existe** como concepto de noticias: no es `tipo`, no es tabla ni módulo. Tipos reales: `noticia`, `comunicado`, `oferta_empleo`. "Eventos" aparece solo en la bitácora de auditoría (`modules/auditoria/frontend/pages/AuditoriaDashboard.jsx:58,68-80`) y como etiqueta de gráfica (`modules/portal/frontend/components/GraficaBarras.jsx:5`). `PLAN.md` no define eventos para noticias.
- "Boletín" solo aparece en `docs/UI/modules/portal/frontend/components/ComunicadosGrid.jsx:17` (título de sección "Comunicados y boletines"), en un mockup de docs que la app no importa. No hay boletín en código vivo.

**5. Riesgos y restricciones**
- **Redimensionado:** no hay redimensionado ni recorte en servidor (sin librería de imágenes) ni en cliente. Todo es CSS. El tamaño 500x750 no puede garantizarse con el código actual.
- **Imágenes horizontales existentes con 500x750 forzado:** con `cover`, una imagen 3:2 o 16:9 se escala por altura y se recorta por los lados; una 2:3 se recorta por arriba y abajo. Como la BD no guarda dimensiones (`init.sql:88-95`), no se sabe la proporción de lo ya subido sin leer los archivos de Storage.
- **Cálculo de recorte en el carrusel de escritorio** (viewport 1280x1024, a modo de ejemplo): área ≈ 996x904 px. Una imagen 2:3 con `cover` se escala a ~996x1494 y muestra ~60% de su altura. Con `contain` quedarían franjas laterales grandes.
- **Modal:** imagen 2:3 en 760x220 con `cover` muestra ~19% de su altura (escala a 760x1140).
- **Tarjeta:** preview de 130 px de alto con `cover`: recorte fuerte para vertical.
- **Límites de tamaño:** Storage (`noticias`) limita 5 MB y 4 MIME (`storage.service.js:55-60`). La creación del bucket es idempotente: si ya existe, `asegurarBuckets` solo avisa cuando `public` no coincide y **no actualiza `file_size_limit` ni `allowed_mime_types`** (`:182-203`). Cambiar la configuración no afecta al bucket de producción ya creado.
- **nginx (prod):** `docker-compose.prod.yml:90` monta `config/nginx/nginx.conf`. Ahí `client_max_body_size 50m` solo está en la ruta `/storage/v1/` (`nginx.conf:63`), no en `/api/`, así que aplica el valor por defecto de 1 MB. Una imagen de más de 1 MB que suba por `/api/noticias/:id/imagenes` recibe un 413 en HTML antes de multer (que acepta 5 MB). Como `subirImagenNoticia` hace `respuesta.json()` sin comprobar el estado (`noticias.service.js:49`), el usuario verá un error de parseo genérico. Staging usa `nginx.spa.conf` con `client_max_body_size 50m` a nivel servidor (`:7`, `Dockerfile.frontend:53`); dev usa el proxy de Vite sin límite visible.
- **Móvil:** el carrusel depende de `100dvh` y de `min-height: 420px`. Un 500 px fijo no cabe en pantallas de ~360-430 px de ancho: el objetivo "500x750" solo puede ser proporción 2:3 con ancho relativo (no px fijos). Las reglas `is-mobile`/`is-tablet` no están activas (ver 3).
- **Multer:** `memoryStorage` con 5 MB por petición; el filtro usa el tipo MIME del cliente, sin validar contenido.
- **Tests:** ninguna protección automatizada del flujo de imágenes ni del frontend. Cualquier cambio de proporción o de tipos no tendría red de pruebas.

**6. Preguntas abiertas para producto (no deducibles del código)**
1. Proporción 2:3: ¿recorte (cover), franjas (contain) o fondo desenfocado? ¿Los 500x750 son píxeles fijos o solo la proporción?
2. ¿Se valida la proporción al subir (rechazar o pedir recorte), se redimensiona en servidor (nueva dependencia, p. ej. `sharp`) o solo se muestra?
3. ¿Qué pasa con las imágenes horizontales ya subidas: recortarlas, mostrarlas con franjas o pedir resubida?
4. Boletín: ¿es un tipo nuevo (valor `boletin` en `tipo`, sin enum en BD)? ¿Debe aparecer en el carrusel de inicio (hoy entra todo lo que no es `oferta_empleo`)? ¿Tiene una o varias imágenes? ¿Al hacer clic abre algo o no hace nada? ¿Aparece en `/noticias` y en el filtro?
5. Evento: ¿es un tipo nuevo de noticia o una entidad aparte? ¿Requiere campos propios (fecha del evento, lugar)? ¿Va al carrusel principal o solo a su propia vista?
6. Varias imágenes por evento: ¿el carrusel es dentro de la tarjeta/modal del evento o es el carrusel principal? ¿Autoavance? ¿Se mantiene el máximo de 5? ¿Hace falta reordenar (hoy el orden es el de subida)?
7. ¿Se mantiene el límite de 5 MB por imagen? ¿Se corrige el límite de 1 MB de nginx en `/api/` (prod)?
8. Permisos: ¿quién crea boletines o eventos (hoy cualquiera con `Noticias:edicion`)? ¿Se restringe la lectura por id de borradores?
9. ¿Las tarjetas de `/noticias` también pasan a 2:3 o solo el carrusel y el modal?
10. Los 3 archivos de dev ya no existen: ¿se resubirán a mano?

**Implicación:**
- Para las fases, el primer bloque es de CSS y de modelo de presentación (proporción, carrusel, modal, tarjeta), sin tocar BD. Cualquier garantía de 500x750 necesita una decisión sobre procesado de imagen (CSS vs servidor + dependencia), porque hoy no existe.
- Boletín es un valor nuevo de `tipo` sin cambios de BD, pero el frontend tiene que decidir cómo lo trata el carrusel (hoy entra por defecto y su etiqueta sería cruda). Evento no existe: es decisión de producto y puede implicar tabla o campos nuevos.
- El carrusel de imágenes por evento tiene soporte parcial en BD (1:N con `orden`, máx. 5 por API), pero el frontend solo muestra la primera imagen en tres lugares. Es el mayor cambio de UI pendiente.
- Antes de cambiar límites hay que corregir nginx de prod (`/api/` sin límite, 1 MB) y tener en cuenta que `asegurarBuckets` no actualiza buckets existentes.
- Riesgos a incluir en el plan: visibilidad por id de borradores (`noticia.routes.js:14`), auditoría incompleta (solo POST), config de permisos muerta (`portal.permissions.js`), y cero tests de noticias.
- Ningún hallazgo contradice una decisión previa: no se escribió entrada CONFLICTO.

### [2026-10-15] [investigador] — Vacaciones y calendario laboral: flujo actual, fechas, permisos, cupo y frontend (base para la tarea)
**Pregunta:** Para el calendario laboral (oficial/otorgado/evento), días hábiles en vacaciones y bloqueo por cupo de departamento: (1) flujo actual de solicitud, cálculo de días, saldo y aprobación (¿revalida algo al aprobar?); (2) manejo de fechas y tipo de columnas; (3) cómo se define un permiso nuevo y quién puede administrar; (4) dónde ubicar el cupo; (5) rutas, sidebar, librerías de fecha y date input; (6) tests existentes; (7) riesgos y preguntas abiertas. Se respetan las decisiones de `decisions.md` (entrada 2026-10-15 "Calendario laboral..."). Sin conflictos con decisiones previas: no se escribe entrada CONFLICTO. `blockers.md` está vacío.

**Hallazgo:**

**1. Flujo actual de vacaciones (backend)**
- Modelo `modules/rh/backend/models/solicitudVacaciones.model.js`:
  - `calcularDisfrutados` suma `dias_a_disfrutar` solo de `estatus='aprobado'` del mismo `periodo` (`:15-23`, filtro en `:19`). `calcularSaldo` (`:25-46`) devuelve `dias_periodo` (lookup en `tabla_calculo_vacaciones`, `:4-13`), `dias_disfrutados` y `dias_pendientes = periodo - disfrutados` (`:43`). Las pendientes NO restan del saldo.
  - Antigüedad = `anio_periodo - fecha_ingreso.getFullYear()`, mínimo 1 (`:30-39`).
  - `tieneTraslape` (`:222-239`) bloquea por **mismo empleado** contra `estatus IN ('pendiente','aprobado')` (`:226`). No considera departamento.
  - `responder` (`:204-220`) hace `UPDATE ... WHERE id=$5` **sin** condición `estatus='pendiente'`.
- Controlador `modules/rh/backend/controllers/vacaciones.controller.js`:
  - `crear` (`:49-206`): valida fechas `:60-65` y orden `:81-86`; `periodoCalculado = parseInt(periodo) || new Date(fecha_inicial).getFullYear()` (`:88-89`); traslape por empleado (`:99-110`); saldo (`:112-115`); **días = `Math.round((fin-inicio)/día)+1` = días naturales** (`:117-118`); rechazo si `dias > saldo.dias_pendientes` (`:120-125`); luego `SolicitudVacaciones.crear` (`:142-164`) copia `departamento: empleado.departamento` (`:151`), que es el **nombre** del departamento (`empleado.model.js:46,52`), no el id. Notifica al jefe (`:166-178`) y audita INSERT (`:180-192`). Cualquier excepción responde **400** con `error.message` (`:199-204`).
  - **No hay transacción ni bloqueo**: todas las queries son `grupo.query` sueltas.
  - `responder` (`:287-380`): solo valida `estatus` (`:291-296`), `motivo_rechazo` al rechazar (`:298-303`) y que el estado previo sea `pendiente` (`:312-317`). **No revalida saldo, traslape ni cupo al aprobar**. Luego UPDATE (`:324-330`), notifica (`:332-352`) y audita UPDATE (`:354-366`).
  - `listar` (`:208-267`): `esAdmin` = rol `super_admin`/`rh_admin` por nombre (`:214`) o `tienePermiso(...,'rh','Empleados','edicion')` (`:215`). `puede_responder` en `:243-246`.
- Rutas `modules/rh/backend/routes/vacaciones.routes.js`:
  - `POST /` requiere `Vacaciones:edicion` + `empleadoPropioEnPeticion` (`:44-49`); `PUT /:id/responder` requiere `Vacaciones:edicion` + `accesoEmpleado` con `permitirDueno:false` y `permitirSi` = jefe inmediato de la solicitud (`:51-62`, regla en `:23-27`). RH (`Empleados:edicion`) pasa siempre (`middleware/acceso-empleado.middleware.js:62`).
- Montaje: `modules/portal/backend/app.js:48`.
- Migración de base: `modules/rh/backend/migrations/002-solicitudes-vacaciones.sql` (tabla `tabla_calculo_vacaciones` `:1-11`, tabla `solicitudes_vacaciones` `:13-44`). Las 16 filas de tabla de días están en `:7-10`.

**2. Fechas, zona horaria y tipos de columna**
- Columnas: `fecha_inicial DATE NOT NULL`, `fecha_final DATE NOT NULL`, `fecha_regreso DATE` (`002:27-29`); `fecha_solicitud` y `fecha_creacion` son `TIMESTAMP` (`002:15,43`). `empleados.fecha_ingreso` es `DATE` (`config/database/init.sql:252`). `departamentos` (`init.sql:208-215`) **no tiene cupo ni capacidad**.
- `solicitudes_vacaciones` no tiene `departamento_id`: solo `departamento VARCHAR(100)` (`002:24`), copia de nombre.
- Trampa comprobada (Node 20+, con `pg-types` del repo, `node_modules/pg-types` v2.2.0):
  - `new Date("2027-01-01").getFullYear()` devuelve **2026** con `TZ=America/Mexico_City` y 2027 con UTC o Europe/Madrid. Afecta `controller:89` (periodo asignado) y en el frontend cualquier `new Date(texto)` sin hora.
  - pg devuelve DATE como medianoche **local**: con `TZ=Europe/Madrid` el JSON sale como `"2026-12-31T23:00:00.000Z"` (día anterior). El frontend formatea con `timeZone:"UTC"` (`VacacionesPage.jsx:118-126`), así que mostraría el día anterior si el proceso Node corre con offset positivo. No hay `setTypeParser` ni `TZ` en Dockerfiles/compose (grep vacío), por lo que en contenedor (UTC por defecto) no se observa hoy; en el host de dev (WSL) sí es relevante.
  - El cálculo de días usa `Date` en UTC (`controller:78-79,117-118`), que es estable; el DST no aplica en México desde 2022.
- Fecha de referencia verificada: 2026-10-17 es sábado (`getUTCDay()=6`).

**3. Permisos, roles y auditoría**
- Opción `Vacaciones` de `rh`: `config/database/init.sql:395` (seed, con `Ubicaciones` `:397`) y `modules/portal/backend/migrations/003-opcion-vacaciones-rh.sql:4-28` (crea la opción y da `consulta`+`edicion` a `rh_admin` y `rh_empleado`). Las opciones `Empleados`, `Expedientes`, `Permisos`, `Recibos` se crean en `002-modelo-permisos-granular.sql:44-50`.
- Modelo de permisos: `usuarios.rol_id` (un rol por usuario, `002:33-43`); `rol_opcion_permisos(rol_id, opcion_id, tipo)` con `tipo IN ('consulta','edicion')`. `verificarPermiso` (`modules/portal/backend/middleware/permisos.middleware.js:36-82`) y `tienePermiso` (`:9-28`) dan bypass a `super_admin` por nombre (`:11,43`); `edicion` cubre solo `edicion`, `consulta` acepta ambos (`:14`).
- Roles (`init.sql:103-112`, `seeds/001-semilla-inicial.sql:5-17`): `super_admin`, `portal_admin`, `rh_admin`, `rh_empleado`, `tickets_*`, `bi_*`, `comercial_admin`, `auditoria_viewer`.
  - `rh_admin` tiene acceso total a `rh` (`init.sql:431-438`; `seeds/001:128-135`).
  - `rh_empleado` tiene `Vacaciones` consulta+edición y `Permisos`/`Recibos`/`Expedientes` consulta (`seeds/001:138-...`, `init.sql:441`, `rh/008`).
  - `portal_admin` solo tiene permisos de `portal` (`seeds/001:109-...`). Pero el menú lo trata como admin: `ROLES_ADMIN = ['super_admin','portal_admin']` (`modules/portal/frontend/components/MenuDinamico.jsx:56`). "Administradores" es ambiguo (ver preguntas).
- Trampa: **la opción `Departamentos` no está sembrada** (grep: 0 coincidencias en `init.sql` y en todas las migraciones), y `departamentos.routes.js:9-13` exige `rh/Departamentos`. Solo `super_admin` pasa; `rh_admin` recibiría 403 en `/api/departamentos`. Igual pasa con `Puestos` y `Áreas` (sus rutas usan opciones no sembradas; verificado solo para Departamentos).
- Cómo se define un permiso nuevo (patrón del repo): (a) `INSERT INTO modulo_opciones` (como `portal/003`); (b) `rol_opcion_permisos` para cada rol; (c) la misma opción en `config/database/init.sql` (bloque `:380-397`) porque el init carga ese archivo; (d) `verificarPermiso` en la ruta. `rh/config/rh.permisos.js` y `portal/config/portal.permissions.js` son configuración muerta (ningún `require`, ver `noticias` en el investigador previo): no las uses como fuente.
- Auditoría: `registrarAccion(req, modulo, tabla, registroId, accion, previos, nuevos)` en `modules/auditoria/backend/services/auditoria.service.js:4-26`. **Nunca lanza**: si falla devuelve `null` y solo imprime en consola (`:21-25`), así que una auditoría perdida no se nota. `auditoriaMiddleware(modulo, tabla, accion)` existe en `modules/auditoria/backend/middleware/auditoria.middleware.js:7` y lo usa `portal/controllers/modulo.controller.js:2`. Vacaciones usa la función directa dentro de try/catch (`controller:180-192,354-366`).

**4. Dónde ubicar el cupo (dos alternativas)**
- **A. Columna en `departamentos`** (p. ej. `cupo_vacaciones INT NULL`, NULL = sin límite). Costo: migración `rh/009` + bloque en `init.sql` + dos sitios en `docker-compose.supabase.yml` (volumen `:76-82` y comando `:93-104`); `departamento.model.js` `actualizar` (`:20-47`) y `crear` (`:4-9`) amplían campos; `DepartamentosPage.jsx` ya es CRUD genérico (`apiRuta="/departamentos"`, `:17`), así que el campo entra con poco código. Requiere sembrar la opción `Departamentos` (o reusar `Empleados`) para que `rh_admin` la edite. Ventaja: cupo por departamento sin tablas extra. Desventaja: no hay valor por defecto global.
- **B. Tabla de configuración** (fila única `cupo_default` + tabla opcional `departamento_cupo(departamento_id, cupo)`, patrón de `tabla_calculo_vacaciones`, `002:1-11`). Costo: 1-2 tablas, endpoint y pantalla nuevos (no existe ni tabla genérica de parámetros: grep `configur|parametro|settings` en `init.sql` vacío) y su propio permiso. Ventaja: un default y futuros parámetros (p. ej. reglas de calendario) en un solo lugar.
- **Común a ambas:** la solicitud no guarda `departamento_id` (`002:24`). La comprobación debe resolverse con `JOIN empleados e ON e.id = s.empleado_id` (departamento actual) o añadir `departamento_id` a `solicitudes_vacaciones` con backfill (departamento al momento de solicitar). Para "máximo de personas a la vez" hay que contar **por día** (p. ej. `generate_series` sobre el rango con `COUNT(DISTINCT empleado_id)`), no solo "hay traslape"; el algoritmo queda para el coder.

**5. Frontend**
- Rutas: `modules/portal/frontend/main.jsx` importa páginas `:36-44`, define rutas `/rh/vacaciones` y `/rh/vacaciones/listado` `:167-168`, y el título de cabecera en `:65-67`. Sidebar: `SUB_RUTAS.rh` en `modules/portal/frontend/components/MenuDinamico.jsx:16-26`, con campo `opcion` (p. ej. `'Vacaciones'`, `'Empleados'`) usado para filtrar; una página nueva de calendario sería una entrada más. Cualquier entrada nueva necesita su opción de permiso.
- Librerías de fecha/calendario: **ninguna**. `modules/portal/frontend/package.json:11-17` = `@supabase/supabase-js`, `react`, `react-dom`, `react-router-dom`, `recharts`, `xlsx`. Backend RH (`modules/rh/backend/package.json:13-18`) = `express`, `cors`, `pg`, `multer`. No hay `date-fns`, `dayjs`, `moment`, ni componente de calendario.
- Input actual: `<input type="date">` nativo (`modules/rh/frontend/pages/VacacionesPage.jsx:277-302`), con `min` encadenado (`:292`, `:302`). Valor `YYYY-MM-DD`, sin validación de fin de semana ni de festivos.
- Cálculo de días en el cliente: `diasSolicitados` (`VacacionesPage.jsx:181-188`) = días naturales (`Math.round(...)+1`, `:187`). **Debe cambiar junto con el backend** (hoy son dos cálculos independientes; si cambian en uno solo, la vista previa miente).
- Servicio: `modules/rh/frontend/services/vacaciones.service.js:1-37` (`obtenerSaldo`, `crearSolicitud`, `listarSolicitudes`, `obtenerSolicitud`, `responderSolicitud`), vía `solicitar` de `modules/portal/frontend/utils/api.js`.
- Listado: `modules/rh/frontend/pages/VacacionesListadoPage.jsx` (`formatearFecha` `:71-74`, misma técnica).

**6. Tests existentes y convenciones**
- Jest 29 + Supertest; `npm test` en el paquete = `jest --coverage`, `testEnvironment: node` (`modules/rh/backend/package.json:11,24-26`). Ejecutar con `npm test --workspace=modules/rh/backend` (sugerido; no lo ejecuté). El `npm test` raíz es `docker compose -f docker-compose.test.yml` (`package.json` raíz).
- Tests RH de vacaciones: `modules/rh/backend/tests/acceso-empleados-permisos-vacaciones.test.js` (bloque `vacaciones`, `:133-180`). **Mockea el controlador completo** (`jest.mock("../controllers/vacaciones.controller", ...)`) y el modelo, así que **ninguna prueba cubre cálculo de días, traslape, saldo ni aprobación**. `modules/rh/backend/tests/notificacion.service.test.js` solo cubre notificaciones. `modules/rh/tests/rh.integration.test.js` menciona vacaciones solo en un listado (`:20`); esa carpeta está fuera del `rootDir` del paquete backend, así que probablemente no corre con `npm test` del workspace (no verificado).
- Convenciones (`.claude/rules/testing.md`, 14 líneas): Jest + Supertest; `describe`/`it` en español; mockear `config/database` en tests de backend. El frontend RH no tiene pruebas unitarias (ver `memory/decisions.md`, entrada 2026-10-08 "Fase 4").

**7. Riesgos, trampas y preguntas abiertas**
- **Carrera en aprobación (alta):** `responder` no tiene guardia de estado en SQL (`model:205-211`) ni revalidación de cupo/saldo/traslape (`controller:312-330`). Dos aprobaciones concurrentes de solicitudes que se traslapan pasan ambas. Tampoco hay protección en `crear` (lectura de cupo y luego INSERT sin lock).
- **Saldo y pendientes:** `dias_pendientes` ignora solicitudes pendientes (`model:17-19`), así que varias pendientes dentro del saldo pueden sumar más que el saldo y aprobarse todas (no hay revalidación al aprobar).
- **Cupo y solicitudes históricas:** las aprobadas antes del cambio son `aprobado`, así que **sí cuentan** para el cupo aunque no se recalculen sus días. Hay que decidir si cuentan para el cupo.
- **Periodo y año:** `periodo` es el año de `fecha_inicial` (`controller:88-89`); una solicitud que cruza el 31-dic reparte días entre periodos y el cálculo hábil no lo contempla.
- **Zona horaria (media):** `new Date(texto).getFullYear()` (`controller:89`, `model:31`) falla en hosts de offset negativo (verificado). Y pg puede desplazar DATE en hosts de offset positivo (verificado).
- **Regla de empleado vs. regla de departamento:** `tieneTraslape` (`model:222-239`) bloquea al mismo empleado contra pendientes y aprobadas. La nueva regla solo mira aprobadas por departamento. Hay que decidir si la primera se conserva.
- **Departamento como texto:** `departamento` en `solicitudes_vacaciones` es un nombre snapshot (`002:24`, `controller:151`). Si el empleado cambia de departamento, el histórico no se mueve.
- **Errores:** todo fallo de `crear` devuelve 400 con `error.message` (`controller:199-204`). Un error de BD o del nuevo chequeo también saldría como 400, sin código diferenciado.
- **Migraciones:** `npm run db:migrate` solo carga `config/database/init.sql` (`modules/portal/backend/scripts/migrar.js:14`). En `docker-compose.supabase.yml` (`supabase-db-init`) se aplican 004, 005, 007, 008, tickets/003 y portal/006 (`:76-82`, `:93-104`). **`rh/002` y `portal/003` no están cableadas**: solo existen dentro de `init.sql`. Una migración nueva debe ir en `init.sql` + `db-init` (volumen y comando), y en bases ya levantadas hay que re-ejecutar `supabase-db-init` (`docs/supabase.md:55`).
- **Auditoría silenciosa:** `registrarAccion` nunca lanza (`auditoria.service.js:21-25`). Si el cumplimiento exige trazar bloqueos o cambios de calendario, no basta con `registrarAccion` sin verificación.
- **Roles por nombre:** `listar` compara `rol_nombre` con `super_admin`/`rh_admin` (`controller:214`), mientras el resto usa permisos. Un rol nuevo de RH no entraría sin tocar código.
- **Autorización del calendario:** no hay ninguna tabla ni opción de calendario hoy. Falta decidir quién **lee** el calendario (empleados).
- **Preguntas abiertas para el humano (no decido):**
  1. Cupo: ¿por departamento (columna en `departamentos`) o default global con override? ¿Qué pasa con `NULL` y con `0`? ¿Valor inicial?
  2. Aprobación: si al aprobar ya no cabe el cupo o el saldo, ¿se rechaza automáticamente, se avisa y RH decide, o se permite? ¿La revalidación cubre también saldo?
  3. Solicitudes aprobadas antes del cambio: ¿cuentan para el cupo? ¿Y si caen en un día oficial o de descanso otorgado?
  4. Días hábiles: ¿un día de la solicitud en sábado/domingo o en oficial cuenta 0? ¿Se permite iniciar o terminar en día no hábil? ¿Cómo se parte una solicitud que cruza el 31-dic?
  5. Departamento: ¿el actual del empleado al solicitar, o el histórico? ¿Se guarda `departamento_id` en la solicitud?
  6. Regla de traslape por empleado (`tieneTraslape`): ¿se mantiene para pendientes?
  7. Lectura del calendario: ¿todos los empleados o solo RH/Administradores? ¿Los eventos generan aviso en la pantalla de solicitud (sin bloquear)?
  8. "Administradores": ¿incluye `portal_admin` (hoy sin permisos de RH, `ROLES_ADMIN` en `MenuDinamico.jsx:56`)? Si sí, hay que darle `rh/Calendario` explícitamente.
  9. Auditoría: ¿deben auditarse los bloqueos por cupo y los cambios de calendario (y con qué detalle)?
  10. Carga de días oficiales: ¿lista fija en código o registros del calendario por año? No hay listado de días oficiales en el repo (grep `feriado|oficial` sin resultado).

**Implicación:**
- Cálculo de días: hay que cambiar a días hábiles en **dos lugares** (`controller:117-118` y `VacacionesPage.jsx:181-188`) y compartir la misma regla (o exponer un endpoint de vista previa); no hay librería de fechas, así que conviene aritmética con UTC (`getUTCDay`) como ya se hace.
- Cupo y revalidación: el bloqueo al crear es insuficiente por las carreras y por la falta de revalidación al aprobar (`responder`). Se necesita el mismo chequeo en ambos puntos, con lock o transacción y guardia `WHERE estatus='pendiente'`. Esta decisión de diseño corresponde al orquestador.
- Persistencia: el cupo necesita `departamento_id` en la solicitud o un JOIN a `empleados`, y una columna o tabla nueva. Ambas opciones pasan por `init.sql` y por `docker-compose.supabase.yml` (la migración no se aplica sola).
- Permisos: crear la opción `Calendario` (o reusar `Empleados`/`Vacaciones`) con `modulo_opciones` + `rol_opcion_permisos` + bloque en `init.sql`; `rh_admin` y `super_admin` cubren RH+Administradores. `portal_admin` requiere concesión explícita si se incluye. `Departamentos` no está sembrada: el campo de cupo en `DepartamentosPage` no funcionaría para `rh_admin` hasta sembrarla.
- Fechas: usar `DATE` para el calendario (como `solicitudes_vacaciones`), comparar texto `YYYY-MM-DD`, y evitar `new Date(texto).getFullYear()`.
- Pruebas: no hay cobertura de la lógica de vacaciones (los tests mockean el controlador). Hace falta cubrir días hábiles, cupo, aprobación y periodo; los tests de RH son Jest + Supertest con mocks de `config/database`.
- Auditoría: `registrarAccion` no lanza; si el bloqueo debe quedar trazado, verificar la escritura o registrarlo de forma explícita.
- Sin conflictos con decisiones previas. `blockers.md` vacío.
- Pendiente de la línea de índice: `memory/INDEX.md` no se escribió desde este agente (solo `research.md`). Se pide al orquestador añadir la línea que apunte a esta entrada.
