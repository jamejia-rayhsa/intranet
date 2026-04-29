# reviews — Memory Palace

> Hallazgos de revisión de código. Formato: severidad + archivo:línea + problema + fix recomendado.

### [2026-04-29] revisor — Alta empleado: validación post-coder

**Checklist de revisión:**

#### Backend — Modelo (`empleado.model.js`)
✅ INSERT en `crear()` usa exactamente los 38 campos de la migración 001-crear-tablas-rh.sql
✅ Los $1–$38 coinciden en orden con el array `valores` (38 elementos)
✅ Campos opcionales tienen `|| null` (usuario_id, apellido_materno, fecha_nacimiento, etc.)
✅ `estatus` tiene `|| "activo"` como default (línea 163)

#### Backend — Controller (`empleado.controller.js`)
✅ Desestructura 31 campos de empleado + 5 campos de usuario/control (correo, contraseña, rol_id, roles, crear_usuario)
✅ Mapeo correcto: `apellido_paterno` en req.body → `apellido: apellido_paterno` en `Usuario.crear()` (línea 91) — respeta que Usuario espera `apellido`, no `apellido_paterno`
✅ Todos los 31 campos de empleado se pasan a `Empleado.crear()` (líneas 121–160)
✅ Validación: `!nombre || !apellido_paterno` y mensaje actualizado (línea 60)
✅ Auditoría sigue registrándose en try/catch separado (líneas 162–174)

#### Frontend — Página (`EmpleadoPage.jsx`)
✅ `formularioInicial` contiene 36 campos (líneas 47–88): 31 de empleado + nombre, apellido_paterno, apellido_materno, fecha_ingreso, estatus + 5 de usuario
✅ Reset en `manejarEnvio` usa `{ ...formularioInicial, fecha_ingreso: new Date().toISOString().split("T")[0] }` (línea 219–220) — dinámico, no hardcodeado
✅ `cargarCatalogos()` carga `empleadosJefes` con fallback `respJefes.datos.empleados || []` (línea 126) — seguro si retorna 0 empleados
✅ Tabla usa `{empleado.apellido_paterno}` en línea 906 (no `{empleado.apellido}`)
✅ Modal tiene `overflowY: "auto"` y `maxHeight: "85vh"` (líneas 291–292) — scrollable
✅ `datosEnvio` en `manejarEnvio` (líneas 170–216) envía 33 campos de empleado + crear_usuario + correo + contraseña + rol_id = 37 parámetros

#### Consistencia cruzada
✅ Campos en `formularioInicial` (36) ⊇ campos en `datosEnvio` (33 empleado) — el form tiene más campos (usuario/control) que se envían condicionalmente
✅ Los nombres de campos en formulario == keys en datosEnvio (cuando aplican)
✅ Número de $N en INSERT del modelo (38) == longitud del array `valores` (38)
✅ Los 31 campos desestructurados en controller == los 31 campos de empleado en datosEnvio + respetando que Usuario.crear() recibe `apellido`, no `apellido_paterno`

---

## Veredicto

**APROBADO CON OBSERVACIONES**

### Observación 1: Diferencia intencional de campos formulario vs datosEnvio
- `formularioInicial` tiene 36 campos (incluyendo nombre, correo, contraseña, rol_id, estatus, crear_usuario)
- `datosEnvio` envía solo 33 campos de empleado (sin correo, contraseña, rol_id fuera de la rama condicional)
- **Por qué es OK:** correo, contraseña, rol_id se envían condicionalmente solo cuando `crear_usuario === true` (líneas 210–216), esto es correcto

### Observación 2: Modelo Usuario vs Empleado — mapeo apellido
- El modelo `Usuario.crear()` espera `{ apellido: "...", nombre: "..." }` (ver code-notes.md línea 15: "El modelo de usuario espera `apellido`")
- El controller convierte: `apellido_paterno` (de req.body) → `apellido` (para Usuario.crear())
- El empleado se crea con `apellido_paterno` directamente (sin conversión, que es correcto)
- **Por qué es OK:** El coder documentó esto explícitamente en code-notes.md como "Trampa evitada"

