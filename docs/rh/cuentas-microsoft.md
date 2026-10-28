# Cuentas de usuario y empleados: vincular para que cada persona vea su asistencia

Quien entra a la intranet con Microsoft necesita una **cuenta de usuario** (la crea el administrador de usuarios, con el
correo corporativo de Microsoft y su rol; GoTrue no permite el registro libre). Para que esa persona vea **Mi asistencia**,
**Mi equipo** y sus vacaciones, su cuenta debe estar **vinculada a su empleado** (`empleados.usuario_id`). Esta función de RH
solo hace esa vinculación: **no crea cuentas, no asigna ni cambia roles, no cambia contraseñas ni envía correos**.

## Flujo para RH

1. El administrador de usuarios crea (o ya tiene) la cuenta con el correo corporativo y un rol que dé acceso a Asistencia
   (p. ej. `rh_empleado`). Sin ese rol la persona entra, pero no ve "Mi asistencia".
2. RH relaciona la cuenta con el empleado por la vía que convenga (las tres escriben solo `usuario_id`):
   * **Plantilla de carga**: columna `Correo de la cuenta` (ver `docs/rh/importacion-empleados.md`). Importar en modo "actualizar"
     (por CURP o nómina).
   * **Perfil del empleado** (Ver expediente, pestaña Info Laboral, "Cuenta de usuario"): selector buscable de las cuentas sin
     empleado; vincular, o **desvincular** con confirmación.
   * **Empleados, botón "Vincular cuentas"**: vista previa sin cambios de las cuentas sin empleado y sugerencias de coincidencia
     por nombre; RH marca cuáles aplicar y confirma.
3. **Probar con UNA cuenta real** antes de vincular en masa: vincula una persona, que entre con Microsoft y compruebe "Mi asistencia".
   El inicio de sesión con Microsoft no se puede probar desde el sistema: lo comprueba una persona.

## Vista previa y sugerencias

Muestra contadores (cuentas sin empleado, empleados activos sin cuenta, coincidencias, cuentas sin rol con acceso a Asistencia,
cuentas privilegiadas) y, por cada cuenta sin empleado, **nombre, correo y roles junto al empleado sugerido con nómina y
departamento**, para comprobar a simple vista que es la misma persona. La coincidencia usa nombre + apellido paterno sin acentos
ni mayúsculas (el apellido de la cuenta debe empezar por el paterno del empleado; si hay apellido materno, desempata):

* **Coincidencia exacta única**: un solo empleado. **Varias posibles**: homónimos (RH elige a mano). **Sin coincidencia**: se
  vincula desde el perfil del empleado. Si dos cuentas reclaman al mismo empleado, ambas quedan en "Varias posibles".
* **Nada se aplica solo**: RH marca cada vínculo (hay un atajo "Marcar las coincidencias exactas de esta página") y confirma con
  un texto que repite los contadores. Solo se consideran empleados **activos** sin cuenta; nunca los dados de baja.

## Ejecución

* Lotes de 50 vínculos. El servidor **revalida cada vínculo con las filas bloqueadas**: si algo cambió desde la vista previa
  (la cuenta ya está vinculada a otro empleado, el empleado ya tiene otra cuenta o está de baja, alguno ya no existe) responde
  **409 sin aplicar nada de ese lote** (hay que actualizar la vista previa). Nunca pisa un `usuario_id` y nunca vincula una cuenta a
  dos empleados (`UNIQUE (usuario_id)`, migración 010).
* **Idempotente**: repetir un vínculo ya aplicado se cuenta como "omitida"; no falla ni duplica ni toca el registro.
* Candado consultivo propio `pg_advisory_xact_lock(4601, 1)` con `lock_timeout` de 3 s (no colisiona con 4217, 4301, 4302, 4410
  ni 4501); si otra vinculación está en curso responde 409 amable. Como máximo 2 ejecuciones simultáneas por proceso.
* **Advertencias** en la vista previa, la confirmación y el resultado: cuentas sin un rol con acceso a Asistencia (no verán
  "Mi asistencia" hasta que el administrador de usuarios les asigne el rol) y cuentas inactivas.
* **Cuentas con rol privilegiado** (`super_admin`, `rh_admin`, `tickets_admin`): se muestran con aviso; vincularlas da la asistencia
  de ese empleado a un administrador. El servidor exige una **confirmación aparte** (`confirmar_privilegiadas`); sin ella, 400 y no
  se aplica nada. Desde la plantilla de carga se rechazan (error de la fila): se vinculan desde la pantalla.
* Auditoría: `VINCULAR_CUENTAS` (lote), `VINCULAR_CUENTA` y `DESVINCULAR_CUENTA` (uno), solo con conteos e ids (nunca correos ni nombres).

## Endpoints (solo `rh/Empleados:edicion`: `rh_admin` y `super_admin`; los demás roles, 403; sin token, 401)

| Método y ruta | Uso |
|---|---|
| `GET /api/empleados/cuentas/vista-previa?pagina&limite&estado` | contadores + cuentas sin empleado con sugerencia (límite máx. 100; `estado`: `exacta`, `varias`, `sin_coincidencia`) |
| `GET /api/empleados/cuentas/disponibles?busqueda&pagina&limite` | selector del perfil (cuentas sin empleado) |
| `POST /api/empleados/cuentas/vincular` `{pares:[{usuario_id,empleado_id}] (máx. 50), confirmar:true, confirmar_privilegiadas?}` | vincula un lote |
| `POST /api/empleados/:id/cuenta` `{usuario_id}` o `{usuario_id:null, confirmar:true}` | vincula o desvincula uno |

Los errores inesperados responden 500 genérico (sin texto de la base de datos).

## Límites

* No crea cuentas ni correos corporativos, no asigna roles y no cambia contraseñas: eso es de la administración de usuarios.
* Desvincular no borra la cuenta; la persona deja de ver la asistencia de ese empleado.
* La sugerencia por nombre depende de que el nombre de la cuenta coincida con el del empleado; revisa siempre nombre, correo y
  departamento: **un vínculo equivocado expone la asistencia de una persona a otra**.
* Si la restricción `UNIQUE (usuario_id)` no se creó (hay duplicados históricos; ver `docs/supabase.md`, migración 010), el
  servidor sigue comprobando la unicidad al vincular, pero conviene corregir los duplicados.
* Una persona con varios roles: el middleware toma un solo rol por usuario; el aviso de "sin acceso a Asistencia" considera todos
  sus roles.
