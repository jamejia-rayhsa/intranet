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
