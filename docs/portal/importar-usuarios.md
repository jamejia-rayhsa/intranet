# Importar usuarios (alta masiva de cuentas Microsoft vinculadas al empleado)

Pantalla: **Admin > Usuarios > "Importar usuarios"** (`/admin/usuarios`). **Solo la ve y la usa un `super_admin`** (el servidor
lo exige igual: cualquier otro rol recibe 403 aunque tenga `portal/Usuarios:edicion`).

Cada fila del archivo, en un solo paso:

1. crea el **usuario** (`auth_tipo = 'ms365'`, **sin contraseña**: entra solo con Microsoft) en Supabase Auth (GoTrue) y en `usuarios`;
2. le asigna el rol **`rh_empleado`** (siempre; el archivo no tiene columna de rol y cualquier columna `rol` se ignora);
3. lo **vincula** al empleado indicado (`empleados.usuario_id`) con la misma regla y el mismo candado (4601) que la vinculación de RH
   (`docs/rh/cuentas-microsoft.md`): da a esa persona su asistencia, expediente, recibos de nómina y, si es jefe, la aprobación
   de vacaciones de su equipo. **Verifica que correo y empleado sean la misma persona.**

## Plantilla

Se descarga desde el propio diálogo (CSV con datos ficticios). Columnas (los encabezados se reconocen sin acentos ni mayúsculas):

| Columna | Obligatoria | Regla |
|---|---|---|
| Correo corporativo | sí | Exactamente `usuario@rayhsa.com.mx` (otro dominio, subdominio o `@` repetido se rechaza). Se guarda en minúsculas |
| Nombre | sí | Hasta 100 caracteres |
| Apellido | sí | Hasta 100 caracteres (puede traer paterno y materno) |
| Número de nómina | una de las dos | Letras, dígitos, `.`, `_`, `-`; sin espacios. Excel pierde los ceros a la izquierda: `777` encuentra `00777` |
| CURP | una de las dos | 18 caracteres. Si vienen las dos, deben apuntar al mismo empleado |

Topes: **200 filas y 1 MB por archivo** (el diálogo lo avisa antes de la vista previa; el servidor rechaza más de 200 filas por
petición y el parser global corta cuerpos de más de 100 kb con 413).

## Flujo

1. Cargar el archivo. 2. **Verificar filas** (vista previa del servidor, **obligatoria**: sin ella el botón de crear no existe;
`POST /api/usuarios/importar/vista-previa` no escribe en la base ni en GoTrue). Muestra por fila: **se creará** (y con qué empleado),
**se omitirá** o **error**. 3. **Crear N cuentas** (`POST /api/usuarios/importar` con `confirmar: true`; el servidor revalida cada fila
con el candado tomado). 4. Reporte por fila (resumen, errores, omitidas, advertencias) y CSV descargable (las celdas que empiezan con
`=`, `+`, `-` o `@` se neutralizan).

### Qué hace el sistema con cada caso

| Caso | Resultado |
|---|---|
| Correo ya existe en `usuarios` (sin distinguir mayúsculas) | **Omitida**, sin tocar nada (repetir el archivo no duplica) |
| Dominio distinto a `@rayhsa.com.mx` | Error de fila |
| Nómina que tienen varios empleados (ambigua) | Error de fila: usa la CURP. Nunca se elige entre candidatos |
| Empleado no activo (baja, suspendido) | Error de fila |
| Empleado que ya tiene cuenta | Error de fila (nunca se pisa un vínculo) |
| Sin empleado con esa nómina/CURP, CURP inválida, sin identificador | Error de fila |
| Correo, CURP o nómina repetidos dentro del archivo | La primera fila se procesa; las siguientes son error ("ya aparece en la fila N") |
| El mismo empleado en dos filas | La segunda es error |
| Nombre del archivo distinto al del empleado | Se crea, con **aviso** (verifica que el correo sea de esa persona) |
| Correo que ya está en Supabase Auth sin fila local | Error: **no se adopta**; se limpia la reserva local |
| Cuenta local incompleta de una importación interrumpida | Error "cuenta incompleta": elimínala en Administración de usuarios y reimporta |

No hay modo "actualizar": una cuenta existente nunca se modifica (ni su rol ni su estado).

## Orden de la operación y fallos (GoTrue y PostgreSQL no comparten transacción)

Por fila: **A)** reserva local `auth_uid NULL, activo = false` (nadie puede entrar con ella); **B)** alta en GoTrue sin contraseña;
**C)** una transacción con `auth_uid`, `activo = true`, rol y vínculo (con `lock_timeout` de 3 s).

* Error HTTP definitivo de GoTrue -> se borra la reserva local; la fila queda en error. Nada queda a medias.
* Falla C (empleado bloqueado por otra operación, cambió desde la vista previa...) -> ROLLBACK, se **borra la cuenta en GoTrue** con su id
  y la reserva local; la fila queda en error ("Se deshizo la cuenta de esta fila"). Si GoTrue no deja borrar, la fila queda **"por
  verificar"** con su `auth_uid` guardado (inactiva) para que **Eliminar** también limpie GoTrue.
* **Sin respuesta de GoTrue (tiempo agotado o red)** -> resultado **incierto**: no se compensa (GoTrue pudo crear la cuenta). La fila queda
  **"por verificar"**: cuenta local inactiva y sin vincular. Revísala en Administración de usuarios, elimínala y reimporta.
* Tras 3 respuestas inciertas seguidas se detiene y las filas restantes se reportan "No procesada" sin escribir nada.
* Solo una importación a la vez por proceso (otra recibe 409). Candado `pg_advisory_xact_lock(4701, 1)` al inicio de cada transacción
  de fila, antes del 4601 (orden 4701 -> 4601; ver `rh/backend/utils/candadosImportacion.js`).

## Seguridad

* **Sin contraseña**: la plataforma no envía contraseña a GoTrue. Hallazgo comprobado con GoTrue v2.196.0: sin contraseña, GoTrue guarda
  una **aleatoria que nadie conoce** (distinta por cuenta); iniciar sesión con contraseña falla. Por eso `PUT /api/usuarios/:id` **ya no acepta
  `contraseña` para cuentas que no sean `local`** (400): antes se podía poner una a una cuenta Microsoft y abrir una segunda puerta.
* **Auditoría `IMPORTAR_USUARIOS`** (módulo `portal`, tabla `usuarios`): solo conteos (`filas_recibidas`, `creadas`, `omitidas`, `errores`,
  `por_verificar`), ids de usuarios creados y pares `[usuario_id, empleado_id]`. Nunca correos, nombres, nóminas ni CURP.
* Los mensajes de error son propios: no se reenvía texto de PostgreSQL ni de GoTrue.
* La vista previa devuelve el correo y el nombre que escribió quien importa (solo a un `super_admin`) y el nombre del empleado al que
  se vincularía; no devuelve CURP ni nómina.

## Antes de usarlo en staging o producción

1. Confirma que el rol `rh_empleado` existe y tiene el acceso que quieres dar (Mi asistencia, vacaciones).
2. Prueba con **una** persona real: importa un archivo de una fila, que entre con Microsoft y compruebe su acceso. El inicio de sesión con
   Microsoft no se puede probar desde el sistema.
3. Confirma que el tenant de Azure sea de un solo inquilino (`docs/supabase.md`): el dominio `@rayhsa.com.mx` lo valida esta pantalla, no Azure.

## Verificación reproducible

`scripts/importar-usuarios/` (README): Postgres y GoTrue **reales** desechables, verificación por HTTP (79 comprobaciones), Chromium (33) y
mutación (28 mutantes). Datos 100 % ficticios.