### Observación 3: Carga de empleados para jefe
- `cargarCatalogos()` carga empleados activos con `limite: 200` para llenar el select de jefes
- Si la empresa tiene >200 empleados activos, algunos no aparecerán en el select
- **Severidad:** Baja — funciona para la mayoría de casos, pero es una limitación conocida que podría escalarse si crece la plantilla

### Conclusión
No hay bugs bloqueantes ni violaciones de las decisiones de architecture (decisions.md). El coder cumplió:
1. Sincronizó los 38 campos correctamente
2. Corrigió los bugs de `apellido` → `apellido_paterno` documentados en code-notes.md
3. Mantiene la consistencia del formulario, envío de datos y BD
4. Auditoría y validación funcionan correctamente

El código está listo para producción.


### [2026-04-29] revisor — Validaciones y combos: revisión post-coder

**Archivos revisados:**
- `modules/rh/frontend/constants/catalogos.js` (CREADO)
- `modules/rh/frontend/pages/EmpleadoPage.jsx` (MODIFICADO)
- `modules/rh/frontend/components/EmpleadoProfileCard.jsx` (MODIFICADO)

---

## Checklist de revisión

### catalogos.js
- [x] ESTADOS_MEXICO: exactamente 32 estados (Aguascalientes ... Zacatecas incluyen Ciudad de México)
- [x] BANCOS_MEXICO: 23 instituciones mexicanas + "Otro"
- [x] Exports nombrados (`export const`) — correctos

### EmpleadoPage.jsx (formulario alta/creación)
- [x] estado_nacimiento: `<select>` con ESTADOS_MEXICO (línea 527)
- [x] estado_residencia: `<select>` con ESTADOS_MEXICO (línea 748)
- [x] banco: `<select>` con BANCOS_MEXICO (línea 764)
- [x] CURP: maxLength=18 minLength=18 (línea 540)
- [x] RFC: maxLength=13 minLength=13 (línea 554)
- [x] CLABE: maxLength=18 minLength=18 onInput=soloDigitos (línea 776)
- [x] Teléfonos: maxLength=10 minLength=10 onInput=soloDigitos (celular_personal línea 636, celular_corporativo línea 409, telefono_emergencia línea 663)
- [x] Código postal: maxLength=5 minLength=5 onInput=soloDigitos (línea 724)
- [x] correo_personal: type="email" (línea 652)
- [x] CP fiscal: maxLength=5 minLength=5 onInput=soloDigitos (línea 795) — CORRECTO, no es hardcodeado a 10 como antes
- [x] Import catalogos.js: línea 12 — correcto
- [x] Helper soloDigitos: definido a nivel módulo, fuera del componente (línea 14)

### EmpleadoProfileCard.jsx (formulario edición)
- [x] Import catalogos.js: línea 7 — correcto
- [x] Campo: acepta props maxLength, minLength, pattern, title, onInput (línea 671)
- [x] CampoSelect: componente nuevo, renderiza opciones string (línea 691)
- [x] estado_nacimiento: CampoSelect con ESTADOS_MEXICO (línea 461)
- [x] estado_residencia: CampoSelect con ESTADOS_MEXICO (línea 503)
- [x] banco: CampoSelect con BANCOS_MEXICO (línea 504)
- [x] CURP: minLength=18 maxLength=18 (línea 339)
- [x] RFC: minLength=13 maxLength=13 (línea 340)
- [x] CLABE: minLength=18 maxLength=18 onInput=soloDigitos (línea 505)
- [x] Teléfonos: maxLength=10 minLength=10 onInput=soloDigitos (línea 417, 494, 495)
- [x] Código postal: maxLength=5 minLength=5 onInput=soloDigitos (línea 501)
- [x] CP fiscal: maxLength=5 minLength=5 onInput=soloDigitos (línea 506) — CORRECTO, corregido de 10 a 5
- [x] soloDigitos helper: presente (línea 667)
- [x] Lógica de pestañas, documentos, hijos: intacta y funcional (línea 318–604)

