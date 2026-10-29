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
| Correo corporativo | sí | Exactamente `usuario@rayhsa.com.mx` (otro dominio, subdominio o `@` repetido se rechaza). Se guarda en minúsculas. Parte local: letras, dígitos, `.`, `_`, `-` y `+`; **apóstrofe y comillas se rechazan**. Un alias con `+` se acepta pero la vista previa **avisa** (Microsoft 365 puede entregarlo a otro buzón) |
| Nombre | sí | Hasta 100 caracteres |
| Apellido | sí | Hasta 100 caracteres (puede traer paterno y materno) |
| Número de nómina | una de las dos | Letras, dígitos, `.`, `_`, `-`; sin espacios. Excel pierde los ceros a la izquierda: `777` encuentra `00777` |
| CURP | una de las dos | 18 caracteres. Si vienen las dos, deben apuntar al mismo empleado |

Topes: **200 filas y 1 MB por archivo** (el diálogo lo avisa antes de la vista previa). En el servidor: más de 200 filas -> 400 y un
cuerpo de más de **1 MB -> 413 en JSON** (solo en `/api/usuarios/importar*`; el resto de la API conserva el límite de 100 kb). El parser rechaza por `Content-Length` sin leer el cuerpo: 360 MB enviados no aumentan la memoria del backend (probado). Ese parser corre antes de autenticar (hasta 1 MB anónimo en esa ruta; aceptado).

## Flujo

1. Cargar el archivo. 2. **Verificar filas** (vista previa del servidor, **obligatoria**: sin ella el botón de crear no existe y, además, el
servidor **exige la huella firmada** que devuelve la vista previa para cada fila: HMAC-SHA256 del usuario, la fila y una caducidad de 30
minutos; la clave se deriva del secreto con la etiqueta `importar-usuarios-v1`; sin huella, con la fila modificada, de otro usuario o vencida -> 400 y no se escribe nada;
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
| Correo que ya está en Supabase Auth sin fila local | Si la cuenta la marcó una importación (`origen`) y ninguna fila local la usa: se **adopta**. Si no: error "cuenta preexistente, no se adopta" (el mensaje indica eliminarla en Supabase Auth o vincularla a mano) y se limpia la reserva local |
| Cuenta local incompleta (reserva de una importación interrumpida) | **Se repara al reimportar** (ver abajo): la vista previa la ofrece como "se creará" con el aviso de cuenta incompleta |
| Fila inactiva que conserva su `auth_uid` (una importación no se completó) | Omitida con mensaje: elimínala en Administración de usuarios (limpia también Supabase Auth) y reimporta |
| Cuenta incompleta que ya tiene rol o empleado | Error: no se repara sola; revísala en Administración de usuarios |

No hay modo "actualizar": una cuenta existente nunca se modifica (ni su rol ni su estado).

## Orden de la operación y fallos (GoTrue y PostgreSQL no comparten transacción)

Por fila: **A)** reserva local `auth_uid NULL, activo = false` (nadie puede entrar con ella); **B)** alta en GoTrue sin contraseña;
**C)** una transacción con `auth_uid`, `activo = true`, rol y vínculo (con `lock_timeout` de 3 s).

* **Definitivo = solo un rechazo 4xx de GoTrue (salvo 408 y 429)**. 5xx (también un 502/503/504 de un intermediario), tiempo agotado, error de
  red, 2xx sin JSON o sin id y **cualquier excepción inesperada** son **inciertos**: GoTrue pudo haber creado la cuenta. Con un incierto la fila
  queda **"por verificar"** (cuenta local inactiva y sin vincular) y **nunca se borra ni se compensa**. (`supabaseAdmin.service.js` marca
  `definitivo` o `incierto` y, aparte, `conRespuestaHttp`. **Los demás flujos** (`delegacionPermisos`: editar, resetear contraseña, etc.)
  siguen compensando ante cualquier respuesta HTTP de GoTrue, como siempre; el criterio 4xx/5xx es solo del importador.)
* Rechazo 4xx definitivo -> se borra la reserva local recién creada; la fila queda en error.
* **Reparación sin panel de GoTrue** (reimportar el mismo archivo): cada cuenta se crea con `app_metadata.origen = 'importacion_usuarios'` y un
  id de importación (**app_metadata**, que el propio usuario NO puede cambiar: comprobado contra GoTrue real, `PUT /auth/v1/user` con
  `app_metadata` responde 403 y solo deja editar `user_metadata`; sin datos internos como `usuario_id`). Ante una fila "por verificar", una cuenta incompleta o un 422 de GoTrue, el
  reintento consulta GoTrue por **correo exacto**: si existe, tiene ese `origen` y **ninguna fila local usa su id**, la **adopta**
  (completa la fila local, rol y vínculo, sin crear otra cuenta); si existe sin esa marca (o ya la usa otra fila) -> error "cuenta
  preexistente, no se adopta" y no se toca. Un `origen` falsificado en `user_metadata` no cuenta: no se adopta.
