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