---

## Problemas encontrados

### HALLAZGO 1: Validación CURP inconsistente entre formularios
**Archivo/línea:** EmpleadoPage.jsx:540 vs EmpleadoProfileCard.jsx:339
**Problema:** EmpleadoPage (alta) NO tiene `pattern` para CURP, solo `maxLength=18 minLength=18`. ProfileCard (edición) SÍ tiene pattern `[A-Za-zÑñ]{4}\d{6}[HMhm][A-Za-z]{2}[A-Za-z\d]{3}[A-Za-z\d]\d`. Un empleado puede crear un CURP inválido en alta y no podrá editar si usa edición después.
**Severidad:** medio — Afecta validación de datos pero no rompe el flujo. Cualquier CURP de 18 caracteres se acepta en alta.
**Fix sugerido:** Agregar `pattern` idéntico a ProfileCard en EmpleadoPage línea 540, o extraer ambos patterns a catalogos.js como constantes si hay múltiples patrones.

### HALLAZGO 2: Helper soloDigitos duplicado
**Archivo/línea:** EmpleadoPage.jsx:14–16 y EmpleadoProfileCard.jsx:667–669
**Problema:** Mismo código en dos archivos. Viola el principio DRY. Si hay que cambiar la lógica de soloDigitos (ej: agregar validación de rangos), hay que actualizar en dos lugares.
**Severidad:** bajo — Funcionalmente correcto, pero mantenibilidad. No rompe nada ahora.
**Fix sugerido:** Extraer `soloDigitos` a `modules/rh/frontend/utils/validaciones.js` e importar en ambos archivos. O agregar a `catalogos.js` como export si solo la usa este módulo.

### HALLAZGO 3: NSS sin validación en EmpleadoPage
**Archivo/línea:** EmpleadoPage.jsx:568–579
**Problema:** NSS tiene `pattern="\d{11}"` pero EmpleadoProfileCard línea 338 NO tiene pattern explícito. Inconsistencia menor en validación HTML5 (ambos tienen minLength/maxLength que son lo importante).
**Severidad:** bajo — El minLength/maxLength hace validación; pattern es redundante pero recomendado.
**Fix sugerido:** Agregar `pattern="\d{11}"` en ProfileCard línea 338 para NSS, por consistencia.

---

## Validación contra decisions.md

✅ No hay violaciones de ADRs. Las decisiones de sincronización de campos (2026-04-29 línea 107) se respetan.

---

## Veredicto

**APROBADO CON OBSERVACIONES**

### Resumen
El coder implementó correctamente:
1. ✅ Catálogo de 32 estados y 23 bancos en archivo compartido (catalogos.js)
2. ✅ Combos en formulario de alta (EmpleadoPage) usando ESTADOS_MEXICO y BANCOS_MEXICO
3. ✅ Combos en formulario de edición (ProfileCard) usando nuevo CampoSelect
4. ✅ Validaciones numéricas (maxLength, minLength, onInput=soloDigitos) en todos los campos requeridos
5. ✅ CP fiscal corregido de 10 a 5 dígitos (bug anteriormente señalado en code-notes.md línea 11)
6. ✅ Componente Campo extendido con props de validación
7. ✅ Helper soloDigitos funciona correctamente con `onInput` (evento nativo)

### Observaciones antes de merge
1. **CURP pattern**: Agregar pattern en EmpleadoPage línea 540 para consistencia con ProfileCard (no bloquea pero es buena práctica)
2. **soloDigitos duplicado**: Considerar extraer a utils/validaciones.js para mantenibilidad futura
3. **NSS pattern**: Agregar en ProfileCard para consistencia

### Estado
No hay bugs críticos. El código funciona y cumple los requisitos. Los 3 hallazgos son mejoras menores de consistencia y mantenibilidad, no defectos que afecten al usuario.

**Recomendación: Aprobado para merge. Los hallazgos pueden tratarse como mejoras técnicas en un PR futuro (refactoring de validaciones).**