* Falla C por un motivo conocido (el empleado cambió, está bloqueado por otra operación, el vínculo no quedó "vinculada" **comprobado dentro de
  la transacción, antes del COMMIT**) -> ROLLBACK y, si la cuenta la creó esta ejecución, se **borra en GoTrue con su id** y la reserva local;
  si GoTrue no deja borrar, o la cuenta era una adoptada, la fila conserva su `auth_uid` (inactiva) y **Eliminar** en Administración de
  usuarios también limpia GoTrue.
* Un error en el **COMMIT** (o un error inesperado en C) es incierto: no se compensa; la fila queda "por verificar" y el reintento adopta la cuenta.
* Tras 3 respuestas inciertas seguidas se detiene y las filas restantes se reportan "No procesada" sin escribir nada.
* Solo una importación a la vez por proceso (otra recibe 409). Candado `pg_advisory_xact_lock(4701, 1)` al inicio de cada transacción
  de fila, antes del 4601 (orden 4701 -> 4601; ver `rh/backend/utils/candadosImportacion.js`).

## Seguridad

* **Sin contraseña**: la plataforma no envía contraseña a GoTrue. Con GoTrue v2.196.0, sin contraseña GoTrue guarda una **aleatoria que nadie
  conoce** (distinta por cuenta). `PUT /api/usuarios/:id` y `POST /api/auth/cambiar-password` **rechazan la contraseña para cuentas que no
  sean `local`** (400). `resetearPassword` ya lo exigía.
* **HALLAZGO ABIERTO (I-2, se escala al humano; no se cambió configuración)**: esos bloqueos viven solo en la API de la intranet. Comprobado
  contra GoTrue real con la configuración del compose (`GOTRUE_EXTERNAL_EMAIL_ENABLED=true`, `GOTRUE_MAILER_AUTOCONFIRM` por defecto `true`):
  1. `POST /auth/v1/recover` es **público** y responde 200 para una cuenta importada (envía el correo al buzón si hay SMTP; el ejemplo
     de `.env.supabase.example` usa `smtp.office365.com`).
  2. Con el enlace de recuperación (quien controla el buzón) o con una sesión de Microsoft ya iniciada, `PUT /auth/v1/user` con
     `{ password }` **responde 200**, y después `POST /auth/v1/token?grant_type=password` **emite un token** sin pasar por Microsoft.
  3. El backend **acepta ese token**: `auth.middleware.js` solo verifica firma y `aud` y busca la fila por `auth_uid`; no comprueba el
     proveedor (`app_metadata.provider`) ni `auth_tipo`.
  4. **Exposición real**: `config/nginx/nginx.conf`, `nginx.spa.conf` y `nginx.staging.conf` proxean **todo** `/auth/v1/` a GoTrue sin
     filtrar rutas; en staging Cloudflare -> Traefik -> nginx publica `https://staging.rayhsa.net/auth/v1/*` completo.
  Consecuencia: quien controle el buzón de una cuenta importada (p. ej. un empleado dado de baja en Azure pero cuyo buzón sigue activo) puede fijarse
  una contraseña y entrar sin Azure/MFA. Decisión pendiente del humano: bloquear `/recover` y `PUT /user` (nginx), desactivar el proveedor
  email de GoTrue (los usuarios `local` lo necesitan) o comprobar el proveedor del token en el backend.
* **Auditoría `IMPORTAR_USUARIOS`** (módulo `portal`, tabla `usuarios`): solo conteos (`filas_recibidas`, `creadas`, `omitidas`, `errores`,
  `por_verificar`), ids de usuarios creados y pares `[usuario_id, empleado_id]`. Nunca correos, nombres, nóminas ni CURP.
* Los mensajes de error son propios: no se reenvía texto de PostgreSQL ni de GoTrue.
* La vista previa devuelve el correo y el nombre que escribió quien importa (solo a un `super_admin`) y el nombre del empleado al que
  se vincularía; no devuelve CURP ni nómina.
* Preexistente, fuera de esta tarea (I-13): `completarRol` toma un rol arbitrario (`LIMIT 1` sin `ORDER BY`); con varios roles `esSuperAdmin`
  podría dar falso negativo (no escala privilegios).

## Antes de usarlo en staging o producción

1. Confirma que el rol `rh_empleado` existe y tiene el acceso que quieres dar (Mi asistencia, vacaciones).
2. Prueba con **una** persona real: importa un archivo de una fila, que entre con Microsoft y compruebe su acceso. El inicio de sesión con
   Microsoft no se puede probar desde el sistema.
3. Confirma que el tenant de Azure sea de un solo inquilino (`docs/supabase.md`): el dominio `@rayhsa.com.mx` lo valida esta pantalla, no Azure.

## Verificación reproducible

`scripts/importar-usuarios/` (README): Postgres y GoTrue **reales** desechables, verificación por HTTP (111 comprobaciones), Chromium (33) y
mutación (42 mutantes). Datos 100 % ficticios.
