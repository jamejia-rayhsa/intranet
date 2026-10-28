---
name: decisions
description: ADRs del proyecto — decisiones de arquitectura con fecha y autor
type: project
---

# Decisiones de Arquitectura

### [2026-10-22] orquestador — Corrección: MBA3 en Solicitudes de Crédito ya no es stub (drift sin registrar)

**Contexto:** al investigar el módulo Comercial para planear "Convenios de compra" (ver research.md, entrada del investigador del mismo día), se encontró que el ADR de Fase 1 de Comercial (más abajo, 2026-05-15) describe `POST /solicitudes/:id/sincronizar-mba3` como stub (501, no activa `enviada_mba3`). El código actual (`modules/comercial/backend/controllers/solicitudCredito.controller.js:233-313`) ya hace un GET real a `${MBA3_URL}/wsAPIS/api_wr` (CODE_s=05, alta/actualización de cliente) y sí activa `enviada_mba3` (líneas 290-292). No hay ningún ADR posterior que registre este cambio — quedó implementado sin documentar.

**Decisión:** se marcan como obsoletas (`~~texto~~`) las líneas del ADR de 2026-05-15 que ya no describen el código (puntos 4 y 8, y la restricción "MBA3 no implementado"), sin borrarlas, y se deja esta nota como referencia. No se investigó el alcance completo de esa integración (variables MBA3_*/MSSQL_* sin usar, documentación en `docs/comercial/MBA3_API.md`); si se retoma, verificar primero el estado real contra el código, no contra el ADR viejo.

**Por qué importa para Convenios:** el patrón de "stub documentado que cambia sin ADR" es justo el riesgo a evitar en la función nueva; además, MBA3 solo tiene confirmado un canal de **escritura** de clientes (CODE_s=05), no de lectura de inventario/ventas — ver plan de Convenios de compra.

---

### [2026-10-09] orquestador — El nombre de los usuarios de Microsoft se completa desde el proveedor

**Síntoma:** tras dar de alta una cuenta de administrador en staging solo con el correo (con un marcador como nombre), la aplicación mostraba solo el marcador. Causa doble: (1) la aplicación muestra el nombre de la **base local**, no el de Microsoft; (2) el botón pedía solo `openid email`, sin `profile`, y Microsoft no envió el nombre (la identidad de Azure en GoTrue solo traía `email`, `tid`, `sub`…).
**Decisión:** el botón pide `email profile`; el middleware (`completarNombreDesdeProveedor`) rellena `nombre`/`apellido` desde `user_metadata` del token (`given_name`+`family_name`, o `full_name`/`name`) **solo cuando el apellido local está vacío**, con `UPDATE ... WHERE apellido IS NULL OR btrim(apellido)=''` (idempotente y a prueba de carreras). Un nombre ya escrito por un administrador nunca se pisa; un fallo del UPDATE no bloquea el acceso. Separación del nombre completo (`utils/nombreDesdeIdP.js`): los dos últimos elementos son apellidos, las partículas se pegan al apellido; si hay un solo elemento o parece un correo, no se toca nada. Los datos vienen de `user_metadata`, que el usuario puede editar: solo afecta a lo que se **muestra**, no a permisos ni a la identidad (que sigue resolviéndose por `auth_uid`).
**Pruebas:** 12 casos de separación de nombres y 4 del middleware (rellena con apellido vacío; no pisa un nombre completo; no actúa sin datos del proveedor; un fallo de la BD no impide el acceso); 216 tests y lint 0 errores. Un test detectó un fallo real (con "de la Cruz" el nombre quedaba vacío) y otro un defecto del propio test (fixture compartido y mutable).
**Despliegue:** requiere nueva imagen (cambia backend y frontend): PR -> CI -> `IMAGE_TAG` en staging. El nombre de esa cuenta se corrigió a mano en la base de staging.

### [2026-10-09] orquestador — Staging migrado a Supabase (ejecución real)

**Qué se hizo** (servidor de staging, clon del repositorio fijado en el commit de fusión `ea66bd1`, imágenes `ghcr.io/jamejia-rayhsa/intranet/{backend,frontend}` con esa etiqueta):
1. Pre-chequeos de solo lectura; descarga de imágenes en segundo plano; **se levantó primero solo `supabase-db`+`db-init`** (sin tocar el backend/frontend viejos) y se comparó el esquema: 0 columnas solo en la base vieja, 1 cambio de ancho (`recibos_nomina.ruta_archivo` 255->500).
2. Mantenimiento (parada del backend/frontend viejos 23:42:46 UTC; carga completada en 14 s; primer usuario operativo en GoTrue 23:43:47 UTC: **≈1 minuto** sin poder iniciar sesión): `pg_dump -Fc` (plan B) y `--data-only --column-inserts --disable-triggers`, carga como `supabase_admin` en una transacción (guardia: si fallaba, reiniciaba lo viejo), conteos idénticos, `up -d` completo, `scripts/migrar-usuarios-supabase.js` (todos vinculados). El contenedor viejo no tenía `/app/uploads` (nunca se subieron archivos) y la base no tenía filas de archivos.
3. Verificado por el dominio público: web, `config.js` (no-store, anon key y Microsoft=true), GoTrue health/settings, API 401 sin token, Storage; un usuario temporal de prueba (creado y **borrado**): login real, `perfil` sin hash, API autenticada 200, imagen pública, URL firmada y bucket privado sin firma rechazado; Chromium: login, error por credenciales falsas, y el botón de Microsoft llega a la pantalla de Microsoft sin `AADSTS` (la URI de Entra es válida). Primer respaldo hecho en el servidor (sin cifrar).
4. Consumo real del stack Supabase: db ≈ 81 MB, storage ≈ 147 MB, auth ≈ 41 MB, rest ≈ 26 MB (≈ 295 MB), menos que la estimación (370 MB).

**Decisiones:**
- Las cuentas semilla de `init.sql` se migraron tal cual; **pendiente decidir** si se rotan o se desactivan tras validar (no se tocaron por no dejar sin acceso a quien validaba).
- Orden mejorado respecto al runbook: levantar la base nueva y comparar esquemas **antes** de congelar staging.

**Trampas nuevas:** (a) `docker compose run` dentro de un script remoto (`ssh ... bash -s <<EOF`) **se traga la entrada estándar** y descarta los comandos siguientes: usar `</dev/null`; (b) un `IMAGE_TAG` con una mayúscula por error o una credencial de ghcr caducada dan ambos `denied` sin distinguirse: probar `docker manifest inspect` con la etiqueta vieja y la nueva; (c) las etiquetas de ghcr distinguen mayúsculas; (d) GoTrue rechaza con "Signups not allowed" a quien entra con Microsoft sin tener cuenta previa: hay que darla de alta antes.

**Reversa disponible (no se ha usado):** el contenedor y el volumen del Postgres viejo siguen intactos y la configuración anterior está respaldada. Conservar al menos dos semanas.

**Pendientes:** login con Microsoft de extremo a extremo con una cuenta dada de alta; decidir qué hacer con las cuentas semilla; programar los respaldos (cron/systemd) y definir `BACKUP_PASSPHRASE`; retirar el Postgres viejo pasado el plazo; producción sin migrar.

### [2026-10-09] orquestador — Pasos del CI reparados antes del despliegue (lint, pruebas en contenedor, scripts en la imagen)

Al preparar la guía de staging/prod se reprodujeron en local los tres pasos del workflow (`lint`, `db:migrate`, `npm test`), de los que depende la publicación de imágenes (`build` necesita `test`):
1. **`npm run lint` fallaba** por 1 error real (`catch (_) {}` vacío en `modules/comercial/frontend/pages/SolicitudCreditoForm.jsx:81`, de mayo, anterior a la migración) y, localmente, por 209 falsos errores sobre un `dist/` compilado que ESLint escaneaba. Corregido el bloque y añadido `ignorePatterns: ["**/dist/**", "**/node_modules/**"]` en `.eslintrc.json`. Resultado: 0 errores (171 avisos, no bloquean). Se borró el `dist/` local (artefacto ignorado por git).
2. **`npm test` (contenedores) fallaba** porque `scripts/` no estaba en la imagen del backend y el test de `migrar-usuarios-supabase` lo importa. `Dockerfile.backend` ahora hace `COPY scripts/ ./scripts/` en ambas etapas. Resultado: 7 suites, 78 tests, código 0. Efecto colateral deseado: los scripts de migración (`node scripts/migrar-*.js`) corren en cualquier servidor con solo la imagen, sin montar el repo; se quitó el `-v $PWD/scripts:/app/scripts:ro` de la documentación.
3. **`db:migrate`**: carga `init.sql` en una Postgres vacía sin errores (28 tablas).
Nota operativa: `npm test` reutiliza imágenes ya construidas; para probar cambios de Dockerfile usar `docker compose -f docker-compose.test.yml up --build --abort-on-container-exit` (el CI parte de cero y siempre construye).

### [2026-10-09] orquestador — La imagen del frontend ya no lleva la anon key: configuración leída al arrancar el contenedor

**Problema encontrado al preparar el despliegue a staging/prod:** (1) el workflow de CI (`.github/workflows/docker-build-deploy.yml`) construía la imagen del frontend **sin** `VITE_SUPABASE_ANON_KEY` (solo `publicar-ghcr.sh` la pasaba), y ambos publican con la misma etiqueta `ghcr.io/jamejia-rayhsa/intranet/frontend:<sha>`: un push a `main` podía sobrescribir la imagen buena con una que no puede iniciar sesión; (2) la anon key deriva del JWT secret de **cada entorno**, así que una imagen con la clave horneada no sirve para otro entorno; (3) rotar claves obligaba a reconstruir y republicar.

**Decisión:** el contenedor genera `/config.js` al arrancar (`config/nginx/40-config-js.sh`, ejecutado por el entrypoint de nginx) a partir de `SUPABASE_ANON_KEY`, `SUPABASE_URL` (opcional) y `MS365_LOGIN` (= `AZURE_AD_ENABLED`). `modules/portal/frontend/lib/config.js` da prioridad a esa configuración y cae a `VITE_*` en desarrollo (donde `public/config.js` queda vacío). `index.html` carga `/config.js` antes del bundle; nginx lo sirve con `Cache-Control: no-store`. Los valores se filtran a `[A-Za-z0-9._:/-]` para impedir inyección de JS. `Dockerfile.frontend`, los compose de staging/prod y `publicar-ghcr.sh` ya no hornean nada. **Una sola imagen (la del CI) sirve para todos los entornos**, y rotar la anon key o activar Microsoft solo requiere cambiar el `.env` y recrear el contenedor.

**Verificado:** imagen de producción construida sin ninguna clave (0 archivos con un JWT); tres arranques con variables distintas generan su propio `config.js`; un intento de inyección (`";alert(1);//<script>`) queda como `alert1//script`; sin clave el contenedor avisa en el arranque; Chromium: el navegador recibe la clave del arranque, el botón de Microsoft aparece solo con `MS365_LOGIN=true`, y las peticiones a `/auth/v1` llevan esa clave en `apikey` (8/8). Compose dev/staging/prod validan.

**Consecuencia para el despliegue:** staging/prod exigen `SUPABASE_ANON_KEY` en su `.env` (el compose falla con mensaje claro si falta).

### [2026-10-09] orquestador — Se elimina la vinculación por correo del middleware (resuelve el pendiente de `email_verified`)

**Contexto:** el pendiente de la Fase 3/4 era revalidar `email_verified` con un login real de Azure. El usuario ejecutó la consulta sobre `auth.identities`/`auth.users` (usuario migrado con login de Microsoft): identidad `email` -> `identity_data.email_verified = false` y `raw_user_meta_data.email_verified = true`; identidad `azure` -> ambos `true`. Con esos datos, endurecer a `=== true` habría funcionado, pero al releer el middleware el problema real era otro.

**Hallazgo:** `resolverUsuarioSupabase` vinculaba una fila local sin `auth_uid` cuando el token traía un `email` coincidente y `user_metadata.email_verified !== false`. Pero `user_metadata` y el correo de una cuenta de GoTrue **los edita el propio usuario** (`PUT /auth/v1/user`), y con `SUPABASE_EMAIL_AUTOCONFIRM=true` GoTrue aplica el cambio de correo sin confirmación (comportamiento de la opción; **no se reprodujo** el ataque en vivo). Con eso, cualquier cuenta de GoTrue podía adueñarse de una fila local sin `auth_uid` poniendo su correo. `email_verified` no lo evita porque sale de `user_metadata`.

**Decisión:** el middleware resuelve al usuario **solo por `auth_uid`** (sub del token). Sin `auth_uid` -> 403 "Usuario no registrado en la intranet". El vínculo lo crea siempre un administrador (alta de usuario, alta de empleado con usuario, `scripts/migrar-usuarios-supabase.js`), de modo que ningún flujo legítimo se pierde: los 11 usuarios de desarrollo ya están vinculados. El correo solo importa en el primer login con Microsoft, donde **GoTrue** (no la intranet) asocia la identidad `azure` al usuario de GoTrue que tiene ese correo. Tras este cambio el correo de GoTrue es irrelevante para la autorización, así que ya no hay nada que hacer con `email_verified`. Tests: 11 en el middleware (dos nuevos: no vincula aunque coincida el correo, ni con `email_verified: true`); 197 en total.

**Consecuencia:** un usuario existente en GoTrue pero no vinculado (p. ej. creado a mano en Studio) ya no se autovincula: hay que fijar `usuarios.auth_uid` o recrearlo desde el panel. `docs/supabase.md` §5 actualizado con el estado probado.

### [2026-10-08] orquestador — Fase 6 completa: acceso por propietario, auth legado eliminado, respaldos y documentación

**Delegación:** coder A (política de acceso, 3 rondas), coder B (eliminación del auth legado y alta de empleados con GoTrue), coder C (respaldos/restauración y documentación), revisor (APROBADO). Verificación propia con un stack aislado (`intranet_e2e`) y Chromium.

**Datos reales de desarrollo (decisión del usuario: "si hay copia, los migras"):** la base vieja (volumen `intranet_postgres_data_dev`) tenía 11 usuarios, 5 empleados, 3 noticias (+3 imágenes), 1 solicitud de vacaciones y 17 registros de auditoría; se migraron a `intranet_supabase_db_data` (`pg_dump --data-only --column-inserts --disable-triggers`, TRUNCATE + carga en una transacción **como `supabase_admin`**; con `postgres` falla por triggers RI del sistema) y se crearon los 11 usuarios en GoTrue con sus hashes (conservan contraseña). El volumen viejo queda como respaldo. **No había archivos que copiar:** las 3 imágenes de noticias apuntaban a archivos que ya no existían en ningún volumen. Incidente propio: durante la prueba de la Fase 5 dejé 4 archivos `legado_*` en el volumen real `intranet_uploads_data`; se detectaron y borraron. Desde entonces las pruebas del orquestador usan un proyecto aparte (`COMPOSE_PROJECT_NAME=intranet_e2e`).

**Decisiones:**
1. **Política de acceso (usuario):** recibos y expedientes solo el empleado dueño o RH. Para tickets (decisión del orquestador, confirmada tácitamente): solicitante, técnico asignado o administrador. **RH = permiso `edicion`** sobre la opción (o `super_admin`) vía `tienePermiso`; en permisos de ausencia y vacaciones RH = `Empleados:edicion` (no `Permisos/Vacaciones:edicion`, que el seed da a `rh_empleado` para solicitar). Migración `rh/008` concede a `rh_empleado` `Expedientes:consulta`. 403 uniforme `{mensaje:"No tienes acceso a este recurso"}`, ids numéricos 400 antes del chequeo. Se cerró el hueco más grave preexistente: `GET /empleados/:id` no tenía control y exponía CURP/NSS/CLABE a cualquier usuario autenticado. También: listado de vacaciones sin vínculo de empleado devolvía todo; permisos de ausencia sin filtro de dueño; escrituras de tickets (asignar/borrar solo administrador; estado administrador o técnico asignado; `tecnico_id` del cuerpo solo si es admin; encuesta solo solicitante).
2. **Auth legado eliminado:** `ms365.service`, `jwt.service`, `auth.service`, rutas `/auth/{inicio-sesion,registro,ms365,renovar}`, `AUTH_LEGACY_ENABLED`, `JWT_*` y `/registro` en el frontend. El middleware solo acepta tokens de GoTrue (probado: secreto legado, otro secreto, audiencia errónea y `alg:none` dan 401). Contraseñas solo en GoTrue (`cambiarPassword` valida la actual contra GoTrue); `usuarios.hash_password` queda en desuso y **no se borra** (el script de migración la necesita para entornos no migrados; eliminable cuando todos lo estén). `bcrypt` retirado; `axios` se queda (lo usa comercial).
3. **Bugs que la prueba en vivo destapó:** (a) `POST /api/usuarios` **nunca existió** (el controlador `crear` sí; el panel de administración daba 404 y las cuentas solo se creaban por el registro público): se agregó la ruta con permiso `Usuarios:edicion`; (b) el alta de empleado con `crear_usuario` insertaba un usuario sin cuenta en GoTrue (no podría iniciar sesión): ahora GoTrue primero, `auth_uid` en el INSERT, `requiere_cambio_password`, contraseña temporal de 12 caracteres devuelta una sola vez y compensación completa; (c) 2 tests preexistentes eran tautológicos (Express vacío esperando 401): reescritos contra el controlador real; (d) test muerto `modules/portal/tests/noticia.controller.test.js` eliminado.
4. **Respaldos (faltaba desde la Fase 1):** `scripts/supabase/backup.sh` y `restore.sh` (volcado `pg_dump -Fc` de `public`+`auth`+`storage`, tar de objetos con xattrs usando `debian:bookworm-slim` porque busybox no soporta `--xattrs` y Storage guarda ahí el content-type, MANIFEST con sha256 y conteos, retención, cifrado opcional). **Probado de extremo a extremo:** usuario con contraseña + fila + objeto, respaldo (con y sin cifrar), destrucción total del proyecto, restauración, y verificación de login, filas, sha256 del objeto y continuidad de secuencias. Estrategia de restauración: stack destino arrancado al menos una vez, restauración solo de datos como `supabase_admin` en una transacción, excluyendo `auth.schema_migrations` y `storage.migrations`. **No está programado:** `docs/supabase.md` trae ejemplos de cron/systemd timer; hay que activarlo en el host y mantener copias fuera de él.
5. **Trampa de Compose descubierta:** `docker-compose.test.yml` compartía nombre de proyecto y de servicio con el de desarrollo, y `npm test` recreó `intranet_postgres_dev` como `intranet_postgres_test` **heredando el volumen `intranet_postgres_data_dev`**. Verificado sobre una copia que los datos originales siguen intactos (11/5/3/3/1/17). Se añadió `name: intranet-test` al compose de tests y se documentó en `docs/supabase.md`.

**Verificado en vivo (stack aislado, 59/59):** recibos y expedientes (dueño sí, ajeno 403, RH sí, listado por periodo solo RH, empleado no sube); fichas de empleados (propia 200, ajena 403, listado general 403, rol sin relación 403); permisos de ausencia y vacaciones (no actúa por otro); tickets (técnico no asignado 403 en detalle/adjuntos/subida/estado; asignado 200; reasignar y borrar solo admin; usuario de otro módulo 403 — **el revisor afirmó erróneamente que `GET /tickets/:id` no filtraba**); alta por admin (`POST /usuarios`, rol, login, sin hash local); alta de empleado con usuario; cambio de contraseña solo en GoTrue; rutas legadas 404 y token legado 401. Chromium: el login no ofrece registro, `/registro` no da formulario, el admin crea un usuario desde el panel y este inicia sesión. 197 tests jest (0 fallos), `vite build` y `config -q` OK.

**Pendientes / riesgos:**
- **Microsoft/Azure sigue sin probarse** (requiere credenciales reales); revalidar `email_verified` en el primer login real. Mantener `AZURE_AD_ENABLED=false` hasta entonces.
- **Staging/prod:** ejecutar `supabase-db-init` (aplica 004/005/007/008), `scripts/migrar-usuarios-supabase.js` y, tras copiar los archivos viejos a `uploads_data`, `scripts/migrar-archivos-storage.js --dry-run` primero. El procedimiento exacto está en `docs/supabase.md` §4. Restaurar un dump de staging real puede chocar con los anchos de `varchar` de `empleados` (ver ADR Fase 0).
- Respaldos sin programar (ver 4). El volumen viejo `intranet_postgres_data_dev` y los orquestadores huérfanos (`intranet_pgadmin_dev`) pueden retirarse cuando el usuario confirme.
- `GET /empleados` y el dashboard RH los sirve cualquier rol con `Empleados:consulta` (en el seed solo `rh_admin`/`super_admin`; una base migrada podría tener otros).
- `tickets_tecnico` no ve los botones de estado en la UI porque `req.user.permisos` nunca se llena (preexistente); por API un técnico asignado sí puede cambiarlo.
- `.claude/settings.json` conserva permisos `curl` a `/api/auth/inicio-sesion` (inofensivos; del usuario, no se tocó) y `.claude/rules/backend/api.md` tiene `paths:` como texto, no como arreglo (el IDE lo marca; preexistente).
- Las 3 imágenes de noticias de desarrollo ya no existen en disco: hay que volver a subirlas.

### [2026-10-08] orquestador — Fase 5 completa: archivos en Supabase Storage

**Delegación:** coder A (storage.service, noticias, app.js), coder B (RH expedientes y recibos), coder C (tickets, script de migración, compose), revisor (APROBADO), y coder B de nuevo para los hallazgos de la prueba en vivo. Verificación propia contra Storage real, API y Chromium.

**Decisiones:**
1. **`storage.service.js`** (fetch nativo, mismo patrón que `supabaseAdmin`): `subir`, `urlFirmada`, `urlPublica`, `eliminar`, `existe`, `asegurarBuckets`, `claveSegura` (ASCII, único). Los 4 buckets se crean solos al arrancar el backend (no fatal, 1 reintento) con visibilidad, límite y mimes alineados con los filtros de multer. Verificado en vivo, incluido `existe`.
2. **Buckets privados** (`tickets-adjuntos`, `rh-expedientes`, `rh-recibos`) con URL firmada de 300 s emitida por `GET .../:id/url` con el mismo `verificarPermiso` que el listado; **`noticias` público de solo lectura** (esas imágenes ya se mostraban sin login). `ruta_archivo` guarda la clave del objeto (`<id>/<archivo>` o plano en noticias); las filas legadas (`/uploads/...`) responden 409 hasta migrarse.
3. **Descarga forzada** (`Content-Disposition: attachment` vía `&download=`) y `window.location.assign` en vez de `window.open` tras un `await`: `/storage/v1` comparte origen con la app, así que servir contenido en línea sería riesgoso, y `window.open` tras una petición asíncrona puede bloquearse como popup. Se acepta que los PDFs ya no se vean en pestaña nueva.
4. **Se eliminó `express.static("/uploads")`** (los recibos y expedientes eran públicos por URL). Probado: `/uploads/...` da 404. `/uploads/` queda en `.gitignore`. El proxy `/uploads` de `vite.config.js` es candidato a limpiar en la Fase 6.
5. **Compensaciones:** si el INSERT falla tras subir, se elimina el objeto (noticias, tickets, expedientes, recibos; probado: 0 huérfanos). Al borrar fila y objeto: BD primero, Storage best-effort con aviso.
6. **`scripts/migrar-archivos-storage.js`** (`npm run db:migrar-archivos-storage`): `--dry-run` (no crea buckets ni escribe), `--limit`, `--tabla`; `UPDATE ... AND ruta_archivo=$vieja` (idempotente y a prueba de carreras); no borra el origen; rutas con `..` cuentan como faltantes; claves ASCII (`Mi Factura Ñandú.pdf` -> `Mi_Factura_Nandu.pdf`; el nombre original se conserva en `nombre_archivo`). Exit 1 si hay faltantes o errores. En staging/prod el volumen `uploads_data` se monta `:ro` y **nace vacío**: hay que copiar ahí los archivos viejos antes de migrar.

**Hallazgo de la prueba en vivo (deriva de esquema, mi línea base de Fase 0 se quedó corta):** `init.sql` definía `recibos_nomina` sin `fecha_pago`, `importe_total`, `descripcion`, `creado_por_id` ni `fecha_creacion` (la migración rh/001 sí los tenía), así que **crear y listar recibos daba 500 antes de esta fase**. La comparación de Fase 0 (dev vs init.sql) no podía verlo porque ambos estaban igual de desactualizados. Corregido con `rh/007-recibos-nomina-columnas.sql` (idempotente, también en `init.sql` y aplicada siempre por `supabase-db-init`, de modo que bases restauradas de un dump también se corrigen). Además `listarPorPeriodo` usaba `e.apellido` (SELECT y ORDER BY) y el perfil mostraba `doc.fecha_carga`: corregidos. Se comparó el resto de tablas RH contra sus modelos: coinciden. Se recorrieron todos los GET de la API: solo recibos fallaba. **Los caminos de escritura de otros módulos no se auditaron exhaustivamente.**

**Verificado en vivo (stack real):** buckets con config correcta; noticias (subida, URL pública idéntica, tipo no permitido rechazado, sin token 401, borrar elimina el objeto); tickets, expedientes y recibos (clave con prefijo, URL firmada idéntica, firma y payload alterados 400, acceso directo y `/public/` a bucket privado rechazados, `/url` sin token 401, empleadoId no numérico rechazado, borrar elimina el objeto); migración con 4 tablas (dry-run no escribe, real migra, faltante y traversal intactos, segunda ejecución idempotente, origen conservado); Chromium: home carga imágenes de noticias desde Storage (200) y el clic en un adjunto descarga el archivo con su nombre original sin popup. 119 tests jest pasan; 2 fallan y son preexistentes (`empleado.controller.test.js`, validación de nombre/apellido: el commit 63fc4f3 cambió el formulario a `apellido_paterno` sin actualizar el test).

**Pendientes / decisiones del usuario:**
- **Autorización por propietario ausente (preexistente):** cualquier usuario con permiso de *consulta* puede obtener el adjunto de cualquier ticket y el expediente o recibo de cualquier empleado (solo se aplica `verificarPermiso`). Las URLs firmadas no lo empeoran, pero conviene decidir una política (solicitante/técnico/administrador en tickets; propio empleado o RH en recibos).
- Validaciones menores sugeridas por el revisor: `empleadoId` numérico en `GET /recibos/empleado/:id`, `GET /recibos/:id` con id no numérico da 500, formato `YYYY-MM` en `periodo`.
- Los PDFs ya no se visualizan en pestaña nueva (descarga forzada); si se quiere visor, requeriría servirlos desde otro origen.
- `permisos_ausencia` (nombre real) vs. índices de la migración rh/001 que mencionan `permisos_ausencias`: preexistente, sin tocar.
- Los 2 tests fallidos de `empleado.controller.test.js` siguen sin arreglar.

### [2026-10-08] orquestador — Fase 4 completa: el frontend usa Supabase Auth

**Delegación:** coder A (código React), coder B (infra: Vite, Dockerfile, compose, publicar-ghcr), revisor (APROBADO sin bloqueantes). Pruebas en vivo del orquestador con Chromium real (Playwright).

**Decisiones:**
1. **Mismo origen.** `lib/supabase.js` usa `VITE_SUPABASE_URL || window.location.origin`; Vite (dev) y nginx (staging/prod) proxifican `/auth/v1` y `/storage/v1`. Solo se hornea la anon key (pública por diseño) como `VITE_SUPABASE_ANON_KEY`; en staging hay que **republicar la imagen del frontend si rota la anon key**. Proxies de Vite con clave regex `^/auth/v1(/|$)` para no capturar `/auth/callback` de la SPA.
2. **Supabase en exclusiva en el frontend.** `utils/token.js: obtenerToken()` es la única fuente del token; el token legado de `localStorage` se elimina al arrancar. Se migraron también 5 consumidores fuera del portal (rh, tickets, auditoria) que habrían enviado `Bearer null`.
3. **AuthContext:** perfil del backend tras la sesión de Supabase; `onAuthStateChange` sin `await` dentro (difiere con `setTimeout`) para evitar deadlock; recarga el perfil solo si cambia el uid. 401/403 del perfil cierra la sesión y muestra `errorAuth`.
4. **Botón de Microsoft detrás de `VITE_MS365_LOGIN`** (build; se alimenta de `AZURE_AD_ENABLED`, default false).
5. **Fuera de alcance:** recuperación de contraseña por correo (requiere SMTP), Storage en el frontend (Fase 5), borrar lo legado (Fase 6).
6. **Endurecimiento tras la revisión:** `error_description` de la URL se acota a 200 caracteres. El XSS no era explotable (React escapa; comprobado con payload `<img onerror>`), solo defensa en profundidad.

**Verificado en vivo:** proxy de Vite (`/auth/v1/health`, `/storage/v1/status` 200, `/auth/callback` sirve la SPA); `supabase-js` real: contraseña incorrecta rechazada, sesión de 3600 s, token aceptado por el backend sin exponer hash ni `auth_uid`, refresh OK. **Chromium (16/16):** `/` sin sesión redirige al login, token legado limpiado, sin botón de Microsoft, contraseña incorrecta muestra error, login correcto entra, la home muestra al usuario, recargar mantiene la sesión, `/admin/usuarios` carga datos del backend con token de Supabase, cerrar sesión vuelve al login, usuario que existe en GoTrue pero no en la intranet queda en login con mensaje de sin acceso, callback con payload XSS no ejecuta script y se muestra como texto; 0 errores de consola.

**Pendientes / riesgos:**
- **Login con Microsoft NO probado** (requiere Azure real): configurar `AZURE_AD_*`, registrar el redirect `https://<host>/auth/v1/callback` en Azure y **revalidar `email_verified`** (ADR Fase 3) con un login real. Sin eso, `AZURE_AD_ENABLED` debe seguir en `false`.
- `TOKEN_REFRESHED` no recarga el perfil si el uid es el mismo: un cambio de rol durante una sesión larga se ve tras F5 (aceptable).
- El frontend no tiene tests unitarios; la cobertura actual es la prueba de Playwright (no commiteada).
- **Registro público** (`/registro`) preexistente: cualquiera puede crear una cuenta sin permisos mientras `AUTH_LEGACY_ENABLED` esté activo. Decidir en Fase 6 si se elimina.
- Recuperación de contraseña por correo: falta SMTP.

### [2026-10-08] orquestador — Fase 3 completa: Supabase Auth (GoTrue) conviviendo con el login legado

**Delegación:** coder A (middleware, servicio admin, auth, compose), coder B (script de migración de usuarios, alta/reset), revisor (RECHAZADO por 1 hallazgo, rechazado a su vez por el orquestador; ver abajo), coder B de nuevo (ajustes). Verificación propia contra GoTrue real.

**Decisiones:**
1. **Coexistencia con bandera `AUTH_LEGACY_ENABLED` (default `true`).** El frontend sigue en login legado hasta la Fase 4. Con la bandera en `false`, `/auth/inicio-sesion`, `/registro`, `/ms365*` y `/renovar` dan 404 y el middleware rechaza tokens legados. El código legado se borra en Fase 6.
2. **Middleware** (`auth.middleware.js`): verifica HS256 con `SUPABASE_JWT_SECRET` y `aud=authenticated`; busca por `auth_uid`, y si no hay vínculo, por `lower(correo)` (solo `UPDATE ... WHERE auth_uid IS NULL`). Token Supabase válido pero usuario inexistente o inactivo = 403 y nunca cae al flujo legado. `req.user` conserva su forma (los 10 archivos que usan `usuario_id` no cambian).
3. **Cliente GoTrue sin dependencia nueva:** `supabaseAdmin.service.js` con `fetch` nativo contra `SUPABASE_AUTH_URL` (red interna; sin gateway no existe `/auth/v1` interno). `buscarPorCorreo` pagina `/admin/users` (O(n)): solo para scripts y el callback legado de MS365, no para rutas calientes.
4. **Escritura doble de contraseñas** (GoTrue + `hash_password`) mientras convivan ambos sistemas; con compensación si falla el segundo paso. Alta/registro: GoTrue primero, `auth_uid` en el INSERT, y si el INSERT falla se elimina el usuario de GoTrue.
5. **El hash y `auth_uid` no salen por la API** (corrige la fuga preexistente de `hash_password` en `/auth/perfil`): `buscarPorId/buscarPorCorreo` sin hash, variantes `*ConHash` solo internas, y `utils/sinSecretos.js` en las respuestas.
6. **`eliminar` usuario: orden local primero, GoTrue después** (el revisor pidió invertirlo; se rechazó). El middleware autoriza por la fila local, así que una identidad huérfana en GoTrue recibe 403 (verificado); invertirlo sería irrecuperable si el borrado local falla, porque no se puede recrear la identidad con su contraseña. Un fallo de limpieza en GoTrue se registra y no bloquea.
7. **GoTrue con `DISABLE_SIGNUP=true`:** el script `scripts/migrar-usuarios-supabase.js` debe precrear a TODOS los usuarios activos (incluidos `ms365`, sin contraseña); el primer login con Microsoft se vincula por correo. Un usuario nuevo de Microsoft que no esté en GoTrue ni en la intranet NO puede entrar.

**Verificado contra GoTrue real:** GoTrue acepta los hashes bcrypt `$2b$` tal cual (no hizo falta normalizar a `$2a$`); script en dry-run no escribe, en real crea 7/7 y es idempotente; token de GoTrue accede a `/usuarios`, `/empleados` y `/auditoria` como super_admin; usuario inactivo = 403; usuario en GoTrue sin fila local = 403; vinculación por correo con mayúsculas distintas OK; token legado OK con bandera activa y 401 con bandera apagada (rutas legadas 404, Supabase sigue 200); cambio de contraseña actualiza GoTrue y la BD local (la vieja deja de funcionar, el login legado acepta la nueva); 54 tests jest verdes.

**Pendientes / riesgos conocidos:**
- `email_verified !== false` en el middleware se mantiene permisivo a propósito: con el auto-registro apagado solo un admin puede crear identidades, y exigir `=== true` podría dejar fuera a usuarios de Azure si GoTrue no emite el claim. **Revalidar al probar Azure en la Fase 4.**
- Cambio de correo de un usuario no se sincroniza con GoTrue (hoy `actualizar` no lo acepta; hay un TODO en el código).
- Un usuario eliminado cuya limpieza en GoTrue falló deja una identidad huérfana; recrear ese correo chocaría (422). Limpieza manual con el servicio admin.
- Usuarios locales sin `hash_password` se omiten en la migración (quedan sin acceso hasta que un admin les resetee la contraseña).
- Acción externa: registrar en Azure Portal el redirect URI `https://<host>/auth/v1/callback` y configurar `AZURE_AD_*` en el `.env` (la Fase 4 lo necesita).

### [2026-10-08] orquestador — Fase 2 completa: la app corre sobre el Postgres de Supabase

**Delegación:** coder A (compose/env), coder B (pools), revisor (APROBADO sin bloqueantes, ver reviews.md). Verificación propia del orquestador con el flujo real de dev.

**Decisiones:**
1. **`include:` en dev/staging/prod** para incorporar `docker-compose.supabase.yml`; dev suma `docker-compose.supabase.dev.yml` (DB publicada solo en `127.0.0.1`). El `name:` del compose raíz gana: los volúmenes de Supabase quedan con el prefijo del entorno (`intranet_supabase_db_data` en dev, `intranet-staging_...` en staging).
2. **`supabase-db-init`** (one-shot): carga `init.sql` con `--single-transaction` solo si no existe `public.usuarios`, y siempre aplica `004-rls-deny-all.sql`. El backend espera `service_completed_successfully`. `--single-transaction` se añadió tras la revisión: sin él, un fallo a mitad dejaba `usuarios` creada y el siguiente arranque saltaba el init (probado: fallo provocado → 0 tablas).
3. Backend: `POSTGRES_HOST=supabase-db`, `POSTGRES_DB=postgres`. Un solo pool (`grupo` de portal); auditoría ya no crea pools propios.
4. Observación del revisor descartada: `dev_password_123` NO es problema de URL (`_` es carácter seguro).

**Verificado (dev real, sin `down -v`):** init crea 28 tablas con RLS; backend conecta; registro, login, perfil y 401 sin token OK; como super_admin responden 200 usuarios, roles, módulos, noticias, empleados, tickets, auditoría, rh/dashboard y vacaciones; crear ticket escribe `solicitante_id` y deja un registro de auditoría (pool consolidado OK). Volúmenes de prueba eliminados; `intranet_postgres_data_dev` y `intranet_uploads_data` intactos.

**Pendientes detectados (no resueltos en esta fase):**
- **Seguridad, preexistente:** `GET /api/auth/perfil` devuelve `hash_password` al cliente. Corregir en Fase 3 al reescribir el perfil (excluir el campo en el modelo, no solo en el controlador, y revisar `/usuarios`).
- Los datos de la BD anterior (volumen `intranet_postgres_data_dev`) no se migran solos: la BD nueva arranca con las semillas de `init.sql`. Para conservar datos, `pg_dump` del contenedor viejo y restaurar en `supabase-db` ANTES del primer `up` completo.
- Contenedores huérfanos `intranet_postgres_dev` e `intranet_pgadmin_dev` siguen en el host (detenidos); retirar tras confirmar.
- README.md (portal/auditoría) aún cita `intranet_postgres_dev`, `intranet_dev`, `pgadmin:5050`: actualizar en Fase 6.
- Los mensajes de las rutas de comentarios de tickets no se probaron por API (la tabla sí existe); verificar en Fase 3.

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
   - MBA3: `POST /solicitudes/:id/sincronizar-mba3` (~~stub — retorna 501 con mensaje pendiente~~ DESACTUALIZADO, ver nota [2026-10-22] más abajo: el código actual sí llama a MBA3)
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
   - ~~Endpoint `POST /solicitudes/:id/sincronizar-mba3` retorna `{ exito: false, mensaje: 'Integración MBA3 pendiente de especificación de API' }`~~
   - ~~Comentario en el código indica los campos que se mapearán cuando llegue la documentación~~
   - ~~Estado `enviada_mba3` no se activa en el stub~~
   - DESACTUALIZADO desde algún momento posterior a esta ADR, sin registro del cambio — ver nota [2026-10-22] más abajo

9. **MenuDinamico.jsx — agregar SUB_RUTAS comercial**
   ```js
   comercial: [
     { path: '/comercial', label: 'Dashboard', opcion: null },
     { path: '/comercial/creditos', label: 'Solicitudes de Crédito', opcion: 'Solicitudes de Crédito' },
   ]
   ```

10. **Auditoría** — `registrarAccion(req, 'comercial', 'solicitudes_credito', id, accion, previo, nuevo)` en crear, actualizar y cambiar estado

**Restricciones aceptadas:**
- ~~MBA3 no implementado (spec en PDF no legible)~~ DESACTUALIZADO, ver nota [2026-10-22]
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

### [2026-10-09] orquestador — ADR: Encuestas de satisfacción de tickets (cierre del módulo)

**Contexto:** PLAN.md (Etapa 2) pedía tabla, modelo, controlador y `SatisfactionSurvey`; existían pero con fallos: la página de estadísticas leía `promedio_calificacion` (el backend envía `promedio`), el correo de cambio de estado nunca salía (`ticket.usuario_id` no existe; la columna es `solicitante_id`), `init.sql` creaba `ticket_encuestas` sin UNIQUE ni `ON DELETE CASCADE`, el backend aceptaba encuestas en cualquier estado mientras la UI solo las mostraba en «resuelto», y no había tests.

**Decisiones:**
1. **Una encuesta por ticket garantizada por la BD** (`UNIQUE(ticket_id)`, migración `tickets/003-encuestas-unicas.sql`, también en `init.sql` y en `supabase-db-init`). `crear` usa `ON CONFLICT DO NOTHING` y responde 409 si ya existía. La migración deduplica (conserva la más antigua) y pone `ON DELETE CASCADE` (antes un ticket con encuesta no se podía borrar).
2. **Cuándo se responde:** ticket en `resuelto` o `cerrado` (el backend lo exige; antes cualquier estado) y solo el solicitante (los admins no responden por otros). Calificación entera 1-5; comentarios ≤ 1000 caracteres.
3. **Invitación:** correo de cambio de estado corregido (incluye enlace `/tickets/lista?ticket=ID`; requiere SMTP configurado, hoy no lo está en staging) + aviso en la lista de tickets vía `GET /tickets/encuestas/pendientes` (permiso `Tickets: consulta`, solo los del propio usuario).
4. **Estadísticas (`GET /tickets/encuestas/estadisticas?desde&hasta`):** resumen, distribución 1-5, % satisfechos (4-5), por categoría, comentarios recientes (≤2★ primero). **Visibilidad:** super_admin / `tickets_admin` / `tickets.admin` ven todo y el ranking por técnico; un técnico ve solo sus tickets (sin ranking); cualquier otro rol con `Encuestas: consulta` recibe únicamente el resumen global.
5. Auditoría del estado/asignación usaba `tecnico_asignado_id` (inexistente); ahora `tecnico_id`.

**Trampas / pendientes:**
- Ningún rol sembrado salvo `tickets_admin` tiene `Encuestas: edicion`: para que un solicitante responda, su rol necesita `Tickets: consulta` y `Encuestas: edicion` (se asigna desde el portal; no se tocó el seed).
- `SMTP_DE_DEFAECTO` (typo) se usa igual en los `.env` y en dos servicios; no se renombró para no romper despliegues existentes.
- `docker-compose.supabase.yml` aplica 003 en cada `up` (idempotente); bases ya desplegadas la reciben al recrear `supabase-db-init`.

### [2026-10-13] orquestador — ADR: Notificaciones de la intranet vía event-proxy (webhook n8n WF-INTRA-01)

**Decisión:** correo y DM de Teams de la intranet salen por un webhook nuevo de n8n (WF-INTRA-01, event-proxy), reutilizando Graph (correo desde `intranet@rayhsa.com.mx`; DM de Teams con la cuenta delegada `rayhsa@`, D14/D35 del event-proxy). **No** se usa su cola `event_queue`: el despachador entrega cada evento a todos los destinos habilitados y las plantillas son fijas de MBA3, y los WF piloto están bajo puertas GO/NO-GO.
**Lado intranet (hecho):** `portal/backend/services/notificador.service.js` (POST con `X-Intranet-Secret`, timeout 5 s, nunca lanza); `tickets/notificacion.service.js` lo usa si `N8N_NOTIFICAR_URL`/`N8N_NOTIFICAR_SECRETO` existen y cae a SMTP si no (en `development` sigue simulando). Resolver pide canal `ambos` (correo + Teams); asignación también.
**Decisiones del usuario (2026-10-13):** WF autorizado; remitente `intranet@rayhsa.com.mx`; la cuenta de Teams puede abrir DM con cualquier empleado; backend conectado a la red `proxy` (staging); secreto en `.env.staging`; volumen ≤ 50/día. Los workflows de la intranet usan el prefijo `WF-INTRA-NN` (los `WF-NN` ya son del MBA3). WF-INTRA-01 está importado en n8n **inactivo** (activarlo en la UI). **Pendiente:** activar, probar y fijar `FRONTEND_URL` (los enlaces del correo dependen de ella; el backend no la recibía).

### [2026-10-14] orquestador — ADR (cierre D41 del event-proxy): notificaciones listas para la migración a producción
**Hecho:** RH usa también el webhook de n8n (`origen: rh`; permiso aprobado/rechazado = correo + Teams, aviso al jefe = correo) con respaldo SMTP; `docker-compose.prod.n8n.yml` (override opcional que une el backend a la red `proxy`, para hosts que comparten Docker con n8n; sin él prod sigue funcionando con SMTP); `.env.prod.example` con la URL de n8n y `FRONTEND_URL`; `docs/notificaciones.md` con variables, qué manda cada módulo y checklist de producción.
**Por qué un override y no `proxy` en el compose base:** una red `external` que no existe hace fallar `up`; el host de producción puede no tener esa red.
**Al migrar:** seguir el checklist de `docs/notificaciones.md` (secreto en el `.env.prod`, red `proxy`, probar 403 sin secreto y un aviso real).

### [2026-10-14] orquestador — Noticias/eventos: 2:3, boletín y carrusel — hallazgos y plan PROPUESTO (pendiente de aprobación)
**Estado:** NO es una decisión tomada; el humano debe aprobar las fases y responder las preguntas de producto antes de implementar.
**Contexto:** el objetivo pide imagen vertical 500x750 centrada, categoría "boletín" (solo imagen) y eventos con carrusel de varias imágenes. Apoyo previo: Fase 5 del 2026-10-08 (imágenes de noticias en el bucket público `noticias`, helper `urlImagenNoticia`) y el carrusel a pantalla completa de Inicio (PR #3).
**Hallazgos clave (research.md, entrada del 2026-10-14):** "evento" no existe; tipos hoy noticia/comunicado/oferta_empleo sin CHECK en BD; la BD ya es 1:N con `orden` y la API limita a 5 imágenes, pero carrusel, tarjeta y modal solo muestran `imagenes[0]`; no hay procesado de imagen ni dimensiones guardadas, así que forzar 2:3 recorta; nginx de prod limita `/api/` a 1 MB; hay 0 tests de noticias.
**Plan propuesto:** ver memory/roadmap.md (Fase 1 presentación 2:3; Fase 2 boletín; Fase 3 eventos con carrusel; Fase 4 nginx, tests, revisión, pruebas y staging).
**Alternativas descartadas por ahora:** procesar/redimensionar imágenes en el servidor (añade dependencia y no es necesario si basta CSS) — se reevalúa según la respuesta sobre recorte.

### [2026-10-14] orquestador — Noticias/eventos: decisiones de producto del humano (aprobadas)
**Contexto:** respuestas del usuario a las preguntas abiertas de research.md (entrada del 2026-10-14) para el plan propuesto arriba. El plan por fases sigue pendiente de GO fase por fase.
**Decisión (del humano):**
1. **Ajuste de imagen:** completa dentro del marco 2:3 sobre **fondo desenfocado** (la imagen no se recorta; el marco se rellena con la misma imagen difuminada).
2. **Evento:** **tipo nuevo de noticia con fecha y lugar** (`tipo = 'evento'` + campos propios de fecha del evento y lugar; migración de BD sencilla). Varias imágenes por evento en un carrusel 2:3.
3. **Boletín:** tipo `boletin`; aparece en el carrusel de Inicio y en `/noticias`; al hacer clic **amplía la imagen**. Se guarda un título interno (la BD exige `titulo NOT NULL`) solo para identificarlo en el panel; **nunca se muestra** ni título ni descripción. Una imagen por boletín.
4. **Alcance del 2:3:** **todas las vistas, incluidas las tarjetas de `/noticias`** (la cuadrícula pasa a formato vertical).
**Por qué:** elegidas por el usuario entre las alternativas presentadas; la recomendada del orquestador era "cover/recorte", "tipo nuevo sin campos" y "solo carrusel y modal", y el usuario decidió distinto en esos tres puntos.
**Alternativas descartadas:** recorte (cover) y franjas (contain); módulo de eventos aparte; limitar el formato al carrusel/modal.
**Consecuencias para el plan:** Fase 1 incluye tarjetas y la cuadrícula; Fase 3 incluye migración (`fecha_evento`, `lugar`) y su validación; el fondo desenfocado se resuelve con CSS (sin dependencia de imagen en servidor). Quedan abiertas para sus fases: límites de subida/nginx, permisos de creación, borradores visibles por id, orden y autoavance del carrusel de imágenes.

### [2026-10-14] orquestador — Fase 1 noticias: revisión APROBADA CON OBSERVACIONES; tarjetas más angostas (decisión del humano)
**Contexto:** el revisor aprobó con observaciones la Fase 1 (reviews.md, 9 hallazgos, ninguno crítico, sin violar decisiones). El hallazgo H2 era de producto: con 2:3 en todas las vistas las tarjetas de `/noticias` quedaban muy altas (~400-470 px de imagen).
**Decisión (del humano):** tarjetas más angostas — se mantiene el marco 2:3 completo con fondo desenfocado y se reduce el ancho mínimo de la tarjeta (~180-200 px), de modo que caben más por fila y la imagen mide ~270-300 px de alto.
**Corregido en la fase (coder, verificado por build/lint/jest):** H1 flechas del carrusel por encima del texto en móvil; H5 cierre y etiqueta del modal; H6 piso de altura del marco del modal; H7 fallback `vh`; H8 texto "Sin imagen" del modal; H9 CSS huérfano.
**Diferido (no es de esta fase):** H3 coste del blur en listas de 50 tarjetas (se mide en staging y se mitiga si hace falta); H4 +3 warnings falsos de `no-unused-vars` en JSX → chore aparte para configurar `react/jsx-uses-vars` en ESLint.
**Alternativas descartadas:** dejar las tarjetas como estaban; tope de altura fijo en la tarjeta.

### [2026-10-14] orquestador — Fase 1 noticias (marco vertical 2:3): lista para GO/NO-GO del humano
**Contexto:** tres rondas coder ↔ revisor sobre el frontend de portal (reviews.md: aprobado con observaciones, 0 críticos, sin violar decisiones). Verificación del orquestador: `vite build` OK, jest 25/25 suites (245 tests), eslint 0 errores.
**Resultado:** componente `ImagenVertical` (2:3, imagen completa sobre fondo desenfocado) aplicado al carrusel de Inicio, el modal y las tarjetas de `/noticias` (200x300). Sin cambios de backend, BD, editor ni dependencias.
**Pendiente / no verificado:** nadie ha visto el resultado en un navegador (todo se razonó sobre las reglas CSS y se compiló). Observaciones bajas abiertas: el cierre del modal se desplaza con el diálogo en pantallas bajas; cubre una esquina del marco en móvil. Diferidos: H3 (coste del blur, medir en staging) y H4 (warnings falsos de ESLint, chore aparte).
**Puerta:** el humano revisa visualmente en staging y decide el GO a la Fase 2 (boletín). Publicar y desplegar a staging requiere su OK explícito.

### [2026-10-14] [tester] — PARA RESOLVER: modal de noticia desborda el ancho (NO reproducido en Chromium 156 / Firefox 157)
**Hecho medido (tests.md, "Modal de noticia con imagen: medición real del desborde de ancho"):** 632 mediciones en 8-9 anchos x 4-5 altos x 4 variantes de imagen (vertical, horizontal, cuadrada, sin imagen), con scrollbars reales, emulación móvil, texto patológico y el CSS servido por el dev server (idéntico al repo): el diálogo nunca supera la ventana ni hay scroll horizontal; el marco queda 2:3. No hay causa raíz medida ni ajuste CSS verificable. La medición sí detecta el desborde cuando se fuerza (control positivo).
**Hallazgo que afecta a lo ya decidido:** el diagnóstico del coder (code-notes.md, "modal desbordaba el ancho de la página": `min-width:auto` del item flex) es incorrecto: `.rayhsa-modal` tiene `overflow:hidden`, cuyo mínimo automático es 0; el estado anterior a su corrección tampoco desborda. La corrección `min-width:0` es inocua pero no ataca la causa real del reporte.
**Qué hace falta para resolver (decide el orquestador / humano):** (1) que el humano pegue en la consola de DevTools, con el modal abierto, el snippet de diagnóstico de tests.md (devuelve navegador, ancho, zoom, rects del diálogo/overlay/marco y qué elementos pasan del borde derecho) y una captura de pantalla con el tamaño de ventana; (2) confirmar si fue tras recarga dura (Ctrl+Shift+R) y si usa el modal de Inicio (`ArticleModal`) o el editor del admin (`NewsEditorModal`, que no se tocó en esta fase y no se midió); (3) si aporta el navegador/GPU, repetir la medición en ese navegador. Hasta tener esos datos no se recomienda otro cambio de CSS a ciegas.
**Observación menor aparte (cambio de código opcional):** un autor sin espacios muy largo en `.rayhsa-modal__meta` se recorta por el `overflow:hidden` del diálogo; ajuste posible en rayhsa-system.css: `.rayhsa-modal__meta > span { min-width: 0; overflow-wrap: anywhere; }` y `flex-wrap: wrap` en `.rayhsa-modal__meta` (no verificado por inyección, no es el defecto reportado).
- [2026-10-14] [tester] SEGUIMIENTO del PARA RESOLVER "modal de noticia desborda el ancho": re-medición tras el cambio del coder (alto limitado, marco reducido, cuerpo con scroll): 6/6 criterios PASS en Chromium 156, Firefox 157, dev server y móvil emulado (280+175+80+72 casos); diálogo dentro de la ventana en ancho y alto, overlay sin scroll hasta 568 de alto, marco 2:3 (373x560 a 1080, 263x394 a 800, 242x362 a 768, 133x200 mínimo), cuerpo con scroll, autor largo ya no se recorta. Detalle en tests.md ("re-medición tras reducir el marco y limitar el alto"). El desborde de ancho reportado sigue sin reproducirse y sin causa raíz (siguen pendientes los datos del humano si lo vuelve a ver); la observación menor del meta largo queda resuelta por el cambio.

### [2026-10-14] orquestador — Fase 1: modal de noticia — imagen reducida para que el diálogo quepa en la ventana (instrucción del humano)
**Contexto:** el humano reportó dos veces que el modal de una noticia con imagen "se sale del ancho de la página". Una primera corrección del coder (min-width: 0, etc.) no tenía base: el tester midió 632 casos en Chromium y Firefox y **no reprodujo desborde de ancho**; el diagnóstico del coder era incorrecto (tests.md). Lo que sí se medía: el diálogo completo superaba el alto de la ventana y el overlay hacía scroll.
**Decisión (instrucción del humano: "reduce la imagen si es necesario, conservando la proporción"):** el marco del modal se reduce con la ventana (`clamp(200px, 100vh − 406px, 560px)`, siempre 2:3), el diálogo tiene `max-height: calc(100vh − 6rem)` y el cuerpo de texto hace scroll propio; carrusel y tarjetas no cambian. Medido: 373×560 a 1080 de alto, 263×394 a 800, 133×200 a 568; 280/280 casos con el diálogo dentro de la ventana, sin scroll del overlay ni horizontal, 2:3 conservado.
**Trade-off:** el máximo en el modal es 373×560, ya no 500×750 (el cuerpo visible queda ~166 px entre 667 y 900 de alto). Si el humano prefiere imagen mayor, se ajusta el 406 / el tope 560.
**Abierto:** la causa del reporte original de ancho no se reprodujo; si reaparece, hace falta captura + el snippet de diagnóstico de tests.md (navegador, zoom, rects). Cierra el PARA RESOLVER del tester en lo que respecta al alto.

### [2026-10-14] [tester] — PARA RESOLVER: cursor `zoom-in` del slide de boletín no se aplica (menor, cosmético)
**Hecho medido (tests.md, "Fase 2 noticias: categoría boletín"):** en Chromium 156 y Firefox 157, `getComputedStyle(.news-hero__slide--boletin).cursor` es `pointer`, no `zoom-in`. Causa: `modules/portal/frontend/styles/rayhsa-system.css:498` (`.rayhsa .news-hero__slide--boletin { cursor: zoom-in; }`) está antes que `:548` (`.rayhsa .news-hero__slide { cursor: pointer }`) con la misma especificidad y pierde por orden. Criterio: code-notes de Fase 2 declara cursor `zoom-in` en el slide de boletín. Cambio posible: subir la especificidad (`.rayhsa .news-hero__slide.news-hero__slide--boletin`) o mover la regla después de la base. Nada funcional se rompe.

### [2026-10-14] [tester] — PARA RESOLVER (decisión de producto, opcional): tarjeta de boletín estirada con espacio blanco en /noticias
**Hecho medido (tests.md, captura `app2/shots/noticias_chromium_todas.png` del scratch):** la tarjeta de boletín solo tiene el marco 200x300 pero la cuadrícula la estira al alto de las tarjetas con texto de su fila (p. ej. 527 px), dejando un bloque blanco vacío bajo la imagen y sin el color de fondo por tipo. Cumple la decisión (solo imagen, mismo marco), pero el humano decide si lo quiere así o con `align-self:start` / altura al contenido en `.noticia-tarjeta--boletin`.
- [2026-10-14] [tester] Resumen Fase 2 boletín: 0 fallos funcionales, 1 FAIL cosmético (cursor) y observaciones de accesibilidad/editor en tests.md (sin trampa de foco en el visor; slides de carrusel no abribles con teclado; subtítulo/contenido ocultos se siguen enviando al cambiar a boletín; aviso de error no se limpia al cambiar tipo). Backend: 18/18 tests nuevos verdes; jest 263/263; eslint 0 errores.

### [2026-10-14] orquestador — Fase 2 boletín: revisión y pruebas sin críticos; decisiones del humano sobre seguridad de la API y tarjeta
**Contexto:** revisor (APROBADO CON OBSERVACIONES, 15 hallazgos, 0 críticos) y tester (navegador real con los componentes reales en Chromium y Firefox; sin fallos funcionales; 1 FAIL cosmético y 1 observación de producto). El coder corrigió las observaciones técnicas sin decisión de producto (cursor zoom-in, boletín del carrusel accesible por teclado con botón real, error del editor, tipo vacío unificado, tests más fuertes, filtros en plural, limpieza).
**Decisión (del humano):**
1. **H1 (alto, preexistente): corregir ahora.** `GET /api/noticias/:id` público solo devuelve noticias publicadas; un usuario autenticado con permiso de edición sigue viendo borradores.
2. **H2/H3: ocultar en la API pública.** Para `tipo = 'boletin'` los endpoints públicos devuelven solo id, tipo, fecha de publicación e imágenes (nunca título interno, subtítulo, contenido ni autor); el editor guarda `subtitulo` y `contenido` vacíos en boletines. El título interno solo lo ve el panel autenticado.
3. **Tarjeta de boletín en /noticias:** alinear arriba (`align-self: start`), sin bloque blanco; las demás tarjetas no cambian.
**Aceptado/diferido:** H5 (filtro de /noticias tras paginar en servidor) → Fase 4; H7 (carrera del límite de 1 imagen), H8 (reglas solo en UI) aceptados; H12/H14/H15 (código muerto previo, auditoría del PUT, foco del visor) → Fase 4; falta cubrir sesión real, Storage real, GPU real y WebKit.
- [2026-10-14] [tester] SEGUIMIENTO de los PARA RESOLVER de Fase 2 boletín: RESUELTOS ambos. (1) cursor `zoom-in` del slide de boletín: computado `zoom-in` en Chromium 156 y Firefox 157; (2) tarjeta de boletín estirada: `align-self:start`, 302 px vs 520 de la fila, sin bloque blanco y sin cambios en las demás. Además verificados: boletín del carrusel como `<button>` operable por teclado (Tab, Enter, Espacio, una sola apertura), datos mínimos de la API pública sin errores/warnings, filtro en plural, editor sin aviso residual y con payload vacío; jest 275/275, eslint 0 errores (tests.md, "re-prueba tras correcciones y decisiones del humano").

### [2026-10-14] orquestador — Fase 2 noticias (categoría boletín): lista para GO/NO-GO del humano
**Contexto:** coder, revisor y tester completaron la Fase 2 con dos rondas de correcciones y la aplicación de tus decisiones (borradores, API pública del boletín, tarjeta alineada arriba).
**Resultado:** `tipo = 'boletin'` validado en backend y frontend (listas únicas con paridad comentada); editor con título interno, una imagen y bloqueo de publicar sin imagen; carrusel y tarjetas solo con el marco 2:3; clic amplía en un visor accesible por teclado; API pública del boletín mínima; `GET /api/noticias/:id` ya no sirve borradores; ruta `GET /api/noticias/admin/:id` para el panel. Revisor: APROBADO CON OBSERVACIONES, 0 críticos/altos. Tester: sin fallos con los componentes reales en Chromium y Firefox (30 combinaciones de viewport cada uno + emulación táctil). Orquestador: build OK, jest 26/26 suites (275 tests), eslint 0 errores.
**No verificado:** subida real de la imagen a Storage, sesión real, el endpoint `admin/:id` contra Postgres, GPU real, WebKit. Observaciones bajas diferidas a la Fase 4 (lista en roadmap.md).
**Puerta:** el humano ve un boletín en desarrollo y decide el GO a la Fase 3 (eventos con fecha, lugar y carrusel). Commit, publicación y despliegue siguen pendientes de su OK.

### [2026-10-15] orquestador — Fase 3 noticias (eventos): decisiones de producto del humano (aprobadas)
**Contexto:** GO a la Fase 3. Antes de delegar se cerraron las decisiones de producto que el plan no cubría (research.md, preguntas 5 y 6).
**Decisión (del humano):**
1. **Evento en listas** (carrusel de Inicio y tarjetas de `/noticias`): como una noticia — primera imagen en el marco 2:3, etiqueta "Evento", título y **fecha y lugar** al pie; el clic abre el detalle con el carrusel de todas sus imágenes.
2. **Fecha:** fecha **y hora** de inicio; los eventos pasados **siguen visibles** y se marcan "Finalizado" (no se ocultan).
3. **Carrusel de imágenes del evento:** hasta **10** imágenes solo para eventos (boletín 1, resto 5); flechas, puntos, teclado y deslizar; **sin autoavance**.
4. **Editor:** selección múltiple de imágenes y **orden con botones subir/bajar**; la primera es la portada.
**Consecuencias técnicas acordadas:** migración sencilla de BD (`fecha_evento`, `lugar` en `noticias`), también en `init.sql` y en el `db-init` de Supabase; `tipo = 'evento'` en las listas únicas de tipos; endpoint para reordenar imágenes; límite de imágenes por tipo; campos de evento en la API pública (los eventos sí muestran título y texto); regla de commit al cerrar cada fase (preferencia del usuario).
**Alternativas descartadas:** evento como módulo aparte; ocultar eventos pasados; autoavance; orden solo por orden de subida.

### [2026-10-15] [tester] — PARA RESOLVER: reorden de imágenes del editor se desincroniza del servidor si dos clics rápidos fallan (menor)
**Hecho medido (tests.md, "Fase 3 noticias: eventos, carrusel de imágenes y SQL real", Chromium 156 y Firefox 157):** con `reordenarImagenesNoticia` fallando, ↓ en la imagen 1 y enseguida ↓ en la 2 (antes de que responda la primera petición) dejan la UI en `b,a,c` mientras el servidor conserva `a,b,c`: en `NewsEditorModal.jsx` `moverImagen` revierte a su propia instantánea `anterior` y el último fallo gana. Criterio incumplido: "se revierte con mensaje si falla" (la reversión deja un orden distinto del guardado). Solo ocurre con servidor fallando y clics durante una petición pendiente. Cambios posibles: deshabilitar los botones ↑/↓ mientras hay un reorden en curso, o al fallar recargar el orden real (`obtenerNoticiaAdmin`) en vez de restaurar una instantánea. No hay riesgo de pérdida de datos en el servidor.

### [2026-10-15] orquestador — Fase 3 eventos: revisión y pruebas sin críticos; decisiones del humano y correcciones
**Contexto:** revisor (APROBADO CON OBSERVACIONES, 19 hallazgos bajos, 0 críticos/altos) y tester (navegador real con componentes reales en Chromium, Firefox y móvil táctil; SQL real contra Postgres desechable: crear/validar eventos, `MAX(orden)+1`, reordenar con rollback, límites 10/1/5, API pública y migración 006 idempotente — todo PASS; 1 FAIL menor: carrera en el reorden del editor).
**Decisión (del humano):**
1. **"Finalizado":** al terminar el día del evento (23:59 hora local del navegador), no al pasar la hora de inicio. Sin hora de fin ni columna nueva.
2. **Cambio de tipo con exceso de imágenes:** el editor **bloquea con aviso** guardar un cambio a un tipo cuyo límite de imágenes se supera (p. ej. evento con más de 5 imágenes → noticia), igual que el boletín.
3. **Orden en Inicio y `/noticias`:** se deja como está (todo por fecha de publicación; los eventos próximos no se fijan al principio).
**Correcciones técnicas encargadas al coder (sin decisión de producto):** validación estricta de `fecha_evento` (rechazar booleanos/arreglos y rango absurdo), carrera de reorden en el editor (serializar y revertir al último estado confirmado), `hourCycle: 'h23'` en el formato de hora ("24:00"), contraste del badge "Finalizado", icono de evento en lugar de 📄, fallback de imagen rota en el carrusel de imágenes.
**Diferidos a la Fase 4 (bajos):** atomicidad de límite de imágenes y `MAX(orden)+1` bajo concurrencia, validación del reorden dentro de la transacción y auditoría de imágenes, tests de modelo que validan SQL por regex (cubiertos por la prueba con Postgres real del tester pero sin test automático permanente), fechas sin zona en la API, slides de Inicio no enfocables por teclado (preexistente).
**Recordatorio de commit:** la migración `006-eventos-noticias.sql` está sin rastrear; el commit de la fase debe incluirla (el `db-init` la monta).
- [2026-10-15] [tester] SEGUIMIENTO del PARA RESOLVER "reorden de imágenes del editor se desincroniza si dos clics rápidos fallan": RESUELTO. Con el servidor fallando y dos clics rápidos, los botones ↑/↓ se deshabilitan mientras hay una petición en vuelo (1 sola petición), al fallar vuelve al orden confirmado (a,b,c) con mensaje y se reactivan; tras un éxito, un fallo revierte al último orden confirmado. Verificado en Chromium 156 y Firefox 157; además "Finalizado" por día local (2 zonas, medianoche), bloqueo de cambio de tipo con exceso (editor y Postgres real), validación de fecha (71/71), contraste 7,53:1, 📅 e imágenes rotas, jest 323/323, eslint 0 errores (tests.md, "re-verificación de decisiones y correcciones").

### [2026-10-15] orquestador — Fase 3 noticias (eventos con fecha, lugar y carrusel): CERRADA y commiteada
**Resultado:** `tipo='evento'` con `fecha_evento` (TIMESTAMPTZ) y `lugar` obligatorios (migración 006 idempotente, también en `init.sql` y en el `db-init`); evento como noticia en Inicio y `/noticias` con fecha, lugar y "Finalizado" al terminar su día; detalle con carrusel de hasta 10 imágenes 2:3 (flechas, puntos, teclado, deslizar, sin autoavance); editor con selección múltiple, orden ↑/↓, portada y reorden serializado; endpoint `PUT /api/noticias/:id/imagenes/orden`; límites 10/1/5 también al cambiar de tipo (UI y backend).
**Verificación:** orquestador: build OK, jest 26/26 suites (323 tests), eslint 0 errores, compose dev válido. Revisor: APROBADO CON OBSERVACIONES, 0 críticos/altos. Tester: componentes reales en Chromium, Firefox y móvil táctil, y SQL real contra Postgres 16 desechable (71/71 en el último bloque): sin fallos.
**No verificado:** sesión real con backend HTTP, Storage real, aplicar la migración con el `db-init` en una instalación existente, GPU real, WebKit, cambio de día en vivo sin recargar.
**Puerta:** el humano revisa en su entorno y decide el GO a la Fase 4 (endurecimiento: nginx de producción, filtro de `/noticias`, bajos diferidos, revisión final y pruebas) y el OK para publicar y desplegar a staging.

### [2026-10-15] [tester] — PARA RESOLVER: el cuerpo desplazable del detalle de evento no se alcanza con el teclado (menor)
**Hecho medido (tests.md, "Fase 4 noticias: concurrencia, filtro, nginx, foco y rendimiento", Chromium 156 y Firefox 157):** con `useFocoModal`, en el detalle de un evento con texto largo el cuerpo `.rayhsa-modal__body` (4942 px de scroll vs 214 visibles) no recibe foco con Tab (la trampa envuelve en el último control, los puntos, y vuelve a "Cerrar") y PageDown/Flecha abajo/Espacio con el foco en los controles no lo desplazan; en la noticia normal sí es alcanzable porque el cuerpo queda entre "Cerrar" y los botones. Un usuario solo de teclado no puede leer el texto largo de un evento. Cambio posible: `tabIndex={0}` (y `aria-label`) en el cuerpo del detalle de evento, o incluir los desplazables en la lista de la trampa.

### [2026-10-15] [tester] — PARA RESOLVER (opcional): `limite` sin tope en el listado público de noticias (menor)
**Hecho medido (tests.md, mismo apartado, Postgres real):** `GET /api/noticias/publicadas?limite=10000` responde 200 con todas las filas (41 ítems, `limite:10000` devuelto) sin autenticación; `pagina` enorme (99999999999) devuelve 0 ítems sin error. Cada fila incluye el JSON de imágenes, por lo que un `limite` grande en un endpoint público es costoso. Cambio posible: acotar `limite` (p. ej. máximo 50-100) con 400 o saneando al máximo.
- [2026-10-15] [tester] Resumen Fase 4: 0 fallos funcionales; concurrencia, reorden, filtro, ids, auditoría, propiedad de imagen, fechas y nginx (50 MiB en las 3 configuraciones; antes 413 desde 6 MiB) verificados en Postgres y nginx reales; foco y fugas OK; blur: 59-60 FPS y 0 tareas largas con 50 tarjetas (headless, raster por software); jest 373/373, eslint 0 errores.
- [2026-10-15] [tester] SEGUIMIENTO de mis dos PARA RESOLVER de la Fase 4: RESUELTOS ambos. (1) cuerpo desplazable del detalle de evento: `tabindex=0`, `role="region"`, `aria-label="Descripción del evento"`, alcanzable con Tab, foco visible, se desplaza con flechas/AvPág/Espacio/Fin, trampa de Tab cíclica y restauración de foco correctas (Chromium 156 y Firefox 157); (2) `limite` sin tope: 100 OK, 101 y 10000 -> 400 "limite no puede superar 100", `pagina` fuera de rango -> 400 (no 500), contra Postgres real. Además confirmados: orden estable `fecha DESC, id DESC` con fechas repetidas (público, con `?tipo=` y panel), auditoría del POST desde el controlador (id, tipo y publicada; ninguna en 400/fallo; middleware retirado), `fecha_evento` con espacios, jest 387/387, eslint 0 errores (tests.md, "confirmación de las correcciones finales").

### [2026-10-15] orquestador — Fase 4 noticias (endurecimiento): CERRADA y commiteada; plan completo
**Resultado:** nginx `/api/` a 50 MB en los tres archivos; filtro `?tipo=` en SQL antes de paginar con orden estable (`fecha_publicacion DESC, id DESC`) y topes (`limite` ≤ 100, `pagina` dentro de INT4); ids validados con `router.param`; errores públicos genéricos; boletín público con imágenes mínimas (id, url, orden); auditoría desde el controlador en crear/editar/eliminar/imágenes/reordenar (sin contenido ni archivos); subida de imagen y reorden en transacción con `FOR UPDATE`; `fecha_evento` exige zona horaria; eliminar imagen comprueba propiedad; foco del modal con `useFocoModal`; cuerpo del detalle de evento enfocable; código muerto retirado; docs/supabase.md documenta el re-ejecutar el db-init.
**Verificación:** orquestador: build OK, jest 26/26 suites (387 tests), eslint 0 errores. Revisor: APROBADO CON OBSERVACIONES (2 medios corregidos, bajos como deuda). Tester: Postgres 16 real (concurrencia: boletín 1/5, evento 10/15, noticia 5/8; paginación estable; reorden transaccional), nginx real (0,5-50 MiB pasan, 51 MiB da 413; antes 413 desde 6 MiB), componentes reales en Chromium/Firefox/móvil táctil, rendimiento del fondo desenfocado aceptable (59,9 FPS con 50 tarjetas, 0 tareas largas; headless sin GPU).
**Deuda aceptada / pendiente de decisión del humano:** ver "Fuera / deuda aceptada" en roadmap.md (eslint-plugin-react, slides de Inicio por teclado, etc.).
**Plan completo (Fases 0-4).** Siguiente: OK del humano para push, PR, merge y despliegue a staging (la migración 006 se aplica sola con el db-init).

### [2026-10-15] [tester] — PARA RESOLVER: con el foco en un slide de Inicio, ←/→ no mueve el foco al nuevo slide activo (menor)
**Hecho medido (tests.md, "Slides de Inicio accesibles por teclado (y regresión)", Chromium 156 y Firefox 157):** con el foco en el slide 1 y pulsar → el carrusel muestra el slide 2, pero el foco se queda en el slide 1 (que pasa a `tabindex=-1` y queda fuera de vista); Enter abre entonces el detalle del slide NO visible ("Noticia A") en vez del que se ve ("Comunicado B"). Para un usuario de teclado/lector de pantalla se abre algo distinto de lo que se ve. Cambio posible: al cambiar `activo` por teclado, si el foco estaba en un slide, mover el foco al nuevo slide activo (`focus({preventScroll:true})`).

### [2026-10-15] [tester] — PARA RESOLVER (menor): axe-core marca nombre accesible y contraste en el detalle y en el slide de evento
**Hecho medido (mismo apartado, axe-core 4.14):** (1) el `role="dialog"` de los modales de detalle de noticia, comunicado y evento no tiene nombre accesible (`aria-dialog-name`, serious; el visor de boletín sí lo tiene): añadir `aria-labelledby` al título; (2) el slide de evento tiene un `aria-label` ("Evento: título, i de n") que no contiene el texto visible de fecha y lugar (`label-content-name-mismatch`, serious): incluirlos en el label; (3) `color-contrast` serious en `.rayhsa-modal__meta > span` (4 nodos en noticia/comunicado, 1 en evento; revisar el gris del meta sobre blanco) y 1 nodo no concluyente en el slide de evento (texto sobre imagen); (4) `scrollable-region-focusable` en el cuerpo del detalle de noticia y en la pista del carrusel de imágenes del evento; (5) `aria-allowed-role` minor: `article` con `role="button"` (usar `div` o `section` con ese rol, o `<button>`). Salida en `app2/out_slides_chromium.json` del scratch.
- [2026-10-15] [tester] SEGUIMIENTO de mis PARA RESOLVER de los slides de Inicio: (1) "con el foco en un slide, ←/→ no mueve el foco": RESUELTO (foco acompaña al activo en ←/→, flechas, barras y deslizar; no se mueve si estaba en controles fuera de la pista; Enter/Espacio abren el visible una vez; sin saltos; Chromium 156 y Firefox 157); (2) "axe-core marca nombre accesible y contraste": RESUELTO en lo corregido (rol del slide, `aria-labelledby` de los diálogos, contraste del meta, desplazables enfocables, label del evento con fecha y lugar) y REDUCIDO a lo siguiente, que sigue ABIERTO (menor): `label-content-name-mismatch` del slide visible (el resumen/"Leer artículo" no están en el `aria-label`), contraste de los badges del carrusel (`.badge-comunicado` 2,86:1, `.badge-noticia` 3,00:1, paleta preexistente) y de `.rayhsa-modal__acciones-meta` (#718096 sobre #f8f9fb, 12,5 px) en los modales de noticia y comunicado (tests.md, "Confirmación del foco con ←/→ y de los hallazgos de axe").

### [2026-10-15] orquestador — Decisiones del humano tras el cierre: eslint-plugin-react y carrusel de Inicio con teclado
**Decisión (del humano):** (1) instalar `eslint-plugin-react` como devDependency; (2) las diapositivas del carrusel de Inicio deben poder enfocarse y activarse con teclado; (3) realizar la publicación completa (push, PR, merge y despliegue a staging).
**Resultado:** (1) `eslint-plugin-react@^7.37.5`, solo `react/jsx-uses-vars` en el override del frontend; `npm ci --dry-run` OK; avisos de ESLint 178 → 19 (0 errores). (2) Cada slide es un único `div role="button"` con aria-label "Tipo: título[, fecha, lugar], i de n"; solo el activo está en el orden de Tab; ←/→, flechas, barras y deslizar llevan el foco al nuevo slide activo; Enter/Espacio abren el detalle una vez; se corrigieron los hallazgos de axe de diálogos, regiones desplazables y contraste del meta.
**Verificación:** jest 26/26 suites (387 tests), build OK, tester en Chromium y Firefox PASS (19/19 en regresión). Incidente del tester: instaló `axe-core` en la raíz del repo por un `cd` fallido y lo desinstaló; verificado que `package.json` solo suma `eslint-plugin-react`, el lockfile sin `axe-core` y `npm ci` OK.
**Deuda aceptada:** 3 hallazgos menores de axe por la paleta previa (ver roadmap.md).

### [2026-10-15] orquestador — Despliegue a staging del plan de noticias (PR #9, commit d278a9a)
**Contexto:** publicación completa pedida por el humano tras cerrar las Fases 0-4: PR #9 (imagen 2:3, boletín, eventos con carrusel, endurecimiento, teclado y `eslint-plugin-react`) mergeado a `main` en `d278a9a`.
**Qué se hizo, en orden:** (1) escaneo del diff antes de publicar (sin secretos, sin correos/IPs/dominios nuevos; las rutas locales ya existían en `main`); (2) push de la rama, PR, CI (`test`) en verde y merge; (3) esperar el build de imágenes del CI en `main` (el `build` solo corre en `main`); (4) en staging: respaldo previo de `noticias` y `noticia_imagenes` (2 y 2 filas) con `pg_dump --data-only` en el directorio de respaldos del servidor; (5) `git checkout` del SHA del merge en el clon de staging (estaba limpio), `IMAGE_TAG` al SHA completo, `docker compose pull backend frontend` y `up -d`, que recreó `supabase-db-init` y aplicó la migración `006-eventos-noticias.sql`.
**Verificado después:** columnas `fecha_evento` (timestamptz) y `lugar` (varchar) creadas; 2 noticias y 2 imágenes intactas; backend y frontend con el tag `d278a9a`; desde el backend, sin token: listado público 200, `?tipo=evento` 200, `limite=101` y tipo inválido 400, `/admin` sin id 400, `/admin/1` sin token 401; el sitio y `/api/noticias/publicadas` responden 200 por el dominio público; el nginx del frontend de staging tiene `client_max_body_size 50m`.
**No verificado:** subida real de una imagen a Storage, sesión real de principio a fin, crear un evento/boletín desde la interfaz de staging, GPU real y WebKit. Lo prueba el humano.
**Trampas de esta ronda:** (a) las consultas SQL con comillas dentro de `ssh '...'` y `set -e` se rompen y cortan el script: usar un archivo `.sql` copiado con `scp`; (b) el `db-init` solo corre al levantar: en entornos ya arriba (dev o staging) hay que re-ejecutar `supabase-db-init` (documentado en `docs/supabase.md`); (c) un PR con `eslint-plugin-react` cambia el lockfile con ~95 paquetes: comprobar que no se quitan paquetes y que `npm ci --dry-run` pasa.
**Pendiente:** migrar producción (la migración 006 se aplicará con el `db-init`; seguir el checklist de `docs/notificaciones.md`), prueba manual en staging y la deuda menor listada en roadmap.md.

### [2026-10-15] orquestador — Calendario laboral y bloqueo de vacaciones por departamento: decisiones del humano
**Contexto:** tarea "calendario laboral" (fechas oficiales/otorgadas/eventos) para que una solicitud no tome fechas ya concedidas a un compañero del mismo departamento. No hay plan previo en PLAN.md: las fases son propuesta del orquestador y cada una exige GO del humano.
**Decisiones (del humano):**
1. "Concedida" = solo solicitudes con estatus `aprobado` (las pendientes no bloquean).
2. Bloqueo por `departamento_id` con **cupo configurable** (máx. de personas del departamento de vacaciones a la vez).
3. Tipos de fecha del calendario: **oficial de ley** (no se descuenta del saldo), **descanso otorgado** (no se descuenta del saldo), **evento** (informativo, no bloquea; incluye actividades laborales como inventario físico, fin de año, Navidad, Independencia). Todas aplican a **toda la empresa** (sin alcance por departamento/ubicación).
4. Los días de vacaciones pasan a **días hábiles**: semana laboral lunes a viernes, excluyendo oficiales y otorgadas.
5. Solicitudes existentes: **se mantienen como están** (sin recalcular histórico); la validación de traslape y el nuevo cálculo aplican hacia adelante.
6. Administran el calendario **solo RH y Administradores**.
7. Rama de trabajo: `feat/calendariolaboral-vacaciones`.
**Pendiente de precisar (investigador/coder lo proponen, humano confirma):** dónde vive el cupo (por departamento vs. global con override), si un evento puede coincidir con vacaciones sin avisar, y cómo se trata una solicitud que cruza un día de evento.

### [2026-10-15] orquestador — Respuestas a las preguntas abiertas de la Fase 1 (el humano delegó en las recomendaciones del orquestador) y GO a la Fase 2
**Decisión (del humano):** "avanza con tus recomendaciones y Go fase 2".
**Recomendaciones adoptadas:**
1. Cupo = columna `departamentos.cupo_vacaciones INT NOT NULL DEFAULT 1 CHECK (>= 1)` (máx. de personas del departamento de vacaciones a la vez). Valor inicial 1 en todos. Opción `Departamentos` se siembra para `rh_admin` para poder editarlo.
2. Al **aprobar** se revalida cupo y saldo dentro de transacción con bloqueo y guardia `WHERE estatus='pendiente'`; si ya no cabe, se rechaza la aprobación con mensaje claro y RH decide (no se rechaza sola la solicitud). Misma validación de cupo al crear.
3. Las aprobadas anteriores sí cuentan para el cupo (son `aprobado`), sin recalcular sus días.
4. Días hábiles: lun-vie, sin oficiales ni otorgadas; se puede iniciar/terminar en día no hábil (solo cuentan los hábiles); solicitud con 0 días hábiles se rechaza; el periodo sigue siendo el año de `fecha_inicial`. Fechas se comparan como texto `YYYY-MM-DD` (nada de `new Date(texto).getFullYear()`).
5. Se guarda `departamento_id` en la solicitud al crearla (el del empleado en ese momento); filas existentes se rellenan por JOIN a `empleados`.
6. Se mantiene la regla de no traslape del mismo empleado (pendientes + aprobadas).
7. Todos los empleados **leen** el calendario; los eventos avisan en la pantalla de solicitud sin bloquear. Solo RH/Administradores lo **editan**.
8. "Administradores" = `rh_admin`, `super_admin` y `portal_admin` (este último solo con la opción `Calendario`, sin otros permisos de RH).
9. Se auditan altas/cambios/bajas del calendario y los rechazos por cupo.
10. Se siembran los festivos oficiales de ley de México 2026 y 2027 (editables por RH).
**Fase 2 (alcance):** migración (calendario_laboral, cupo, departamento_id), permisos, CRUD API con auditoría, semilla y tests. NO incluye días hábiles ni bloqueo (Fase 4) ni pantalla (Fase 3).

### [2026-10-15] [tester] — PARA RESOLVER (menor, opcional, preexistente): JSON malformado devuelve 500 en lugar de 400 en todo el backend del portal
Con el calendario laboral (Fase 2) no hay fallos. Al probar `POST /api/calendario-laboral` con cuerpo `{no es json` el backend responde 500 "Error interno del servidor" y registra `Error no controlado: SyntaxError`. Causa: el manejador global de errores de `modules/portal/backend/app.js` (`app.use((error, req, res, next)`) convierte todo en 500 e ignora `error.status`/`error.type === 'entity.parse.failed'` de `express.json()`. Afecta a todas las rutas, no es del calendario ni lo introdujo esta fase. No filtra detalle al cliente. Decisión pedida al orquestador: dejarlo (deuda) o responder 400 `{exito:false,mensaje:"JSON inválido"}` para `entity.parse.failed`. Detalle y evidencia: tests.md, "API /api/calendario-laboral contra Postgres real". Observación aparte (no es fallo): las solicitudes sin departamento del empleado quedan con `departamento_id` NULL tras el backfill; la Fase 4 debe decidir cómo tratarlas.

### [2026-10-15] orquestador — Fase 2 (calendario laboral: BD, API, permisos, auditoría, semilla) lista para GO/NO-GO
**Quién escribió qué:** coder (migración 009, API `/api/calendario-laboral`, tests, y correcciones F2/F3/F4-parcial/F5/F7) → code-notes.md; revisor (APROBADO CON OBSERVACIONES, 0 críticos) → reviews.md; tester (Postgres 16 y supabase/postgres 17.6, `supabase-db-init` real, API real con 4 zonas horarias) → tests.md.
**Resultado:** tabla `calendario_laboral` (oficial/otorgado/evento, UNIQUE fecha+tipo), `departamentos.cupo_vacaciones` (default 1, CHECK >= 1, editable por la API de departamentos), `solicitudes_vacaciones.departamento_id` con backfill solo de NULL, permiso `Calendario` (lectura para todos; escritura rh_admin, super_admin, portal_admin), `Departamentos` sembrado para rh_admin, 14 festivos MX 2026-2027 sembrados solo si la tabla está vacía, auditoría de alta/edición/baja. Desviación: `rol_opcion_permisos.tipo` solo admite `consulta`/`edicion`, así que alta/cambio/baja usan `edicion`.
**Verificación del orquestador:** jest 29/29 suites (465 tests), eslint 0 errores.
**PARA RESOLVER (humano):** (1) F1 preexistente, alto: `portal_admin` tiene `Roles:edicion` y puede otorgarse permisos de RH (contradice la decisión 8); (2) JSON malformado → 500 en el manejador global (preexistente, menor).
**Pendiente para la Fase 4:** escribir `departamento_id` al crear la solicitud y decidir qué hacer con solicitudes de empleados sin departamento (NULL); revalidación al aprobar; auditoría de rechazos por cupo; concurrencia de dos POST del mismo (fecha, tipo) sin probar. Sin verificar: tokens reales de GoTrue/Microsoft, datos reales de dev/staging/prod, frontend de departamentos.
**Despliegue:** en entornos ya levantados hay que re-ejecutar `supabase-db-init` (docs/supabase.md:55).

### [2026-10-15] orquestador — GO del humano a la Fase 3 (pantalla del calendario laboral)
**Decisión (del humano):** "go fase 3". Las dos dudas abiertas de la Fase 2 (F1 `portal_admin`/Roles y JSON malformado → 500) no recibieron respuesta: **quedan como deuda aceptada por defecto, sin tocar**, y se vuelven a preguntar al cierre de la tarea.
**Alcance Fase 3:** página `/rh/calendario` (vista mensual con navegación por mes/año, leyenda por tipo, lista del mes), alta/edición/baja solo con permiso de edición (RH/Administradores), lectura para todos; campo de cupo en la pantalla de Departamentos. NO incluye días hábiles ni bloqueo de solicitudes (Fase 4).

### [2026-10-15] [tester] — PARA RESOLVER (menores): Fase 3 del calendario, responsive y accesibilidad; 0 fallos funcionales
La pantalla `/rh/calendario` y el cupo de Departamentos pasan las pruebas integradas (Postgres real + backend real + Chromium y Firefox; fechas sin desfase en 8 combinaciones de zona horaria; 403 para el empleado). Quedan 5 hallazgos menores (detalle y evidencia en tests.md, "Calendario laboral Fase 3: pantalla /rh/calendario ... INTEGRADO"):
1. **F1** Lista del mes a 721–799 px de ventana: columnas fijas `15rem 11rem 1fr` + `@media (max-width:720px)` por ventana; 3.ª columna de 104 px y desborde de 28 px (`calendario.css:175` y `:216`). Corrección sugerida: subir el breakpoint a ~900 px o usar `minmax(0,1fr)`/columnas flexibles.
2. **F2** Nombres/URLs sin espacios desbordan la página a 320/360 px (URL de 86 caracteres = 489 px; 1000 caracteres seguidos = 10 022 px). Sugerido: `overflow-wrap:anywhere` en el texto de la lista.
3. **F3** `/rh/departamentos` desborda a 768 px por la nueva columna (867 > 768; sin ella cabe). Sugerido: acortar el encabezado o permitir desplazamiento horizontal en la tabla. A 320/360 el desborde de CrudPage es preexistente.
4. **F4** Contraste de los números de días de otros meses: 4,02:1 y 3,48:1 (mínimo 4,5:1) por `--color-texto-claro` #718096.
5. **F5** `aria-label` de los días con marcas no contiene el texto visible (WCAG 2.5.3, axe `label-content-name-mismatch`).
Decisión pedida: (a) si F1–F5 se corrigen en esta fase o quedan como deuda (todos menores); (b) si la API debe dejar de devolver `activo=false` a los empleados o basta con que la pantalla los oculte (hoy solo la UI). Preexistentes anotados sin pedir acción: `rh_admin` sin la opción `Puestos` (403 en `/api/puestos`), sidebar con "Dashboard" y la sub-ruta activas a la vez, y breadcrumb "Dashboard" en `/rh/departamentos`.

### [2026-10-15] orquestador — Fase 3 (pantalla del calendario laboral) lista para GO/NO-GO
**Quién escribió qué:** coder (página `/rh/calendario`, modal, servicio, util puro, cupo en Departamentos, y correcciones) → code-notes.md; revisor (APROBADO CON OBSERVACIONES, 0 críticos/altos) → reviews.md; tester (Postgres 16 + backend real + Chromium y Firefox, 4 zonas horarias) → tests.md.
**Resultado:** vista mensual lun-dom con navegación por teclado, marcas por tipo (color+ícono+texto), lista del mes, alta/edición/baja solo con permiso de edición (el backend es la autoridad: 403 comprobado), campo de cupo en Departamentos. Correcciones aplicadas: super_admin vía `usuario.roles`, contraste >= 4,5:1 (7,53 y 6,52), desbordes responsive (container query, `overflow-wrap`, tabla de `CrudPage` con scroll interno), `aria-label` con el texto visible, avisos de error, "Agregar otra en esta fecha", foco tras eliminar.
**Decisión del orquestador (recomendación adoptada):** `GET /api/calendario-laboral` oculta las fechas `activo=false` a quien no tenga edición sobre rh/Calendario; editores y super_admin las ven.
**Verificación del orquestador:** jest 30/30 suites (503 tests), eslint 0 errores.
**Deuda aceptada / sin verificar:** concurrencia de edición (last-write-wins); sin tests de componente (no hay jsdom/testing-library; el JSX y el modal solo los cubre el harness de Chromium); filtro de inactivos probado solo con mocks; Safari < 16 no apila la lista; Áreas/Ubicaciones no re-probadas en navegador tras el wrapper de `CrudPage`; GoTrue/Microsoft reales, WebKit y lector de pantalla; `rh_admin` da 403 en `/api/puestos` (opción nunca sembrada, preexistente); `rol_nombre` en `MenuDinamico.jsx:146` (preexistente).
**Sigue abierto desde la Fase 2:** F1 (`portal_admin` con `Roles:edicion`) y JSON malformado → 500.

### [2026-10-15] orquestador — GO del humano a la Fase 4 y diseño (días hábiles + cupo por departamento)
**Decisión (del humano):** "Go fase 4". F1 de la Fase 2 (portal_admin/Roles) y JSON malformado siguen como deuda sin tocar.
**Diseño del orquestador (recomendaciones, apoyadas en research.md y las decisiones del 2026-10-15):**
1. **Fuente única del cálculo en el servidor:** función pura de días hábiles (lun-vie, menos oficiales y otorgadas activas de `calendario_laboral`; eventos no cuentan), con fechas como texto `YYYY-MM-DD`. El frontend consulta un endpoint de vista previa; no duplica la regla.
2. **Crear y aprobar en transacción:** se bloquea la fila del departamento (`FOR UPDATE`) para serializar por departamento; al aprobar además `SELECT … FOR UPDATE` de la solicitud con guardia `estatus='pendiente'` (409 si ya no lo está). Se revalida traslape propio, saldo (con días hábiles) y cupo.
3. **Cupo:** por cada día hábil de la solicitud, las aprobadas del mismo `departamento_id` que lo cubren deben ser < `cupo_vacaciones`. Si no cabe: crear → 409 con la primera fecha llena (sin nombres de compañeros, por privacidad); aprobar → 409 y la solicitud sigue pendiente para que RH decida. Se audita cada rechazo por cupo.
4. **`departamento_id`** se guarda al crear la solicitud (el del empleado en ese momento). Solicitudes/empleados con departamento NULL: **no aplican cupo** (recomendación; no hay con quién compararlas); las pendientes viejas con NULL usan el departamento actual del empleado al aprobar.
5. **0 días hábiles** → 400. Fines de semana/oficiales en el borde permitidos. Periodo = año de `fecha_inicial` leído del texto (sin `new Date(texto)`). Solicitudes aprobadas anteriores no se recalculan pero sí cuentan para el cupo.
6. **Selector de fechas:** el formulario muestra un calendario de ocupación del departamento del solicitante (días con cupo lleno, no hábiles y eventos como aviso) y valida con la vista previa antes de enviar.
**Orden:** coder backend → coder frontend → revisor + tester (concurrencia real con Postgres) → correcciones → cierre.

### [2026-10-15] [tester] — PARA RESOLVER P1 (ALTO): >= 11 solicitudes de vacaciones simultáneas congelan toda la API del portal (agotamiento del pool dentro de la transacción)
Reproducido con Postgres real (pg16 y supabase/postgres 17.6) y el backend real: 11, 12, 14, 20 y 30 creaciones simultáneas (mismo departamento o mezclados) y 12-16 aprobaciones simultáneas NO responden nunca y el siguiente `GET` de cualquier ruta con BD también se cuelga hasta reiniciar el proceso (10 en el pool: 9 esperando el `FOR UPDATE` del departamento + 1 `idle in transaction`); con 10 o menos o con concurrencia 5 sostenida todo bien. Causa: dentro de la transacción se pide otra conexión al mismo pool: `solicitudVacaciones.model.js:110-111` (`calcularSaldo` -> `Empleado.obtenerPorId` por `grupo`) y `vacaciones.controller.js:93` (`revalidarAprobacion`); pool `max` 10 sin `connectionTimeoutMillis` (`modules/portal/backend/config/database.js:3`). Control: con `max`=50 las mismas ráfagas pasan. Es un riesgo de disponibilidad de todo el portal (mismo pool). Decisión/corrección pedida (código, la hace el coder): pasar el `cliente` a la consulta del empleado o leerlo antes de la transacción, poner `connectionTimeoutMillis` e `idle_in_transaction_session_timeout`, y una prueba con N >= 12. Detalle y evidencia: tests.md, "Fase 4 B: FAIL ALTO". Recomiendo NO desplegar la Fase 4 hasta corregirlo.

### [2026-10-15] [tester] — PARA RESOLVER P2 (medio): el servidor acepta `periodo` del cuerpo; contradice "periodo = año de fecha_inicial" y permite saldo mayor
`POST /api/vacaciones` usa `parseInt(body.periodo) || año(fecha_inicial)` (`vacaciones.controller.js:223`). Comprobado: `periodo:2045` con fechas de 2026 -> 201 con `dias_periodo` 28 (en vez de 22) y 24 hábiles aceptados (más que el saldo de 2026); cada `periodo` ficticio da un saldo nuevo. También ocurre sin mala fe: la pantalla manda siempre el selector de periodo (por defecto el año actual), así que fechas de enero de 2027 pedidas con el selector en 2026 quedan con periodo 2026. Es preexistente, pero la decisión 4 de la Fase 4 dice que el periodo es el año de `fecha_inicial`. Decidir: ignorar `periodo` del cuerpo (derivarlo siempre de la fecha) o validarlo contra la fecha (400). Evidencia: `tperiodo.cjs`.

### [2026-10-15] [tester] — PARA RESOLVER P3 (menor): sin departamento no hay serialización (doble envío y saldo)
Empleados con `departamento_id` NULL: 5 envíos simultáneos del mismo empleado crearon solicitudes solapadas en 30/30 rondas, y dos pendientes (15+15 hábiles, saldo 22) aprobadas a la vez se aprueban ambas (30 > 22) en 6/6 rondas; con departamento 0/30 y 0/6. La trampa 5 del coder cubre solo la creación. Opciones: bloquear la fila del empleado (`SELECT … FOR UPDATE` de `empleados`) en crear y aprobar, además o en vez del departamento; o aceptarlo como límite documentado (la UI deshabilita el botón al enviar). Observación relacionada: una aprobada antigua con `departamento_id` NULL de un empleado que hoy tiene departamento no cuenta para el cupo.

### [2026-10-15] [tester] — PARA RESOLVER P4 (menores de UI, Fase 4)
(1) axe `heading-order` (moderate): `<h3>` "Calendario de tu departamento" sin `h2` previo (`CalendarioOcupacion.jsx`); usar h2 o el nivel correcto. (2) Cosmético: a <= 360 px "Dom" se parte en dos líneas y la cabecera de la rejilla mide 58 px (`.calendario__encabezado`, compartido con `/rh/calendario`). Lo demás de axe (contraste del shell y `--color-texto-claro`, `select` de "Periodo" y de los filtros del listado sin nombre) es preexistente.

### [2026-10-15] orquestador — Fase 4 (días hábiles + cupo por departamento + calendario de ocupación) lista para GO/NO-GO
**Quién escribió qué:** coder backend y frontend + 1 ronda de correcciones → code-notes.md; revisor (NO APROBADO → crítico y alto corregidos → re-revisión APROBADO CON OBSERVACIONES, 0 críticos/altos) → reviews.md; tester (Postgres 16 y supabase/postgres 17.6, backend real, Chromium y Firefox) → tests.md.
**Resultado:** días hábiles calculados solo en el servidor (lun-vie, sin oficiales/otorgadas; eventos informativos); crear y aprobar en transacción con candado por empleado → solicitud → departamento (`pg_advisory_xact_lock(4217, empleado)` + `FOR UPDATE`), guardia `estatus='pendiente'`, revalidación de traslape, saldo y cupo al aprobar (409 y la solicitud queda pendiente); `departamento_id` guardado al crear; sin departamento no aplica cupo; periodo SIEMPRE del año de `fecha_inicial` (el `periodo` del body se ignora); rechazos por cupo auditados (`RECHAZO_CUPO`, sin nombres); endpoints `/api/vacaciones/disponibilidad` y `/ocupacion` sin datos de compañeros; formulario con días hábiles del servidor, aviso de no hábiles/eventos, conflicto que bloquea "Enviar" y calendario de ocupación; listado con aviso en 409.
**Hallazgos graves y su cierre:** (a) el periodo lo fijaba el cliente → corregido; (b) transacciones pedían una 2.ª conexión al pool: ≥11 solicitudes simultáneas congelaban toda la API → corregido (todo con el cliente de la transacción; probado con 11-30 simultáneas) con test que falla si se reintroduce; (c) sin departamento no había serialización → candado por empleado (0/30 solapadas, 0/6 sobregiros, 0 deadlocks en 400 operaciones cruzadas).
**Verificación del orquestador:** jest 34/34 suites (633 tests), eslint 0 errores.
**Cambios de contrato (documentados en code-notes):** 400→409 por traslape/cupo/estado; 0 hábiles = 400; `periodo` del body sin efecto; `empleado_id` inválido = 400; 500 genérico sin `error.message`.
**PARA RESOLVER (humano):** (1) RH puede aprobar/rechazar lo propio (`vacaciones.routes.js:65-76`, preexistente, medio); (2) `portal/backend/config/database.js` sin `max`/`connectionTimeoutMillis`/`idle_in_transaction_session_timeout` (compartido por todos los módulos; medio); (3) F1 de la Fase 2 (`portal_admin` con `Roles:edicion`) y JSON malformado → 500; (4) `GET /vacaciones/saldo` aún acepta `periodo` por query (solo lectura, bajo).
**Deuda baja aceptada:** `cargarSaldo` sin guarda de vigencia en el selector, `empleado_id` fuera de int4 da 500 en 3 endpoints de lectura, release sin error si falla ROLLBACK, test del pool no cubre responder, fechas un día antes en servidores con TZ positiva (preexistente), Firefox/WebKit/GoTrue real/Safari<16 sin verificar.
**Despliegue:** requiere re-ejecutar `supabase-db-init` (migración 009) y probar con sesión real; recomendado revisar primero los timeouts del pool (punto 2).

### [2026-10-15] orquestador — Decisiones del humano tras la Fase 4 (se tratan como extensión de la Fase 4, no como avance de fase)
1. **RH/cualquiera no aprueba lo propio; solo puede autorizar el jefe inmediato** del empleado (`empleados.jefe_inmediato_id`). Casos límite (empleado sin jefe, super_admin/rh_admin, quién ve el listado) pendientes de confirmar con el humano antes de implementar.
2. **Timeouts del pool** (`portal/backend/config/database.js`): "Adelante" → se implementa como tarea acotada.
3. **Corregir el JSON malformado (→ 400) y los roles** (F1 de la Fase 2: `portal_admin` con `Roles:edicion` no debe poder otorgarse permisos de RH). Diseño del orquestador: quien edita roles solo puede otorgar/quitar permisos que él mismo posee; `super_admin` sin restricción.
4. **`GET /vacaciones/saldo` con `periodo` por query:** "Cierralo" → se cierra el hallazgo: el parámetro se valida (entero en rango razonable) y queda documentado como consulta de solo lectura del propio saldo; el POST nunca lo toma.

### [2026-10-15] orquestador — GO del humano a la Fase 5 (revisión, pruebas y cierre)
**Decisión (del humano):** "Go Fase 5". La Fase 4 queda CERRADA (commit fa87d41). La revisión final espera a que termine la extensión en curso (timeouts del pool, JSON malformado, roles, saldo) y a que el humano confirme los casos límite de "solo el jefe inmediato autoriza", para revisar y probar el código final una sola vez.

### [2026-10-15] orquestador — Extensión de la Fase 4 aplicada: pool, JSON malformado, roles y saldo
**Quién:** coder → code-notes.md. **Resultado:** (A) timeouts del pool configurables por entorno (`PG_POOL_MAX` 10, `PG_POOL_IDLE_TIMEOUT_MS` 30000, `PG_POOL_CONNECTION_TIMEOUT_MS` 5000, `PG_IDLE_IN_TRANSACTION_TIMEOUT_MS` 30000; sin `statement_timeout`), pool agotado responde 500 genérico en ~0,8 s en vez de colgarse, y listener de error por cliente/pool (Node se caía por excepción no capturada al matar Postgres una sesión por timeout); (B) JSON inválido → 400, cuerpo grande → 413 (manejador movido a `middleware/errores.middleware.js`); (C) delegación de permisos: quien no es `super_admin` solo otorga/quita permisos que posee, todo en transacción (403 sin cambios parciales), no toca ni asigna `super_admin`/`rh_admin`/`tickets_admin`; portal_admin solo puede otorgar `rh/Calendario` de RH (probado con Postgres real); (D) `GET /vacaciones/saldo?periodo=` validado (año-10..año+2, si no 400) y `empleado_id` fuera de int4 → 400 en saldo/disponibilidad/ocupacion.
**Cambios de comportamiento a vigilar (algunos no pedidos):** `PUT /usuarios/:id` sin `rol_id` ya no borra el rol (`null`/`""` sí); reset de contraseña y `PUT` con contraseña sobre usuarios con rol privilegiado dan 403 para no-super; `PUT /roles/:id/permisos` (tabla heredada) solo `super_admin`; fecha inicial posterior a año+2 en el formulario bloquea el envío (saldo 400).
**Verificación del orquestador:** jest 38/38 suites (716 tests), eslint 0 errores. Commit en la rama.
**Pendiente:** alta de empleado con `rol_id` sin regla de delegación; portal_admin puede resetear contraseña de roles con más permisos que él pero sin nombre privilegiado (p. ej. `bi_admin`); no se re-corrió la concurrencia de vacaciones con los timeouts nuevos (la Fase 5 lo cubre); pantalla de usuarios/permisos y mensaje del 403 sin probar en UI.

### [2026-10-15] orquestador — Regla de quién autoriza vacaciones (confirmada por el humano)
**Decisión (del humano):** (1) RH (`rh_admin`) y `super_admin` pueden autorizar solicitudes **de otros, nunca la propia**; (2) si el empleado no tiene jefe inmediato, autorizan `rh_admin`/`super_admin`; (3) la solicitud de un jefe la autoriza su propio jefe inmediato (el jefe de su jefe) o, en su defecto, `rh_admin`/`super_admin`; (4) el listado se mantiene (RH ve todo, cada jefe ve su equipo).
**Regla uniforme:** pueden aprobar/rechazar una solicitud: el `jefe_inmediato_id` del solicitante, `rh_admin` y `super_admin`; **nadie** aprueba ni rechaza la solicitud donde él mismo es el solicitante. Se aplica en la ruta y, como autoridad, dentro de la transacción de `responder`.

### [2026-10-15] orquestador — Decisiones del humano tras la revisión final (Fase 5): delegación de roles y jefe vigente
**Contexto:** el revisor RECHAZÓ la rama (reviews.md, "Revisión final de la rama (Fase 5)") por 1 crítico y 2 altos en la delegación de roles; esperan al tester antes de tocar código.
**Decisiones (del humano):**
1. **Asignar roles:** `portal_admin` (cualquier no-super) puede asignar **roles no privilegiados** aunque tengan más permisos que él; los roles privilegiados (`super_admin`, `rh_admin`, `tickets_admin`) quedan reservados a `super_admin`. La delegación por posesión sigue aplicando al otorgar/quitar **permisos sueltos** de un rol.
2. **Borrar roles:** solo `super_admin`.
3. **Jefe que autoriza vacaciones:** el **jefe vigente** del empleado (`empleados.jefe_inmediato_id` actual) al momento de aprobar/rechazar, no el guardado al crear. Las pendientes se reasignan solas al cambiar el jefe; el listado debe usar el mismo criterio.
**Correcciones aprobadas por el orquestador (consecuencia de la decisión de roles del 2026-10-15):** (a) el alta de empleado con `rol_id`/`roles[]` aplica la misma regla de asignación; (b) quien no es `super_admin` no puede desactivar, borrar ni editar usuarios con rol privilegiado; (c) el reset de contraseña/cambio de contraseña de un usuario con más permisos que el actor, o con rol privilegiado, solo lo hace `super_admin` (evita la toma de cuenta); (d) `PortalAdminRoles.jsx` deja de llamar a la ruta heredada solo-super; (e) `init.sql` incluye el `UNIQUE(usuario_id)` de `empleados`.

### [2026-10-15] [tester] — PARA RESOLVER F-A (CRÍTICO): `rh_admin` crea un `super_admin` con el alta de empleado
`POST /api/empleados {crear_usuario:true, correo, rol_id:<super_admin>}` por `rh_admin` → 201 y el usuario queda con `super_admin` (también con `roles:[super_admin,…]` y con `rol_id` rh_admin). El usuario nuevo edita permisos de roles (200) y resetea la contraseña del super_admin original (200); el control, rh_admin directo en `/permisos`, da 403. Causa: `empleado.controller.js:135-150`, INSERT en `usuario_rol` sin `exigirRolAsignable`. Coincide con el crítico del revisor y con la corrección (a) ya aprobada: falta implementarla y re-probar (`fin/roles.cjs`, `fin/escala.cjs`; esperado: 403 sin usuario ni fila en GoTrue/`usuario_rol`; super_admin → 201). Evidencia: tests.md, "Prueba final de la rama (Fase 5)", punto 4.

### [2026-10-15] [tester] — PARA RESOLVER F-B (alto) y F-C (alto): `portal_admin` desactiva/borra al super_admin/rh_admin y toma cuentas por reset de contraseña
F-B: con `portal_admin` (Usuarios:edicion) `PUT /usuarios/:id {activo:false}`, `PUT {nombre}` y `DELETE /usuarios/:id` sobre un usuario `super_admin` y uno `rh_admin` → 200 (quedaron eliminados; también un `tickets_admin`): las guardas solo corren con `contraseña`/`rol_id` y `eliminar` no las llama. F-C: `POST /usuarios/:id/reset-password` sobre `rh_empleado`, `tickets_tecnico` y `auditoria_viewer` → 200 (contra un doble de GoTrue; al entrar hereda permisos que portal_admin no posee); con rol privilegiado por nombre sí 403. Coinciden con los altos del revisor y con las correcciones (b) y (c) aprobadas; falta implementar y re-probar (`fin/roles2.cjs`, `fin/roles.cjs`).

### [2026-10-15] [tester] — PARA RESOLVER F-D (alto, contradice la decisión "jefe vigente"): el HEAD autoriza por el snapshot del jefe, no por el jefe vigente
`vigente.cjs` (pg16, HEAD a8d530d): tras cambiar el jefe vigente de A (JEFE → S), el jefe ANTERIOR aprueba la pendiente creada cuando él era jefe (200) y el vigente no podría; con el jefe vigente en NULL el jefe que tenía al crear sigue aprobando (200). La decisión del humano (punto 3, "jefe vigente … las pendientes se reasignan solas; el listado usa el mismo criterio") exige lo contrario: usar `empleados.jefe_inmediato_id` del solicitante dentro de la transacción (mismo orden de bloqueos) en ruta, `responder` y `puede_responder`. Pendiente del coder; re-probar con `fin/vigente.cjs`, `fin/aut.cjs` (la prueba de carrera cambia: ahora se cambia el jefe del EMPLEADO) y la matriz de la UI de `fin/e2e.cjs`.

### [2026-10-15] [tester] — PARA RESOLVER F-E (menores, rama final)
(1) `PUT /usuarios/:id` solo con `{rol_id:null}`: quita el rol y responde 400 con `error:"syntax error at or near \"WHERE\""` (`Usuario.actualizar` con datos vacíos; atómico no es). (2) El 403 de lo propio o de un jefe que ya no lo es muestra "No tienes acceso a este recurso" (middleware), no `MSG_PROPIA`/`MSG_SIN_AUTORIDAD`. (3) `puede_responder` es true para un jefe con solo `Vacaciones:consulta` (el `PUT` da 403). (4) `empleado_id[]=9` en `/vacaciones/disponibilidad` y `/ocupacion` → 500 (en `/saldo` 200). (5) `empleados.usuario_id` sin UNIQUE en `init.sql` (acepta 2 empleados por usuario; la identidad de quien responde queda arbitraria): decisión (e) ya aprobada. (6) Preexistente: en un `supabase-db-init` limpio `rh_empleado` no recibe `rh/Vacaciones` (la 003 de portal no está en db-init). Detalle: tests.md, observaciones (a)-(e).

### [2026-10-15] orquestador — Estado de la Fase 5 tras la 2.ª re-revisión: CONDICIONADA, decisiones del humano pendientes
**Cerrado y verificado:** crítico E1 (toma de cuenta en un solo PUT) y todos los hallazgos de vacaciones/calendario; jest 43/43 suites (875 tests), eslint 0 errores; commits en la rama: `c5247eb` (F2), `07400d2` (F3), `fa87d41` (F4), `856c285` (extensión F4), `a8d530d` (regla del jefe), `975a04c` (roles/jefe vigente), `7267d5f` (operación atómica sobre usuarios). Revisor: CONDICIONADO (0 críticos, 2 altos).
**PARA RESOLVER (humano) — ambos están en el módulo de usuarios/roles del portal, fuera del alcance original (vacaciones y calendario):**
1. **ALTO:** `portal_admin` puede crear una cuenta propia con contraseña elegida y un rol no privilegiado con más permisos que él (test `usuario.controller` :353 lo fija como 201). Es consecuencia literal de la decisión 1 ("asignar roles no privilegiados aunque tengan más permisos"), pero elude la regla de posesión. Opciones: (A) aceptarlo como riesgo conocido; (B) que `portal_admin` no pueda crear/asignar roles con permisos que no posee a **sí mismo ni a cuentas cuya contraseña él fija**; (C) volver a la posesión estricta.
2. **ALTO (regresión de 975a04c):** la llamada a GoTrue (timeout 10 s) corre con la transacción y el `FOR UPDATE` abiertos; con `PG_POOL_MAX=10`, 10 operaciones lentas agotan el pool de todo el portal. Propuesta del orquestador: tratar GoTrue fuera de la transacción larga (validar y escribir en BD, COMMIT, luego GoTrue con compensación del cambio si falla) o bajar el timeout dentro de la transacción y limitar la concurrencia de esta operación.
**Abiertos menores:** `rh_admin` crea cuentas con rol `portal_admin` desde Empleados (E6); `req.user` toma un rol arbitrario con varios roles (`auth.middleware.js:69-78`, sin tests multirrol); COMMIT que falla tras aceptar GoTrue; `release(error)` tras ROLLBACK fallido en `delegacionPermisos`.

### [2026-10-15] orquestador — Decisiones del humano sobre los 2 altos de la Fase 5
1. **Opción C (posesión estricta al asignar roles):** **sustituye la decisión 1 del 2026-10-15 ("asignar roles no privilegiados aunque tengan más permisos")**. Quien no es `super_admin` solo puede asignar (usuarios, alta de empleado, cualquier vía) roles cuyos permisos **posee completos**; los roles privilegiados siguen reservados a `super_admin`. Consecuencia aceptada por el humano: `portal_admin` no asigna `rol_empleado` ni roles con permisos que no tiene; esas asignaciones las hacen `rh_admin` (roles de RH que posee) o `super_admin`.
2. **Recomendación del orquestador adoptada para GoTrue:** validar y escribir en BD bajo `FOR UPDATE` → COMMIT → llamar a GoTrue fuera de la transacción → si GoTrue falla, compensar (restaurar el estado previo del usuario en otra transacción) y responder error; sin conexión del pool retenida durante la llamada a GoTrue.
**Deuda aceptada (sin cambios):** `rh_admin` crea cuentas `portal_admin` desde Empleados (con C, solo si `rh_admin` posee todos los permisos de `portal_admin`: el coder lo verifica y lo reporta); `req.user` con varios roles; COMMIT fallido tras GoTrue desaparece con el nuevo orden.

### [2026-10-15] orquestador — Cierre de la tarea "Calendario laboral y bloqueo de vacaciones por departamento": LISTA PARA GO/NO-GO FINAL
**Resultado de la tarea (humano):** calendario laboral (oficial de ley, descanso otorgado, evento) administrado por RH/Administradores; vacaciones en días hábiles lun-vie; una solicitud no puede tomar días ya concedidos (aprobados) a compañeros del mismo departamento según el cupo configurable (`departamentos.cupo_vacaciones`, default 1); solo autorizan el jefe inmediato vigente, `rh_admin` y `super_admin`, nunca la propia solicitud.
**Fases:** 1 investigación · 2 BD+API (`c5247eb`) · 3 pantalla (`07400d2`) · 4 días hábiles+cupo+ocupación (`fa87d41`) · extensión: pool/JSON/roles/saldo (`856c285`) · regla del jefe (`a8d530d`) · seguridad de roles/jefe vigente (`975a04c`, `7267d5f`, `757c3fc`) · cuarta ronda GoTrue incierto (commit de cierre).
**Verificación final del orquestador:** jest 43/43 suites (902 tests), eslint 0 errores. Tester (instalación limpia y actualización con `supabase-db-init` real ×2, flujo E2E en Chromium/Firefox 61/61, resiliencia, concurrencia cruzada sin deadlocks, 4 zonas horarias). Revisor: 0 críticos abiertos; 3.ª re-revisión CONDICIONADA solo por F1 (corregido en la 4.ª ronda).
**Deuda y riesgos residuales aceptados:** (1) GoTrue fuera de la transacción: tras el COMMIT la contraseña vieja es válida hasta que GoTrue responde (F2), GoTrue no se serializa entre operaciones concurrentes (F3), la compensación se niega si cambió otro dato del usuario (F4); (2) F5: `rh_empleado`/`tickets_tecnico` a cuentas existentes solo los asigna `super_admin` (pendiente de decidir si `rh_admin`/`tickets_admin` tendrán vía propia: tarea aparte); (3) `req.user` con varios roles toma uno arbitrario (preexistente); (4) tests por regex sobre SQL/código en migración y util; sin tests de componente (no hay jsdom); (5) avisos de ESLint preexistentes (18); (6) fechas un día antes en backend con TZ positiva (preexistente); (7) concurrencia de edición del calendario last-write-wins; (8) notificación al crear solicitud sin jefe: nadie recibe aviso (no hay lista de correos RH); (9) `rh_empleado` no recibe `rh/Vacaciones` en un db-init limpio (preexistente); (10) Safari < 16 sin apilado de la lista del calendario.
**No verificado en ningún momento:** GoTrue y Microsoft reales, WebKit, lector de pantalla, datos reales de dev/staging/prod, límite de 50 MB de nginx, SMTP/n8n.
**Despliegue (solo con OK del humano):** push + PR; en cada entorno re-ejecutar `supabase-db-init` (migraciones 009 y 010; 010 avisa sin crear el UNIQUE si hay duplicados en `empleados.usuario_id`); revisar variables `PG_POOL_*`; probar con sesión real: alta de fechas en `/rh/calendario`, cupo en Departamentos, solicitud de dos colaboradores del mismo departamento y aprobación por el jefe.

### [2026-10-16] orquestador — Nuevo tipo de fecha "Día Actividad Empresa" (bloquea vacaciones para todos)
**Petición (humano):** nuevo tipo que se registra en el calendario y que SÍ bloquea la fecha para pedir vacaciones; aplica a todos.
**Diseño del orquestador (recomendaciones; el humano puede corregir):**
1. Valor `tipo = 'actividad'`, etiqueta "Día Actividad Empresa". Migración 011 amplía el CHECK de `calendario_laboral.tipo` (idempotente; también `init.sql`, compose y docs).
2. **Bloquear** = una solicitud cuyo rango contenga una fecha de actividad activa que caiga en **día hábil (lun-vie)** se rechaza (409, código `ACTIVIDAD_EMPRESA`, mensaje con la fecha y el nombre). A diferencia de oficial/otorgado, NO se salta ni se descuenta: la fecha no se puede tomar. Un sábado/domingo de actividad no bloquea (de todos modos no es hábil).
3. Se valida al **crear** y al **aprobar** (una pendiente creada antes de registrar la actividad no se puede aprobar: 409, RH decide). Aplica a todos los departamentos, sin excepción por rol.
4. Las solicitudes **ya aprobadas** no se tocan; al registrar/editar una actividad, la API devuelve un aviso con cuántas solicitudes aprobadas/pendientes caen en esa fecha, para que RH decida.
5. UI: color+ícono+texto propios en el calendario y su leyenda/ayuda; el calendario de ocupación del formulario marca la fecha como "Bloqueado: <nombre>" y deshabilita Enviar con el mensaje del servidor; `/disponibilidad` y `/ocupacion` devuelven `fechas_bloqueadas`.
6. `evento` sigue siendo solo informativo. Auditoría y permisos (RH/Administradores) sin cambios.

### [2026-10-16] [tester] — PARA RESOLVER F-ACT-1 (menor): el aviso de "Día Actividad Empresa" dice "Ninguna solicitud… incluye esta fecha" cuando la actividad está inactiva o cae en fin de semana/festivo
Al desactivar (o registrar inactiva/sábado/domingo/sobre festivo) una actividad, la API devuelve avisos 0/0 por regla y la UI muestra "Ninguna solicitud de vacaciones, aprobada o pendiente, incluye esta fecha." aunque existan solicitudes que sí la incluyen (visto al desactivar el 4-nov con 1 aprobada y 2 pendientes). Decidir: texto distinto para "no bloquea (inactiva / no hábil)" o contar igual. Detalle y evidencia en tests.md "Tipo actividad empresa". Resto de la prueba integrada: sin fallos.

### [2026-10-16] orquestador — Tipo "Día Actividad Empresa": listo para GO/NO-GO
**Quién escribió qué:** coder (migración 011, API, UI, tests y 1 ronda de correcciones) → code-notes.md; revisor (APROBADO CON OBSERVACIONES, 0 críticos/altos) → reviews.md; tester (supabase-db-init real ×2 en supabase/postgres 17.6, E2E 69/69 en Chromium y Firefox con 21 combinaciones de zona horaria, regresión de cupo/hábiles/autorización/concurrencia, axe) → tests.md.
**Resultado:** `tipo='actividad'` ("Día Actividad Empresa") bloquea las vacaciones de todos cuando cae en día hábil (lun-vie, no festivo/otorgado); se valida al crear y al aprobar (409 con `codigo: 'ACTIVIDAD_EMPRESA'`, auditoría `RECHAZO_ACTIVIDAD`); la pendiente anterior a la actividad no se aprueba y sigue pendiente; aprobadas anteriores intactas; al registrar/editar/desactivar la actividad se informa cuántas solicitudes aprobadas/pendientes la incluyen y por qué no bloquea (`avisos.motivo`: sin_solicitudes/inactiva/no_habil); `/disponibilidad` y `/ocupacion` devuelven `fechas_bloqueadas`; calendario de ocupación marca "Bloqueado: nombre" y deshabilita Enviar. Migración 011 idempotente (localiza el CHECK por la columna `tipo`, no toca otros CHECK).
**Verificación del orquestador:** jest 43/43 suites (966 tests), eslint 0 errores.
**Deuda / riesgo aceptado:** registrar una actividad no bloquea el calendario: una solicitud en curso puede entrar y queda pendiente (se frena al aprobar con 409); fechas un día antes en backend con TZ positiva (preexistente); migración 011 y util probados en parte por regex; Firefox de la última ronda de UI, WebKit, lector de pantalla y GoTrue real sin verificar.
**Para tu ambiente de desarrollo en ejecución:** re-ejecutar `supabase-db-init` para aplicar la 011.

### [2026-10-21] orquestador — Módulo de asistencia en RH: respuestas del humano y alcance
**Objetivo (humano):** módulo de asistencia en RH; un programa/interfaz extrae marcas de BioTime periódicamente y las inserta en las tablas del módulo; turnos definibles y asignables a cada empleado; análisis de marcas para retardos y faltas, cruzado con vacaciones y permisos; lo ven empleados, su jefe inmediato y RH. No hay plan previo en PLAN.md: las fases son PROPUESTA del orquestador y cada una exige GO del humano. Rama `feat/asistencia-rh`.
**Respuestas del humano (a las 12 preguntas):**
1-2. **La interfaz con BioTime (versión, conexión, red, credenciales, programa que extrae) la construye otro desarrollo, no este.** Aquí se entrega el **contrato de tablas** para esa interfaz (definición propuesta el 2026-10-21; falta confirmación explícita del humano de que se la entregó tal cual).
3. El código del empleado en BioTime = `empleados.numero_nomina`.
4. La interfaz corre fuera de este repo ("así se manejará"); inserta en las tablas del contrato (rol `asistencia_interfaz`, solo INSERT en marcas; alternativa HTTP no elegida).
5. Sincronización **cada 15 min** y carga de **todo el historial** (a cargo de la interfaz).
6. Turnos: entrada/salida, días de la semana, tolerancia, turnos nocturnos, asignación por empleado con vigencia e historial; **deben alinearse con la tabla de turnos de BioTime** (pendiente: estructura de esa tabla/versión de BioTime).
7. Reglas: **retardo = después de 10 min** de tolerancia (por turno, configurable); propuesta aceptada para lo demás: falta si llega más de 30 min tarde o sin marca de entrada (umbral configurable); salida anticipada; marca incompleta (entrada sin salida).
8. Cruces aceptados: vacaciones aprobadas = día de vacaciones (no falta); permiso aprobado (`permisos_ausencia`) = día con permiso; festivo oficial y descanso otorgado = no laborable; Día Actividad Empresa y evento = laborable normal; fin de semana/descanso del turno = no es falta.
9. Solo RH justifica incidencias y corrige marcas, con motivo y auditoría, conservando la marca original.
10. Empleado ve lo propio; jefe inmediato **vigente** ve a sus subordinados directos; RH ve todo.
11. Horas extra y cálculo de nómina: **fuera de alcance**.
12. Todas las sedes en la misma zona: **America/Mexico_City**.
**Consecuencia para las fases:** la Fase 3 propuesta (conector BioTime) sale del alcance; se sustituye por "contrato de integración + simulador de marcas para pruebas". Fases: 1 investigación · 2 BD+turnos+API · 3 contrato de integración y simulador · 4 motor de análisis · 5 pantallas · 6 revisión final y cierre.

### [2026-10-21] orquestador — Contrato de integración con BioTime: endpoint HTTP con llave (sustituye al rol de BD)
**Decisión (humano):** "me gusta la idea del endpoint para la interface con una llave". La interfaz con BioTime (otro desarrollo) entregará las marcas por **endpoint HTTP autenticado con una llave (API key)** y **no** insertará directo en la base. Queda **descartado** el rol de BD `asistencia_interfaz` con políticas RLS que se propuso el 2026-10-21; las tablas `asistencia_marcas`, `asistencia_sync_estado` y `asistencia_sync_lotes` siguen siendo la persistencia, pero solo las toca el backend.
**Por qué (orquestador):** coherente con "el único acceso a datos de la app es el backend" (RLS deny-all); la llave se revoca/rota sin tocar la BD; el backend valida, normaliza la zona horaria, deduplica y audita en un solo lugar; la interfaz queda desacoplada del esquema.
**Impacto en fases:** la Fase 3 pasa a ser "endpoint de ingesta con llave + contrato OpenAPI-like para el equipo de la interfaz + simulador". Puntos a diseñar (propuesta, el humano confirma): llave por cabecera (`X-Api-Key` o `Authorization: Bearer`), guardada **hasheada** en BD (nunca en claro ni en el repo), con alta/rotación/revocación por RH-admin y auditoría; `POST` por lotes idempotente (`ON CONFLICT (origen,id_externo) DO NOTHING`, respuesta con insertadas/duplicadas/rechazadas), `GET` del cursor/estado, límite de tamaño y de tasa, lista blanca de IP opcional, errores sin detalles internos. La conversión de zona horaria y el `empleado_id` los resuelve el backend.

### [2026-10-21] orquestador — CONFLICTO: tablas nuevas quedan sin RLS hasta el siguiente db-init (decisión 2026-10-08 "RLS deny-all")
**Hecho verificado:** en `docker-compose.supabase.yml` el `supabase-db-init` aplica `004-rls-deny-all.sql` ANTES de las migraciones 009/010/011 (calendario laboral). En una base donde 009 se aplica por primera vez, `calendario_laboral` queda con `relrowsecurity = false` hasta que `db-init` se vuelva a ejecutar. **Staging (medido 2026-10-21): `calendario_laboral` sin RLS**; dev la tiene porque el db-init se corrió varias veces. Mitigación existente: `anon`/`authenticated` tienen 0 privilegios sobre `public` (los DEFAULT PRIVILEGES revocan), así que no hay exposición por la API hoy; falta la defensa en profundidad.
**Propuesta (pendiente de OK del humano):** (1) en el compose, ejecutar `004-rls-deny-all.sql` otra vez AL FINAL del db-init (es idempotente) — cubre también las tablas del módulo de asistencia; (2) re-ejecutar `supabase-db-init` en staging (idempotente, sin cambios de datos) para cerrar el hueco de `calendario_laboral`. Cambio acotado a `docker-compose.supabase.yml`; se incluye en la Fase 2 de asistencia o se hace antes como corrección aparte, a elección del humano.

### [2026-10-21] orquestador — Fase 1 (investigación de asistencia) LISTA PARA GO/NO-GO
**Quién:** investigador → research.md (líneas 1640-1908), con el ajuste de ingesta por endpoint con llave. **Hallazgos clave:** módulo nuevo en `modules/rh/backend`, siguiente migración **012**, cableado obligatorio en el compose; **no hay scheduler** en el repo (opciones A-E comparadas para el recálculo); `authenticateJWT` rechaza cualquier Bearer no-Supabase → la llave va en `X-Api-Key` con middleware propio, y el `express.json` global (100 kb) corta antes del router → montar la ingesta antes o con parser propio; no hay rate limit ni `trust proxy`; `empleados.numero_nomina` sin UNIQUE ni NOT NULL; `permisos_ausencia` sin CHECK de tipo/estatus ni horas parciales; `solicitudes_vacaciones` guarda días naturales históricos; sin historial de jefe/departamento/estatus. BioTime (fuentes de terceros, sin confirmar oficial): API `GET /iclock/api/transactions/`, soporte de API REST según versión/Cloud, `punch_state` y `verify_type` sin confirmar.

### [2026-10-21] orquestador — Decisiones del humano tras la Fase 1 de asistencia y GO a la Fase 2
**Decisiones (humano):** (1) **RLS: ejecutar** — resuelve el CONFLICTO de las tablas nuevas sin RLS; (2) **cuerpo de la petición de la ingesta: OK** — cabecera `X-Api-Key`, máximo **500 marcas o 1 MB por lote**, clave de idempotencia `(origen, id_externo)`; (3) **turnos por departamento**; (4) **BioTime no envía marcas anuladas** (no hay que manejar anulaciones); (5) **retención de marcas crudas: siempre** (no se purgan); (6) **GO a la Fase 2**.
**Interpretación del orquestador (a confirmar con el humano):** "turnos por departamento" + el objetivo original "definirlo a cada empleado" ⇒ el **turno se asigna al departamento** (turno por defecto, con vigencia) y **se puede sobreescribir por empleado** (con vigencia); el turno efectivo de un empleado en una fecha = asignación individual vigente, si no, la del departamento vigente.
**Ejecutado ya:** `supabase-db-init` re-ejecutado en staging (2026-10-21): `004-rls-deny-all.sql` aplicó RLS a `calendario_laboral`; verificado 0 tablas de `public` sin RLS y 0 privilegios de `anon`/`authenticated`. Staging seguía en `2034769`, sin cambios de datos. Pendiente en código: ejecutar `004` al final del db-init en `docker-compose.supabase.yml` (Fase 2) para que las tablas nuevas nazcan con RLS en el mismo arranque.
**Alcance Fase 2:** migración 012 (turnos y detalle por día, asignaciones a departamento y a empleado con vigencia sin traslape, marcas crudas, estado/lotes de sincronización, asistencia diaria calculada, incidencias/justificaciones), RLS en su propia migración, API de turnos y asignaciones (solo RH/Administradores editan), permiso nuevo, auditoría, resolución del turno efectivo. NO incluye el endpoint de ingesta (Fase 3), el motor de cálculo (Fase 4) ni pantallas (Fase 5).

### [2026-10-21] orquestador — Datos reales de BioTime (docs/respuesta_intranet.md, local y excluido de git) y su efecto en el diseño
**Fuente:** respuesta del equipo de la interfaz (consultas de solo lectura a la base de BioTime). El archivo contiene IPs y números de serie internos: **no se versiona** (`.git/info/exclude`) y no se copian esos valores a código, tests, docs ni memoria.
**Hechos:** BioTime **local** con Postgres propio (no Cloud); la versión comercial no consta en la base (pendiente de leer en su interfaz web); `punch_time` es `timestamptz` (el instante es correcto, el servidor está en otra zona) y **el programa envía en UTC**; el `tzdata` del Postgres de BioTime es viejo (no convertir a hora local allí); `id` creciente con huecos = cursor; `upload_time` disponible (marcas offline); `punch_state` casi siempre '0' (no distingue entrada/salida) y `verify_type` casi siempre 15; turnos en `att_*`: 2 intervalos (entrada 08:00, 600 min, retardo permitido 10, salida anticipada permitida 3 o 0, ventanas de captura de entrada 60 antes/150 después y de salida 5 o 0 antes/359 después, descanso obligatorio 13:00 por 60 min), ciclo semanal lun-vie con sáb/dom descanso, sin turnos nocturnos; las asignaciones de BioTime (`att_attschedule`) están **vencidas desde 2025**; 118 `emp_code` en marcas y 25 sin empleado en su base; la interfaz corre en un PC Windows de la red interna y la IP de salida hacia el endpoint no está confirmada.
**Consecuencias de diseño (orquestador):** (1) la entrada/salida se **deduce con el turno** (primera/última marca dentro de sus ventanas), no con `punch_state`; (2) las marcas se guardan en UTC y la conversión a America/Mexico_City ocurre en el motor (Fase 4) con zona actualizada; (3) se añade `subida_ts` a las marcas para reprocesar las que llegan tarde; (4) los turnos de la intranet guardan las mismas tolerancias y ventanas que BioTime (alineación pedida) y se siembran 'Rayhsa' y 'Logística' (editables); (5) **no** se importan asignaciones de BioTime: RH asigna los turnos a departamentos (decisión del humano); (6) se esperan marcas huérfanas (sin empleado) y no son error; (7) el cursor de la interfaz es el `id` de la transacción.
**Pendiente / preguntas para el humano:** (a) el umbral de falta propio (30 min) frente a la ventana de captura de entrada de BioTime (150 min después de la hora de entrada): ¿se alinea la falta con esa ventana (entrada >150 min tarde = sin entrada = falta) o se mantiene 30 min?; (b) versión comercial de BioTime; (c) IP/dominio desde donde llegará la interfaz al endpoint (¿red interna o salida pública?) para la lista de IP permitidas; (d) comprobar `numero_nomina` único y su coincidencia con `emp_code` de BioTime: staging solo tiene 1 empleado, así que **hay que hacerlo con los datos reales de empleados** (producción) antes de la Fase 4; (e) qué hacer con las marcas de los `emp_code` sin empleado en la intranet (ex empleados): se guardan huérfanas.

### [2026-10-21] orquestador — Contrato de la ingesta de marcas entregado a la interfaz (docs/asistencia/contrato-ingesta-marcas.md, v1 borrador)
**Petición (humano, pegando lo que pide el equipo de la interfaz):** URL y cabecera de la llave, formato del cuerpo, respuesta, tamaño máximo del lote y quién llena `empleado_id`.
**Contenido:** `POST /api/asistencia/ingesta/marcas` y `GET /api/asistencia/ingesta/estado`; cabecera `X-Api-Key`; llave de 32 bytes aleatorios guardada con hash, entregada por gestor de contraseñas, rotación con solape y revocación; cuerpo `{origen, marcas:[…]}` (no es idéntico a `asistencia_marcas`: `id`, `lote_id`, `empleado_id`, `fecha_importacion` los pone el servidor); lote máximo **500 marcas / 1 MB** (decidido por el humano el 2026-10-21; la interfaz propuso 1,000 y se les explicó); **éxito parcial** (lo válido se guarda, lo inválido se lista en `rechazos`); respuesta con `recibidas/insertadas/duplicadas/rechazadas/sin_empleado/ultimo_id_externo`; **la intranet** registra `asistencia_sync_lotes` y `asistencia_sync_estado` (la interfaz no escribe nada de eso) y **la intranet llena `empleado_id`** por `numero_nomina = codigo_empleado` (una sola coincidencia; si no, queda huérfana y se reintenta).
**Reglas añadidas por el orquestador (no decididas antes; el humano confirma):** `marca_ts` obligatoriamente con zona y rechazada si está >24 h en el futuro; `crudo` ≤ 2 KB por marca; 60 envíos/min por llave (`429` con `Retry-After`); códigos 400/401/403/413/429; la llave solo sirve para esas dos rutas y para un origen.
**Pendiente:** URL base por entorno e IP de la interfaz (lista de IP permitidas); el endpoint se implementa en la Fase 3 (no hay GO todavía). El contrato no contiene IPs, números de serie ni llaves.

### [2026-10-21] orquestador — Coordinación con la sesión del sincronizador BioTime (biotime-34): contrato v1 adoptado
**Hecho:** la sesión que construye el sincronizador (otro repo/carpeta, Windows) recibió el contrato v1 por mensaje entre sesiones y lo implementó contra un endpoint simulado: `POST` con `X-Api-Key`, lotes de 500 en orden ascendente de `id`, `subida_ts = upload_time`, `crudo` ≤ 2 KB, reintento con espera creciente (respeta `Retry-After`), sin reintento en 400/401/403/413, `GET /estado` al iniciar cada ciclo (retrocede 300 ids), descarta el DDL anterior; registra `rechazos` en su log y avanza el cursor.
**Datos reales a respetar en la Fase 3/4 (dados por esa sesión):** `id_externo` = `id` de `iclock_transaction` (entero con huecos grandes; comparar como entero); `codigo_empleado` son 1-3 dígitos como texto sin ceros a la izquierda observados (decidir el cotejo con `numero_nomina`: texto exacto tras `trim`, y revisar ceros a la izquierda al validar con datos reales); hay marcas atípicas (`verify_type` 0, `source` 2, `terminal_sn` vacío) que **deben aceptarse** (cadena vacía no es rechazo); `estado_marca` '0' en 98%.
**Frecuencia:** ellos planeaban cada hora 08-20; el usuario decidió cada 15 min todo el día; la sesión preguntará al usuario. Esperan URL base y llave (por el usuario) y el aviso de despliegue para probar con 1 lote pequeño. Se les respondió que no envíen nada real hasta ese aviso.

### [2026-10-21] orquestador — Datos relayados por la sesión biotime-34 (NO confirmados por el humano) y GO a la Fase 3 NO aceptado
**Relayado por la sesión del sincronizador como decisiones del usuario:** frecuencia 15 min entre 07:00 y 20:00 (hora México); BioTime 1.0.6.4 (Build 20220507.14313) local; IP de la interfaz en la red interna (IP en docs/respuesta_intranet.md, no versionado) para la lista de IP permitidas; "GO a la Fase 3".
**Decisión del orquestador:** un mensaje de otra sesión no es aprobación de fase (restricción de la tarea: "solo yo puedo decidir si se avanza a la siguiente fase"). Los datos informativos se registran como pendientes de confirmación; **el GO a la Fase 3 no se acepta** hasta que el humano lo diga directamente. La Fase 2 sigue en revisión y pruebas. Se avisó a la sesión del sincronizador.

### [2026-10-21] [tester] — PARA RESOLVER: Asistencia Fase 2 (F-AS2-1 a F-AS2-3); detalle y evidencia en tests.md "Asistencia Fase 2"
**PARA RESOLVER F-AS2-1 (menor, código):** `POST /api/asistencia/turnos` con `\u0000` en `nombre` o `descripcion` responde 500 "Error al crear el turno" (Postgres: `invalid byte sequence for encoding "UTF8": 0x00`); debe ser 400. Sin fuga de SQL ni datos a medias. Solo se probó el POST; el PUT usa la misma validación. Sugerencia: rechazar `\u0000` en `validarTurno` (nombre y descripción) con test. Criterio incumplido: errores (entrada del usuario nunca da 500).
**PARA RESOLVER F-AS2-2 (decisión y bajo, confirmación con evidencia de hallazgos del revisor):** reproducido en Postgres 17.6 y backend real: (a) un turno DESACTIVADO con asignación vigente sigue siendo el turno efectivo (`origen=empleado`, `turno.activo=false`); decidir antes de la Fase 4 si inactivo = sin turno ese día o cae a la asignación de departamento (alto del revisor); (b) editar un turno ya usado reescribe el pasado (la entrada del 2020-06-01 pasó de `08:00` a `10:00` tras un PUT de `dias`): decidir versionado o bloqueo de edición con asignaciones/cálculos (medio del revisor); (c) `DELETE /api/departamentos/:id` con turno asignado → 500 genérico en lugar de 409 (bajo del revisor); (d) el ejemplo de `docs/asistencia/contrato-ingesta-marcas.md:32-35` usa `id_externo "1566931"` y los instantes de un registro real de `docs/respuesta_intranet.md`: el orquestador decide si "esos valores" de la decisión del 2026-10-21 incluye ese tipo de dato (bajo del revisor).
**PARA RESOLVER F-AS2-3 (menor, preexistente, decisión):** `auditoria.ip_origen` es VARCHAR(45) y `registrarAccion` guarda `X-Forwarded-For` completo: con una cabecera de varias IPs (>45 caracteres) el INSERT falla y la acción NO queda auditada, en silencio (se escribe `[Auditoría] Error al registrar acción: value too long…` en el log). Reproducido con la creación de un turno (HTTP 201, 0 filas de auditoría). Afecta a todos los módulos tras un proxy con cadena de IPs; sugerencia: tomar la primera IP de la cabecera y truncar a 45, o ampliar la columna.
**Sin CONFLICTO:** nada de lo observado contradice una decisión de decisions.md. 6 de 6 grupos pedidos en PASS; 2 FAIL menores (F-AS2-1, F-AS2-2c), 0 bloqueados.

### [2026-10-21] orquestador — Confirmaciones del humano (directas) sobre los datos de la interfaz con BioTime
**Confirmado por el humano:** (1) **frecuencia de sincronización: cada 15 min entre 07:00 y 20:00, hora de México**; (2) **BioTime ZKTeco versión 1.0.6.4 (Build 20220507.14313)**, instalación local; (3) **IP de la interfaz: la de la red interna que figura en docs/respuesta_intranet.md** (no versionado) para la lista de IP permitidas. Sustituye lo "pendiente de confirmación" de la entrada anterior sobre datos relayados.
**Sigue sin decidir el humano:** GO a la Fase 3 (no dado), historial de departamento / versionado de turnos (Fase 4), y si el endpoint se publica solo por red interna (la IP de salida pública no se confirmó y no se necesita si la interfaz llama por la red interna).

### [2026-10-21] orquestador — GO del humano a la Fase 3 de asistencia (endpoint de ingesta con llave)
**Decisión (humano, directa):** "vamos a la Fase 3". Se entiende también como aprobación de la Fase 2 una vez aplicadas y verificadas las correcciones de la revisión/pruebas que el coder está terminando (sobre la misma migración 012 y `init.sql`). **Orden:** (1) terminar y verificar las correcciones de la Fase 2 → commit que cierra la Fase 2; (2) lanzar el coder de la Fase 3 sobre ese commit (evita editar a la vez `012`/`init.sql`).
**Alcance Fase 3:** migración 013 (tabla de llaves de la ingesta con hash, prefijo, origen, estado, vigencia, solape de rotación, `ultimo_uso`; `llave_id` en `asistencia_sync_lotes`), middleware de llave (`X-Api-Key`) propio y montado ANTES de `/api/asistencia` (que lleva `authenticateJWT`), parser con límite propio (1 MB; 500 marcas), `POST /api/asistencia/ingesta/marcas` (éxito parcial, ON CONFLICT DO NOTHING, vinculación de `empleado_id` por `numero_nomina`, lote y estado registrados por el servidor, `sin_empleado`, `ultimo_id_externo`), `GET /api/asistencia/ingesta/estado`, límite de tasa (60/min por llave), lista de IP permitidas por llave, administración de llaves (alta/rotación/revocación) por RH-admin/super_admin con auditoría y mostrar la llave una sola vez, y un simulador de marcas para pruebas. Sin el motor de análisis (Fase 4) ni pantallas (Fase 5).

### [2026-10-21] orquestador — Decisión del humano: historial de departamento y versionado de turnos = opción A (snapshot + periodos cerrados)
**Decisión (humano):** opción **A**. El día calculado guarda el turno y los parámetros usados (snapshot); solo se recalculan periodos abiertos; los periodos cerrados no cambian aunque se transfiera a alguien o se edite un turno. **Periodo = quincena** (1-15 y 16-fin de mes); **cierre 3 días después** de terminada la quincena (configurable, margen para marcas tardías de terminales sin red); **solo RH (`rh_admin`) y `super_admin` pueden reabrir** un periodo, con motivo y auditoría.
**Consecuencias para la Fase 4 (orquestador):** (1) `asistencia_diaria` guarda snapshot del turno usado y sus parámetros (tolerancias, ventanas, descanso, umbral de falta) y el departamento/origen de la asignación; (2) tabla de periodos (quincena, estado abierto/cerrado, cerrado_en, reabierto_por/motivo) y cierre automático por el motor; (3) marcas que llegan después del cierre de su quincena no recalculan: se registran y quedan como ajuste pendiente que RH resuelve reabriendo el periodo; (4) un traslado a mitad de quincena abierta reclasifica los días anteriores de esa quincena salvo que RH asigne un turno individual con vigencia: avisarlo en la pantalla de asignación (Fase 5) y en la documentación; (5) la re-vinculación de marcas huérfanas solo afecta días de periodos abiertos; (6) la edición de un turno se permite pero no afecta a periodos cerrados.

### [2026-10-21] [tester] — PARA RESOLVER: Asistencia Fase 3 (F-AS3-1 a F-AS3-3); detalle y evidencia en tests.md "Asistencia Fase 3"
**PARA RESOLVER F-AS3-1 (menor, código de test):** `modules/rh/backend/tests/ingesta.test.js:762` hace `esc.llave.split("_")[2]` para obtener el secreto de la llave; el secreto base64url puede empezar con `_` (1/64 = 1,56 % de las llaves, medido en 200 000), `[2]` queda `""` y `expect(todo).not.toContain("")` (línea 772) falla siempre: es la causa del fallo intermitente del jest completo (1 de 40 en `ingesta.test.js` bajo carga; no es carga ni el 413/EPIPE). Sugerencia: `const secreto = esc.llave.slice(13)`. Criterio incumplido: regresión estable (jest sin intermitencias).
**PARA RESOLVER F-AS3-2 (menor, decisión):** (a) `modules/rh/backend/tests/asistencia-migracion.test.js:267` tiene en una regex negativa 3 `id_externo` reales y 1 alias de sede tomados de `docs/respuesta_intranet.md`, y esos valores (id y alias) se citan en `memory/reviews.md:2759`, `memory/decisions.md:1041` y `memory/tests.md:498`: decidir si los ids y alias de sede cuentan como "valores del doc local" (la decisión del 2026-10-21 nombra IPs y series); si cuentan, cambiar la regex por una genérica (p. ej. prohibir los ejemplos reales por patrón sin listarlos) y depurar las citas. (b) Hay IPs `10.x` ficticias de fixtures (`10.0.0.5`, `10.1.2.3`, `10.99.99.99`…) en `ingesta.test.js`, `ingesta.utils.test.js` y `llaveIngesta.admin.test.js`: no son la IP de la interfaz, pero incumplen la letra de "ningún archivo versionado con IPs 10.x"; decidir si basta (RFC 1918 inventadas) o pasar a rangos de documentación (192.0.2.x / 198.51.100.x / 203.0.113.x).
**PARA RESOLVER F-AS3-3 (observaciones menores, decidir si se ajusta código o documentación):** (a) `charset=utf-16` (u otro `utf-*`) con cuerpo UTF-8 → 400 `JSON inválido`, no 415 como dice la sección 7 del contrato ("415 para una codificación no admitida"; solo `latin1` y similares dan 415). (b) Rotar una llave que ya fue rotada (aún en su solape) devuelve 201 y crea una SEGUNDA llave activa sin vencimiento (no alarga la vigencia de la vieja); un reintento tras una respuesta perdida deja una llave huérfana vigente; decidir si se rechaza con 409 o se documenta. (c) 500 marcas con `crudo` al máximo de 2 KB por marca (≈1,07 MB) superan el 1 MB y dan 413: el contrato promete a la vez 500 marcas, 2 KB de `crudo` y 1 MB (la interfaz real, con ~500 B por `crudo`, usa 373 KB por lote); aclararlo en el contrato.
**Sin CONFLICTO:** nada de lo observado contradice una decisión de decisions.md. Grupos 1-7 en PASS; 2 FAIL menores (F-AS3-1, F-AS3-2), 3 observaciones, 0 bloqueados. La documentación de TRUST_PROXY se confirma tal cual: con una subred de confianza que contiene al cliente, o con `TRUST_PROXY=1` y el backend alcanzable sin proxy, el `X-Forwarded-For` falso sí elude la lista (la documentación ya lo advierte).

### [2026-10-21] orquestador — Fase 3 de asistencia: síntesis de revisión y pruebas; ronda de correcciones en curso
**Quién escribió qué:** coder (migración 013, ingesta, llaves, simulador, docs) → code-notes.md; revisor (APROBADO CON CORRECCIONES MENORES, 0 críticos) → reviews.md; tester (db-init real ×2, llaves por API 170/170, contrato v1 punto por punto, lote de ejemplo de la interfaz 21/21, 134 mil marcas ficticias en 268 envíos, nginx real con TRUST_PROXY 48/48, concurrencia/rotación/revocación/caída de BD, vinculación) → tests.md.
**Causa del test intermitente (encontrada por ambos, descartada la hipótesis del EPIPE):** `ingesta.test.js:762` parte la llave base64url por `_`; 1/64 de las llaves empiezan con `_` y el test falla. Es un defecto del test, no del endpoint.
**Correcciones aprobadas por el orquestador (ronda en curso):** arreglo de los tests; límite de tasa por IP antes de tocar la BD; vinculación de `empleado_id` solo dentro del periodo de empleo (evita atribuir marcas viejas si se reutiliza un `numero_nomina`); 415 para charset no UTF-8; rotar una llave ya rotada → 409; ids fuera de rango → 400; aviso al crear llaves sin IP; quitar valores reales del documento local de un test y usar rangos de documentación (192.0.2/198.51.100/203.0.113) en fixtures; precisiones del contrato (límite efectivo 500 marcas o 1 MB, `id_externo` como texto de dígitos, tiempo de la carga histórica: ~4-5 min por el tope de 60 envíos/min).
**Hechos medidos:** carga de ~134 mil marcas = 243 s (232 s de esperas por el tope de 60/min); con numero_nomina duplicado ninguna marca se vincula (regla vigente: duplicado no se vincula); tras corregir, `/marcas/revincular` vinculó 111 610 y dejó 22 360 huérfanas de 25 códigos (coincide con los 25 códigos sin empleado en BioTime).
**Sin verificar:** Traefik (solo nginx), varias réplicas (el límite de tasa es por proceso), GoTrue real, la IP real y la latencia de la interfaz, datos reales de `numero_nomina`.
**Datos de la interfaz:** lote de ejemplo real (forma exacta del sink) guardado en el scratchpad y probado: 5 marcas, atípica incluida, aceptadas; reenvío = duplicadas.

### [2026-10-21] orquestador — Fase 3 de asistencia (ingesta con llave) LISTA PARA GO/NO-GO
**Cerrado y verificado:** correcciones de la revisión y las pruebas aplicadas; jest 54/54 suites (1724 tests) en verde, eslint 0 errores; el coder corrió la suite completa 3 veces y `ingesta.test.js` aislado 20 veces sin fallos; 29 mutantes nuevos, 29 detectados; Postgres real 36/36 en lo nuevo y 74/74 de regresión. Revisor: APROBADO CON CORRECCIONES MENORES (corregidas). Tester: 0 críticos ni altos.
**Resultado final:** `POST/GET /api/asistencia/ingesta/*` con `X-Api-Key` (SHA-256 + comparación en tiempo constante; formato `rhk_<8hex>_<43 b64url>`); administración de llaves en `/api/asistencia/llaves` (solo `rh_admin`/`super_admin`; llave en claro solo al crear; rotar solo una vez por llave); límite 60 envíos/min por llave y límite de rechazos por IP antes de consultar la BD (429 sin tocar la BD; efecto colateral: bloquea toda petición de esa IP en la ventana, aun con llave válida); `TRUST_PROXY` seguro; vinculación de `empleado_id` por `numero_nomina` único dentro del periodo de empleo (America/Mexico_City); charset no UTF-8 → 415; simulador y guías en `docs/asistencia/`.
**Cambios de comportamiento a vigilar:** nómina duplicada = marcas huérfanas hasta corregir los datos; límite por IP (cuidado con un proxy sin `TRUST_PROXY`: todas las peticiones compartirían IP); `vincularHuerfanas` evalúa todas las huérfanas en cada llamada (sin probar con millones).
**Sin verificar:** Traefik (solo nginx), varias réplicas (límite de tasa por proceso), GoTrue real, IP y latencia reales de la interfaz, datos reales de `numero_nomina`, `supabase/postgres` 17 tras la última ronda (la migración no cambió).
**Despliegue (pendiente de OK del humano):** staging en `prometeo` (IMAGE_TAG, `supabase-db-init` aplica 012 y 013, variables `TRUST_PROXY` y límites, crear la primera llave con `ips_permitidas` de la interfaz), y avisar a la sesión biotime-34 con la URL base. La llave se entrega al humano por gestor de contraseñas, nunca por chat.

### [2026-10-21] orquestador — Revisión (solo lectura) de la ruta de red de staging para la ingesta; recomendación de configuración
**Petición (humano):** "la conexión es por la red interna y la intranet sí pasa por Traefik; revisa, valida y recomienda la mejor configuración".
**Hallazgos verificados en el servidor de staging (solo lectura):** (1) `staging.rayhsa.net` resuelve a **Cloudflare** (IPs públicas) tanto desde el servidor como desde la máquina de desarrollo; (2) existen los contenedores `cloudflare_tunnel` (cloudflared) y `traefik` v3.6; Traefik solo tiene el entrypoint `web` (:80), **no publica ningún puerto en el host** (modo red `proxy`) y su proveedor Docker usa la red `proxy`; (3) el frontend de staging enruta `Host(staging.rayhsa.net)` por Traefik → nginx del frontend (`/api/` → backend) → backend, o sea **3 saltos más Cloudflare**; (4) desde la red de desarrollo, el host interno del servidor no tiene abiertos los puertos 80/443/4000/4001/8080. **Conclusión:** la única entrada a la intranet de staging es el túnel de Cloudflare. Una interfaz que llame por `staging.rayhsa.net` saldría a Internet y volvería por el túnel: el backend **no vería su IP interna** (y la cabecera que lleva la IP real es `CF-Connecting-IP`, que Express no usa y Traefik con `trustedIPs` por defecto no propaga en `X-Forwarded-For`), así que la **lista de IP permitidas con la IP interna no funcionaría** por ese camino.
**Recomendación del orquestador:** puerta de ingesta DEDICADA por la red interna, sin pasar por Cloudflare/Traefik/nginx: (a) el backend abre un segundo listener (`INGESTA_PORT`, p. ej. 4010) que sirve SOLO las rutas de ingesta; (b) el compose lo publica únicamente en la IP interna del servidor (`INGESTA_PUBLISH=<ip-interna>:4010:4010` en el `.env.<entorno>`, no versionado); (c) `TRUST_PROXY` vacío, así `req.ip` es la IP real de la interfaz y la lista de IP permitidas funciona; (d) en el puerto público (`/api/asistencia/ingesta/*` por el túnel) las rutas de ingesta responden 404 (variable `INGESTA_SOLO_PUERTO_DEDICADO`), de modo que nada de la ingesta se alcanza desde Internet; (e) la interfaz usa `http://<ip-interna>:4010/api/asistencia/ingesta/marcas`; (f) opcional, defensa en profundidad: regla `DOCKER-USER` del host que solo permita la IP de la interfaz hacia ese puerto (requiere administrador del servidor). Riesgo aceptado: HTTP sin TLS dentro de la red interna (la llave viaja en claro por la LAN; se mitiga con IP permitida, rotación y revocación); TLS interno exigiría cambiar el Traefik compartido (otros servicios) y no se recomienda ahora.
**Alternativas descartadas:** (2) publicar el puerto del backend existente en la IP interna y bloquear la ingesta en el nginx público: más rápido pero expone toda la API del backend en la LAN y depende de una regla de nginx; (3) usar el túnel de Cloudflare con Cloudflare Access (service token) y lista de IP de Cloudflare: cadena de proxies frágil para `req.ip`, cabecera `CF-Connecting-IP` falsificable desde la red `proxy` y dependencia de la cuenta de Cloudflare.
**Pendiente (humano):** elegir 1 (recomendada), 2 o 3; confirmar la IP interna y el puerto libre del servidor; quién administra el servidor para la regla `DOCKER-USER`.

### [2026-10-21] orquestador — Decisión del humano: puerta de ingesta dedicada por la red interna (opción 1)
**Decisión (humano):** "ok, ok, yo" → (1) **opción 1** (segundo listener dedicado, solo rutas de ingesta, publicado solo en la IP interna del servidor, `TRUST_PROXY` vacío, rutas de ingesta cerradas en el puerto público); (2) **IP interna del servidor = la que usa para entrar por SSH** (`<ip-interna>` en el `.env.staging`, no versionada) y puerto 4010 (verificado libre); (3) **la regla de firewall del host (`DOCKER-USER`) la aplica el propio humano** como administrador del servidor. Esto NO es todavía el OK para desplegar: el despliegue a staging se pide aparte tras revisión y pruebas.
**Alcance (extensión de la Fase 3):** listener secundario en el backend (`INGESTA_PORT`), modo "solo puerto dedicado" para el puerto público (404), publicación en el compose de dev/staging/prod con `INGESTA_BIND` (por defecto loopback), documentación (diagrama de red, regla `DOCKER-USER` para el humano, comprobación desde el PC de la interfaz) y pruebas.

### [2026-10-21] orquestador — OK del humano para desplegar a staging la ingesta de asistencia
**Autorización (humano, directa):** "despliega en staging y dame el comando a ejecutar la regla del firewall". Alcance: **solo staging** (producción no); incluye push de `feat/asistencia-rh`, PR, merge (el build de imágenes solo corre en `main`), respaldo previo, `supabase-db-init` (migraciones 012 y 013) y la publicación del puerto dedicado en la IP interna. Condición del orquestador: esperar a que el coder termine el listener dedicado, verificar (jest, eslint) y, mientras corre el CI, una revisión corta del cambio; no fusionar si hay hallazgos críticos. La regla `DOCKER-USER` la aplica el humano en el servidor; el orquestador entrega los comandos.

### [2026-10-22] orquestador — Diagnóstico y corrección de la importación de empleados (no aparecían tras la carga)
**Síntoma (humano):** en staging cargó un archivo de empleados; el importador "leyó todas las filas" pero no aparecieron en la lista. Confirmó: fue en staging y el archivo trae fechas (nacimiento/ingreso).
**Diagnóstico (orquestador, verificado):** (1) staging sigue con 1 empleado: no se insertó ninguna fila; (2) el importador (`modules/portal/frontend/components/ImportadorArchivo.jsx`) lee el `.xlsx` sin convertir fechas y las envía como número de serie de Excel (reproducido: `15/01/2024` → `"45305.74958333333"`); PostgreSQL rechaza ese valor como `date` y el backend (`Empleado.importarLote`) descarta la fila como error (también falla `DD/MM/AAAA`); (3) tras importar, `EmpleadoPage`, `PuestosPage` y `CrudPage` llaman `onExito` → `setMostrarImportador(false)` y el modal se cierra antes de que se vea la vista de resultados (insertados/duplicados/errores): el usuario no ve ningún error. El mismo defecto afecta a todos los catálogos que usan el importador.
**Decisión (humano):** GO a la corrección ("ok"). Rama `fix/importador-empleados-fechas`. Alcance: normalizar fechas (serial de Excel, `Date`, `AAAA-MM-DD`, `DD/MM/AAAA`), validar antes de importar y marcar filas con fecha inválida; mantener abierta la vista de resultados; errores por fila con número de fila del archivo, motivo claro y descarga de errores; backend con validación estricta de fechas y longitudes, mensajes sin texto de PostgreSQL, detalle de duplicados; pruebas con `.xlsx` real y fechas en varias zonas horarias. El despliegue a staging se pide aparte tras revisión y pruebas.

### [2026-10-22] orquestador — OK del humano para desplegar a staging la corrección del importador
**Autorización (humano, directa):** "te doy el ok para desplegar a staging". Alcance: **solo staging**; condición acordada: que las pruebas pasen con la pantalla real de Empleados (el revisor encontró que la recarga de la lista desmonta el importador y borra el resultado: crítico en corrección). Pasos: coder termina → verificación (jest, eslint, build) → tester con la pantalla real y Postgres real → commit, push, PR, CI, merge, build de imágenes → respaldo de `empleados`, `puestos`, `departamentos` → `IMAGE_TAG` → `pull` y `up -d` en `prometeo` → verificación → aviso al humano para repetir la carga.

### [2026-10-22] orquestador — Instrucciones del humano: turno Rayhsa a todos los departamentos, plantilla de carga completa y luego Fase 4
**Instrucciones (humano, directas):** (1) "asigna el turno Rayhsa a todos los departamentos"; (2) "ajustar el layout de carga para que llene todos los datos de empleado de acuerdo a su expediente"; (3) "y después lanza la fase 4" (= GO a la Fase 4, después de 1 y 2).
**(1) Estado:** el turno 'Rayhsa' (id 1) y 15 departamentos activos en staging, ninguno con turno. La escritura en la BD de staging por `docker exec` fue **bloqueada por el clasificador de permisos** de la herramienta (escritura remota) y no se ejecutó; no se intentó otra vía. Pendiente: el humano la ejecuta con el comando entregado o autoriza la regla de permiso. Vigencia propuesta: `vigente_desde = 2026-01-01`, abierta. Nota: BioTime tiene también 'Horario logística' (tolerancia de salida 0); Almacén y Reparto podrían ir en 'Logística' (el humano pidió Rayhsa para todos).
**(2) Diseño (orquestador):** la plantilla pasa de 17 columnas a todo el expediente editable (personales, contacto, domicilio, laborales con ubicación y jefe inmediato por número de nómina o CURP, financieros, estatus/baja); fechas en todas las columnas de fecha; validaciones iguales a las del formulario de alta (CURP, RFC, CLABE, teléfonos de 10 dígitos, CP de 5, NSS de 11, estados y bancos de los catálogos) con **advertencias por campo** (la fila entra sin el campo inválido); **modo "crear y actualizar existentes"** (coincidencia por CURP y, si no, por número de nómina; solo las celdas con valor sobrescriben, una celda vacía nunca borra datos; sirve para completar la nómina de los 8 empleados que no la tienen); detección de encabezados sin acentos/mayúsculas con alias y **aviso de columnas ignoradas**; lectura correcta de CSV en UTF-8 y Windows-1252 (acentos); plantilla .xlsx descargable con hoja de instrucciones y hoja de catálogos (puestos, departamentos, ubicaciones, valores permitidos). Fuera de alcance: hijos del expediente, documentos, creación de cuentas de usuario y `UNIQUE` de CURP/nómina.

### [2026-10-22] orquestador — Turno 'Rayhsa' asignado a los 15 departamentos de staging (ejecutado por el humano)
**Qué se hizo:** el humano ejecutó en el servidor de staging el comando entregado (modelo `TurnoAsignacion.asignar('departamento', …)` dentro del contenedor del backend): **15 asignaciones, 0 fallos** — TI, Contabilidad, Capital Humano, Industria, Atención a Cliente, Gerencia, Crédito y Cobranza, Ventas Industria, Ventas Foráneas / Distribución, Mantenimiento, Mercadotecnia, Aux Administrativo, Reparto, Almacén y Compras. Turno 1 'Rayhsa', `vigente_desde = 2026-01-01`, `vigente_hasta = NULL`, `creado_por = NULL`. Ejecutado por el humano (2026-10-22); **sin registro de auditoría** (sin sesión de usuario). La orquestación no pudo ejecutarlo (escritura remota bloqueada por el clasificador de permisos) y entregó el comando corregido (la configuración exporta `{ grupo }`, no el pool).
**Efecto:** los 70 empleados con departamento ya tienen turno efectivo 'Rayhsa'; el empleado sin departamento y los de turno individual quedan sin turno (no hay asignaciones individuales). Pendiente: verificar con la consulta de asignaciones; revisar si Almacén y Reparto deben ir en 'Logística'; la fecha de inicio del análisis sigue pendiente de decisión.

### [2026-10-22] orquestador — Decisiones del humano: análisis desde el 1-sep-2026 y carga histórica solo de 2026
**Decisión (humano, directa):** (1) el análisis de asistencia se calcula **desde el 1 de septiembre de 2026**; (2) la carga histórica de marcas es **solo de 2026** (desde 2026-01-01 00:00 hora de México = 2026-01-01T06:00:00Z hasta el id 1553957; lo anterior —2023 a 2025— no se carga; las 10 marcas de prueba de dic-2023/ene-2024 ya están y se quedan). Se avisó a la sesión del sincronizador (hueco de ids por rango y fecha, sin tocar su cursor).
**Consecuencias de diseño para la Fase 4 (orquestador):**
- Fecha de inicio del análisis configurable (`asistencia_analisis_desde`, valor 2026-09-01); lo anterior se guarda pero no se analiza.
- Las quincenas ya vencidas al activar el motor (1-15 sep, 16-30 sep, 1-15 oct) se calculan en una carga inicial y **quedan abiertas hasta que RH las cierre explícitamente** tras validarlas (hay 8 empleados sin nómina y el histórico de 2026 aún no está completo); el **cierre automático (3 días tras terminar la quincena) rige desde la quincena 16-31 oct** (parámetro `cierre_automatico_desde = 2026-10-16`).
- Empleados **sin `numero_nomina`** (8 hoy) no se pueden relacionar con sus marcas: se marcan `sin_identificador` y NO se analizan (si no, tendrían falta todos los días); aviso visible a RH.
- Un día solo se califica cuando está completo (pasada la salida del turno + margen); mientras tanto `pendiente`. Antes de `fecha_ingreso` y después de `fecha_baja`: no aplica. Sin turno efectivo: `sin_turno` (no es falta).
- La pregunta abierta (el humano la aceptó con "todo ok" a la propuesta, pero no la respondió expresamente): umbral de falta propio de 30 min frente a la ventana de captura de BioTime (150 min). Se mantiene **falta = más de 30 min tarde o sin marca de entrada**; el motor la deja configurable por turno.
- Ejecución periódica (no hay scheduler en el repo): tarea en proceso del backend con candado consultivo de PostgreSQL (una sola ejecución aunque haya réplicas), disparo diferido tras cada ingesta para los días afectados, cada 15 minutos para cierres y re-vinculación, y endpoints manuales para RH; sin dependencias nuevas.

### [2026-10-22] orquestador — Carga de relleno 2026 de la interfaz validada contra la base de staging
**Informe de la interfaz:** `sync --since 2026-01-01 --until-id 1553957`; 54 envíos de 500, todos 200, sin 429; recibidas = insertadas = 26,646; `sin_empleado` 3,295; total_marcas = 39,906.
**Verificado en la base (consulta agregada):** 39,906 marcas; 82 lotes `ok` (28 previos + 54), recibidas = insertadas = 39,906, 0 duplicadas, 0 rechazadas; cursor `ultimo_id_externo = 1567208` sin error; vinculadas 34,649 (= 11,298 previas + 23,351 de esta carga) y sin vincular 5,257 (13.2 %; = 1,962 + 3,295); primera marca de 2026 el 2026-01-05; 3.6-4.6 mil marcas por mes entre enero y octubre; más las 10 de prueba de dic-2023/ene-2024. **Cuadra.**
**Códigos:** 84 distintos; 63 vinculados (= los 63 empleados con nómina); 21 sin vincular: 10 activos en las últimas 2 semanas (candidatos a los 8 empleados sin nómina + 2 personas que no están en la intranet) y 11 inactivos (ex empleados). **La regla `numero_nomina == emp_code` queda validada con datos reales.**
**Pendiente:** RH asigna la nómina a los 8 empleados (plantilla en modo actualizar, en desarrollo) y se re-vincula; la interfaz activa su tarea programada cada 15 min (07-20 h) cuando el humano lo indique.

### [2026-10-22] orquestador — Petición del humano: la plantilla de carga de departamentos incluye turno y cupo de vacaciones
**Petición (humano, directa):** "ajusta la plantilla de carga de los departamentos para que se incluya el turno asignado y el número de cupos para vacaciones".
**Diseño (orquestador):** se suma al trabajo de la rama `feat/importador-expediente` (mismo componente `ImportadorArchivo` y mismo concepto de "crear y actualizar existentes"). Columnas nuevas de departamentos: `cupo_vacaciones` (entero ≥ 1; vacío = no cambia / default 1 al crear), `turno` (nombre de un turno activo, sin distinguir acentos/mayúsculas) y `turno_vigente_desde` (fecha opcional; por omisión, hoy en México). Reglas del turno: sin asignación → se crea; mismo turno vigente → sin cambio; turno distinto → se termina la asignación vigente el día anterior a la nueva fecha y se crea la nueva, con las validaciones y candados del modelo `TurnoAsignacion` (si la nueva fecha no es posterior al inicio de la vigente → error de esa fila: "terminar solo acorta"). Permisos: requiere edición de Departamentos y, para el turno, edición de Turnos (si falta, la columna de turno se ignora con advertencia). Coincidencia por nombre del departamento; una celda vacía nunca borra datos. Auditoría solo con conteos.

### [2026-10-22] [tester] — PARA RESOLVER: Plantilla de carga completa y departamentos (F-IE-1 a F-IE-7); detalle y evidencia en tests.md "Plantilla de carga completa y departamentos"
**PARA RESOLVER F-IE-7 (alto, ya en reviews.md A1-A3; REPRODUCIDOS con HTTP real contra Postgres 16 y backend real, bloquean la carga real de los 71 en modo actualizar):** (A1) en modo actualizar una CURP inválida (17 caracteres) sin nómina, o una nómina con un cero de más (`0700002` vs `700002`), inserta un empleado NUEVO (71 -> 72 -> 73) en vez de rechazar la fila; (A2) un NSS de 10 dígitos se completa con `0` y SOBRESCRIBE un NSS válido (`99000000005` -> `09000000005`), solo con advertencia; (A3) `Estatus=activo` sobre un empleado en baja lo reactiva y deja `fecha_baja` y `motivo_baja` (`activo|2025-06-01|Baja ficticia`), y `Estatus=baja` sin fecha deja `baja|null`. También reproducidos M2 (CURP duplicada preexistente: se actualiza solo el de menor id, sin aviso) y M5 (nombres de departamento que colapsan al normalizar: se escribe solo en el de menor id). Decidir: rechazar como error la fila con identificador presente pero inválido; no sobrescribir NSS/estatus/baja desde el archivo (o exigir confirmación); mitigación mientras tanto: archivo real con Estatus vacío y sin NSS de 10 dígitos. Criterio incumplido: idempotencia/duplicados y no perder datos válidos.
**PARA RESOLVER F-IE-1 (medio, código):** dos importaciones simultáneas con las MISMAS filas en ORDEN DISTINTO se bloquean entre sí (deadlock de PostgreSQL): `POST /empleados/importar` modo actualizar -> 60 de 90 respuestas 500 (63/90 en pg16; `pg_stat_database.deadlocks` +60) y `POST /departamentos/importar` -> 128 deadlocks absorbidos por el SAVEPOINT, con 3 a 9 de 15 filas por importación devueltas como "No se pudo guardar la fila". Mismo orden: 200/200. Sin pérdida de datos (ROLLBACK correcto). Sugerencia: ordenar las filas por clave antes de actualizar o serializar las importaciones con un candado de aplicación (`pg_advisory_xact_lock`, ya propuesto en reviews.md M1). Criterio incumplido: "sin 5xx ni deadlock" (tarea) y estándar de errores/concurrencia.
**PARA RESOLVER F-IE-2 (medio, código; confirma M1 del revisor con evidencia):** `Empleado.asignarJefes` sin candado: dos `POST /empleados/importar/jefes` simultáneos (A->B y B->A) dejan el ciclo escrito en 28 de 40 rondas (supabase 17 y pg16); la protección de ciclos solo vale dentro de una petición. Mismo arreglo que F-IE-1 (candado de aplicación o `FOR UPDATE` de `empleados` en la transacción).
**PARA RESOLVER F-IE-3 (menor, decisión):** "Descargar empleados actuales" corta la fecha ISO a 10 caracteres; si el backend corre en una zona al este de UTC (probado `TZ=Pacific/Auckland`) TODAS las fechas salen un día antes (150 de 2 840 celdas) y al reimportarlas en modo actualizar se sobrescriben sin aviso. México y UTC (el contenedor sin `TZ`) salen bien. Decidir: forzar `TZ` en el backend, o que la API devuelva las fechas `DATE` como `YYYY-MM-DD` (hay precedente en las otras pantallas), o armar el texto con componentes locales del navegador. Mismo punto que M7 del revisor.
**PARA RESOLVER F-IE-4 (menor, decisión):** una celda de fecha de Excel (sin hora) de 4 días de 1939-1950 (`1939-02-05`, `1940-12-09`, `1943-12-16`, `1950-02-12`) se importa un día antes para un usuario con zona `America/Mexico_City` (y `1927-06-10`, `1931-04-30`, `1932-04-01` con `America/Hermosillo` o `Mazatlan`): días con cambio de horario a medianoche; UTC y el resto de las zonas mexicanas actuales: 0 errores (barrido de 63 416 días x 13 zonas). Casi irrelevante para fechas de nacimiento reales, decidir si se acepta o se evita el uso de `Date` (leer los seriales sin convertir). Además, una CLABE guardada como número de 18 dígitos que no empieza en 0 llega con los últimos dígitos perdidos y se acepta sin aviso (`646180157000000001` -> `646180157000000000`); sugerencia: advertir cuando una celda numérica de CLABE/NSS/teléfono pase de 15 dígitos.
**PARA RESOLVER F-IE-5 (menor, UX):** con un 401/403 en el primer lote (p. ej. usuario con Empleados solo de consulta) el resultado marca CADA fila como "Resultado no confirmado (lote 1 de 1): revisa la lista antes de reintentar" aunque el servidor respondió que no procesó nada; el banner superior sí dice "No tienes permiso". Tratar 401/403 (y cualquier 4xx) como respuesta "segura" como ya se hace con 400/413.
**PARA RESOLVER F-IE-6 (menor, código):** `empleado.controller.js` (y `departamento.controller.js`, `auditoriaImportacion.js`) hacen `console.error('[empleados] importar', error)` con el objeto de error de PostgreSQL completo: ante un error SQL de datos (probado con un CHECK temporal) el log del servidor contiene `detail: 'Failing row contains (… CURP, RFC, NSS, nombre …)'`, es decir datos personales en el log. Loguear solo `error.code` y `error.message`. Las respuestas HTTP no filtran nada (verificado en ≈1 500 respuestas).
**Observaciones sin PARA RESOLVER propio (ver tests.md):** una fila sin CURP ni nómina se reinserta en cada reimportación en modo actualizar (incluso de la exportación "actuales"); los ejemplos de la plantilla de departamentos usan nombres reales (`Contabilidad` cupo 2, `Logística` cupo 3): subir la plantilla sin borrarlos en modo Actualizar cambia esos cupos; una fila con una celda de más de ~80 kb detiene el resto de la importación; sin permiso de Asistencia la hoja Catálogos sale sin turnos y sin aviso.
**Sin CONFLICTO:** nada de lo observado contradice una decisión de decisions.md (celda vacía no borra, `usuario_id` intocable, ciclos y autorreferencia no se asignan, conflictos = error de fila, auditoría solo con conteos, "terminar solo acorta", turno sin permiso = columna ignorada: todo verificado). Grupos 1, 2, 3 (lotes/red/rollback), 4, 6, 7 y 8 en PASS; 7 FAIL (F-IE-1 a F-IE-7), 0 bloqueados.

### [2026-10-22] orquestador — Plantilla de carga completa: revisión NO APROBADA + pruebas con 7 fallos; ronda de correcciones de integridad (bloquea la carga real de los 71)
**Revisor:** NO APROBADO para la carga real en modo actualizar (3 altos verificados: A1 CURP inválida sin nómina se inserta como empleado nuevo (duplicado silencioso) y la nómina con un cero de más duplica; A2 un NSS de 10 dígitos se completa con 0 y pisa el NSS válido; A3 la columna Estatus reactiva/da de baja sin control). **Tester:** F-IE-7 (alto) reprodujo A1-A3 con HTTP real (71 → 72 → 73 empleados); F-IE-1 deadlock entre importaciones simultáneas (60 de 90 respuestas 500, BD íntegra por ROLLBACK); F-IE-2 carrera de ciclos de jefes (28 de 40 rondas); F-IE-3 exportación con fechas desfasadas si el servidor corre al este de UTC; F-IE-4 fechas de 1939-1950 un día antes y CLABE numérica pierde dígitos; F-IE-5 un 403 marca todas las filas como no confirmadas; F-IE-6 el log imprime la fila completa (CURP/RFC/NSS). Lo demás pasó (3195/3195 comprobaciones de actualización de 71 empleados y 15 departamentos; formatos CSV/xlsx 33/33 en Chromium y Firefox; lotes y rollback; permisos y auditoría).
**Decisiones del orquestador (en curso con el coder):** CURP inválida = error de fila; en modo actualizar sin identificador = error, nunca se inserta; nómina que coincide ignorando ceros = posible duplicado (error); coincidencia con varios empleados = error; NSS/CLABE no se completan (advertencia y se omite); en modo actualizar estatus/fecha_baja/motivo_baja se ignoran con advertencia; candado consultivo por importación y filas ordenadas (deadlocks), segunda pasada de jefes bajo el mismo candado con revalidación de ciclos y solo jefes activos; SAVEPOINT por fila; 403 detiene el proceso; fechas de Excel por aritmética de serial (sin Date/TZ); exportación con orden único, fechas en SQL, permiso de lectura y auditoría; log sin datos de la fila; ejemplos de plantilla obviamente ficticios (también CURP y nombres de departamentos).
**Hasta que se corrija y se despliegue NO se debe cargar el archivo real de los 71 en modo actualizar.** Antes de usarlo: respaldo (`scripts/supabase/backup.sh`) y prueba con 5 filas.

### [2026-10-23] [tester] — PARA RESOLVER: pantallas de Asistencia (Fase 5, parte 1), HEAD 461bf58: 3 hallazgos menores; detalle y evidencia en tests.md «Pantallas de administración de Asistencia (Fase 5, parte 1)»
**PARA RESOLVER F-P5T-1 (menor, código/a11y):** la región `<div role="status" aria-live="polite">` del aviso de sincronización (`AsistenciaSincronizacionPage.jsx`) cambia de texto en cada refresco de 60 s («Última comunicación hace 1 min» → «hace 2 min»; 2 mutaciones en ~125 s con reloj real, Chromium y Firefox): un lector de pantalla lo anuncia cada minuto, contra la intención del comentario del código («sin … anunciar cada actualización»). Sugerencia: dejar `aria-live` solo en el texto que cambia de ESTADO (ok/retraso/fuera de horario) y poner el «hace N min» fuera de la región viva (o `aria-live="off"` en el tick automático). Criterio incumplido: accesibilidad (aria-live sin ruido).
**PARA RESOLVER F-P5T-2 (menor, CSS):** a ≤360 px los diálogos de Asistencia terminan 8-13 px por debajo del viewport (`.asi__overlay{padding:.5rem}` de `asistencia.css` sumado a la regla móvil compartida que da altura completa a `.rayhsa-modal`; el modal de Calendario va de 0 a 568 px sin desborde) y los diálogos pequeños (confirmaciones) se estiran a pantalla completa; los botones siguen alcanzables. Además `<summary>` «Ver la lista» (aviso de empleados sin nómina) mide 22 px de alto (< 24 px, WCAG 2.5.8). Decidir si se corrige (quitar el padding del overlay móvil o `max-height: calc(100dvh - 1rem)`; `min-height` de 24 px al summary).
**PARA RESOLVER F-P5T-3 (bajo, decisión):** un rol con `Turnos:consulta` sin `Departamentos:consulta` ve «No tienes permiso…» en la pestaña «Por departamento» de Asignaciones (llama a `GET /api/departamentos`); hoy no tiene impacto porque solo rh_admin y super_admin tienen Turnos y ambos tienen Departamentos. Decidir si la pantalla debe usar un listado de departamentos propio de Asistencia o si se documenta la dependencia.
**Sin CONFLICTO:** nada de lo observado contradice decisions.md (retraso por última comunicación todos los días 07:00-20:00 inclusive, llave en claro solo una vez, rotar solo llaves activas sin vencimiento, exportación sin nombres y con bitácora, terminar con fecha pasada con confirmación: todo verificado). Resultado: sin fallos funcionales ni de seguridad, 3 hallazgos menores/bajos, 0 bloqueados.
### [2026-10-23] orquestador — Despliegue a staging de la plantilla de carga completa (PR #17, merge ad838bd)
**Autorización (humano, directa):** "OK para el despliegue". Solo staging.
**Qué se hizo, en orden:** (1) PR #17 con CI `test` en verde y merge; (2) esperar el build de imágenes del merge (run 39970574487, `headSha` = `ad838bd`); (3) staging (`prometeo`, clon limpio en `0d2b7d8`): respaldo `~/backups-intranet/plantilla-carga-pre-<fecha>.sql` (data-only de empleados, departamentos, puestos, ubicaciones, turnos, turno_departamento, turno_empleado; 28,958 bytes), `git checkout` del SHA, `IMAGE_TAG`, `pull` y `up -d` (sin migraciones nuevas).
**Verificado en staging:** backend y frontend con el tag `ad838bd…`; puerto dedicado de ingesta sigue publicado solo en la IP interna; sitio 200; `/api/empleados`, `/api/empleados/exportar-importacion`, `/api/departamentos` y `/api/empleados/importar` sin sesión → 401; ingesta por el dominio público → 404; datos intactos: 71 empleados, 15 departamentos, 15 turnos de departamento y 40,043 marcas (la interfaz ya ha enviado ~137 marcas más desde la carga de relleno: su ciclo programado parece activo).
**Pendiente (humano):** la carga real de los 71 en modo "Actualizar": respaldo (`scripts/supabase/backup.sh`), prueba con 5 filas, comprobar `insertados = 0`, una importación a la vez, revisar nóminas sin espacios y fechas 1904. Estatus y bajas se hacen desde la pantalla de Empleados.

### [2026-10-23] orquestador — GO del humano a la primera parte de la Fase 5 (pantallas de administración de Asistencia para RH)
**Resultado de la carga real (humano):** la prueba parcial de 5 filas corrió bien; con la plantilla descargada actualizó la información y el importador le informó qué datos no se pudieron actualizar y de quién; lo demás se actualizó correctamente.
**GO (humano, directo):** "tienes el OK para la primera parte de las pantallas de la Fase 5". Alcance (5 pantallas solo para `rh_admin` y `super_admin`, bajo "Asistencia" en el menú de RH): Turnos (ver/crear/editar con horarios, tolerancias, ventanas y descanso), Asignaciones (turno por departamento y por empleado con vigencia e historial; terminar), Marcas (consulta por empleado y fechas, marcas sin vincular y resumen de códigos sin empleado, botón de re-vincular), Sincronización (cursor, último envío, historial de lotes con errores y conteos) y Llaves (crear, rotar, revocar, editar IPs; la llave se muestra una sola vez). Faltan solo endpoints de lectura de marcas y de estado de sincronización por JWT. Trabajo en un árbol aparte (`~/.config/superpowers/worktrees/uliweb/feat-asistencia-pantallas`, rama `feat/asistencia-pantallas`) para no pisar la Fase 4 en curso; ambas ramas se fusionan después (se esperan conflictos solo en `asistencia.routes.js`, `INDEX.md` y `decisions.md`, resolubles con unión).

### [2026-10-23] orquestador — Fase 4: respuestas a las 8 decisiones del coder y revisión NO APROBADA (crítico y alto)
**Las 8 preguntas del coder (reporte del agente, no estaban en memoria) y la respuesta del orquestador:** (1) segundos truncados (08:10:59 puntual, 08:11:00 retardo): aceptado, coherente con la tolerancia por minutos de BioTime; (2) salida temprana fuera de ventana: **cuenta como salida anticipada** si la marca es posterior al fin del descanso (14:00 en 'Rayhsa'); propuesta pendiente de confirmación del humano; (3) los 8 sin nómina y las nóminas repetidas quedan fuera del cálculo hasta que RH los corrija: sí; (4) listas de gestión (sin-identificador, ajustes, parámetros) solo `rh_admin` y `super_admin`; (5) correcciones de marca de RH y permisos por horas: no en esta fase; (6) latencia ~30 min aceptada, barrido completo cada 24 h y botón Recalcular; (7) motor activo en staging y prod desde el primer despliegue: sí; (8) poda de `asistencia_ejecuciones`: sí (retención de 180 días), tarea pequeña posterior.
**Revisor:** NO APROBADO (reviews.md '[2026-10-23] Motor de análisis de asistencia (Fase 4)'): CRÍTICO — una entrada antes de la ventana (06:50 con ventana desde 07:00) se califica `falta` con `salida_sin_entrada`, contra la regla "falta = más de 30 min tarde o sin marca de entrada"; ALTOS — salida temprana fuera de ventana da `incompleta` con 0 minutos, y el planificador no tiene tope duro (una vuelta colgada deja `enCurso` y el candado tomados); MEDIOS — trigger de periodo cerrado sin las columnas del snapshot, conexión retenida 5 s esperando el candado desde la API, `GET /periodos` expone el motivo de reapertura a `rh_empleado`, dos justificaciones activas y anular no revierte, cursor incremental vulnerable a marcas confirmadas tarde, cambios de fechas en vacaciones/permisos ya aprobados fuera del incremental, vacaciones no cubren sábados laborables.
**Decisiones para la corrección:** las marcas anteriores a la ventana de entrada cuentan como entrada (no hay límite inferior salvo la medianoche local); `incompleta` solo con una única marca o última marca dentro del descanso; tope duro del planificador con destrucción de la conexión al vencer; API responde 409 inmediato si hay recálculo en curso; ventana de traslape en el cursor incremental.

### [2026-10-23] orquestador — Decisión del humano: la interfaz sincroniza todos los días (eventos ocasionales en fines de semana y festivos) y correcciones en curso
**Decisión (humano, directa):** "Sí puede haber eventos ocasionales donde el personal checa en esos días, y continúa". Consecuencias: el aviso de retraso de Sincronización rige todos los días en 07:00-20:00 hora de México; se basa en la **última comunicación de la interfaz** (`ultimo_uso` de las llaves activas, que se actualiza también con `GET /estado`) y no en el último lote, porque en un día sin marcas la interfaz no envía. El motor ya cuenta marcas en fines de semana y festivos (el día queda `descanso`/`festivo` pero conserva las marcas en el detalle). Pendiente de diseño futuro: ¿una marca en día no laborable es una "marca en descanso" que RH deba ver? (por ahora solo consta en el detalle).
**Estado:** los testers de ambas ramas se cortaron al cerrarse la sesión anterior; se mandan primero las correcciones a los coders (motor: crítico de entrada temprana, salida temprana, tope duro del planificador y medios; pantallas: P5-1..P5-18 y el cambio del aviso de retraso) y se prueba después el código corregido. GO de la primera parte de la Fase 5: está registrado arriba en este mismo archivo en la rama del motor (entrada 'GO del humano a la primera parte de la Fase 5'); consta para la fusión.

### [2026-10-23] orquestador — Decisión del humano: la comida (1 hora) puede caer entre las 13:00 y las 16:00 y el personal checa al salir y volver de comer
**Decisión (humano, directa):** "el corte a las 2 puede ser salida a comer y puede haber variantes de descanso de una hora para comida en los rangos de 1:00 a 4:00". **Sustituye** la regla provisional del orquestador "salida = última marca posterior al fin del descanso (14:00)".
**Nueva regla del motor (orquestador):** (1) ventana de comida GLOBAL configurable en `asistencia_parametros`: `comida_desde = 13:00`, `comida_hasta = 16:00` y duración de comida = `descanso_min` del turno (60); las marcas dentro de la ventana son **marcas de comida** (salida/regreso de comer), nunca entrada ni salida; (2) entrada = primera marca del día (sin límite inferior), salvo que caiga dentro de la ventana de comida (llegada tardía = falta); (3) salida = última marca posterior a `comida_hasta`: si es anterior a (salida − tolerancia) → `salida_anticipada` con minutos; (4) si la última marca del día cae DENTRO de la ventana de comida (no hay marca posterior a las 16:00) → `incompleta` con la bandera `ultima_marca_en_comida` para que RH la revise o justifique (puede ser salida a comer sin regreso o salida anticipada: no se puede saber); (5) con dos o más marcas en la ventana se calcula la duración de la comida y se guarda en el detalle, y se marca `exceso_comida` si supera `descanso_min` (solo informativo: no cambia el estatus; el humano no pidió penalizarlo); (6) `incompleta` también con una única marca. Los parámetros se editan por `PUT /api/asistencia/parametros` (RH/super_admin); falta una pantalla de parámetros (Fase 5, parte 2). Turnos con comida por turno (en vez de global): fuera de alcance por ahora.

### [2026-10-23] [tester] — PARA RESOLVER: Motor de asistencia Fase 4 (F-M4-1 a F-M4-3); detalle y evidencia en tests.md "Motor de análisis de asistencia (Fase 4) — parcial antes del cambio de regla de comida"
**PARA RESOLVER F-M4-1 (medio, código de pruebas):** la suite de jest es INTERMITENTE por una prueba del propio motor: el caso "importar app.js no activa el planificador aunque el entorno lo pida" de `modules/rh/backend/tests/asistenciaPlanificador.test.js` (`jest.isolateModules` + `jest.doMock('…/storage.service')` + `require('app.js')`) deja en el mismo worker el `storage.service` real en lugar del mock y hace fallar `archivos.storage.test.js` y `adjunto.controller.test.js`. Evidencia: 3/12 corridas completas fallan en `b77c272` SIN carga (5/12 en `47d49f8`); sin ese caso 0/15 (pares) y 0/10 (suite bajo carga); `main` 0/10. No es un problema de carga ni de `{virtual: true}`. Decidir/arreglar: probar el no-arranque leyendo el código fuente como los otros casos, o ejecutarlo en un proceso hijo/`jest.resetModules` limpio. Criterio incumplido: regresión estable (el CI `test` puede salir en rojo al azar).
**PARA RESOLVER F-M4-2 (menor):** al recibir SIGTERM/SIGINT con una vuelta colgada (tabla bloqueada) el proceso sale con código 0 pero la sesión de PostgreSQL que espera el LOCK conserva el candado consultivo 4501 hasta que termine el bloqueo o venza el `statement_timeout`; otra réplica o el contenedor nuevo registra "vuelta omitida" durante ese tiempo. Sugerencia: al vencer los 5 s de espera del apagado, matar la sesión (`pg_terminate_backend`) como hace el tope duro.
**PARA RESOLVER F-M4-3 (menor, decisión):** la migración 014 falla (`db-init` sale con código 3, `could not create unique index uq_asistencia_incidencias_justificacion_activa`) en una BD que ya tenga dos justificaciones activas del mismo empleado y día (posible solo con el build `47d49f8` en desarrollo; en staging/prod no aplica). Decidir si se añade una desactivación previa de duplicados o se acepta.
**Observaciones sin PARA RESOLVER:** `ASISTENCIA_MOTOR_ACTIVO` es insensible a mayúsculas y recorta espacios (`True`, `' true '` encienden) aunque la doc dice "solo `true`"; el apagado del portal tarda hasta ~9,5 s con conexiones keep-alive abiertas (cercano a los 10 s de `docker stop`; comportamiento previo, no del motor); `asistencia_ejecuciones` crece ~35 mil filas/año sin poda (retención de 180 días ya decidida, tarea pendiente). **Los resultados sobre salida temprana/descanso quedaron descartados por el cambio de regla (ventana de comida 13:00-16:00) y deben repetirse sobre el código nuevo.**

### [2026-10-23] [tester] — Fase 4 con la regla de comida: F-M4-1, F-M4-2 y F-M4-3 verificados como corregidos; PARA RESOLVER F-M4-4 (detalle en tests.md "Motor de análisis de asistencia (Fase 4) — regla de comida")
**Verificado en `a08ff00`:** F-M4-1 (jest estable: 18 corridas completas sin carga, todas en verde), F-M4-2 (SIGINT con una vuelta bloqueada: el candado 4501 queda liberado) y F-M4-3 (014 con justificaciones duplicadas: se conserva la más reciente, `exit=0`, idempotente). La regla de comida 13:00-16:00 (inclusive a nivel de minuto; 16:00:59 comida, 16:01 salida con 119 min) cumple la decisión del humano y el doc: 0 diferencias del oráculo propio en 4 028 pares empleado-fecha y 37/37 casos a mano.
**PARA RESOLVER F-M4-4 (menor, código o doc):** al apagar con una vuelta colgada la fila queda `error/tiempo_excedido`, no `error/interrumpida` como dice docs/asistencia/motor-analisis.md sección 4; o el apagado escribe `interrumpida`, o el doc lo aclara. Sin impacto funcional.
**Para el doc (límites conocidos):** un turno cuya salida programada cae dentro de la ventana de comida (p. ej. un sábado 08:00-14:00) queda siempre `incompleta` con `ultima_marca_en_comida`; hoy ningún turno lo es. Y la regla de duplicados (<= 60 s) puede mover una marca de un lado al otro de la frontera (16:00:30 y 16:01:00 son una sola marca: gana la primera, de comida).

### [2026-10-23] orquestador — Fase 4 (motor) y primera parte de la Fase 5 (pantallas de administración): LISTAS PARA GO/NO-GO
**Motor (rama `feat/asistencia-motor`, HEAD `a08ff00`):** revisor NO APROBADO en la primera versión (crítico: entrada anterior a la ventana = falta; altos: salida temprana = incompleta, planificador sin tope duro) → corregido; regla de comida del humano (ventana 13:00-16:00) implementada; tester independiente (oráculo propio) sobre el código final: **0 diferencias en 4,028 días empleado-fecha**, 37/37 casos a mano (incl. 08:02/14:01/15:03/18:05 = puntual con 62 min de comida y `exceso_comida`; 16:00 y 16:00:59 son comida, 16:01 es salida), `PUT /parametros` de comida 41/41, cambio de `comida_hasta` solo recalcula periodos abiertos, tope duro y apagado con vuelta colgada, 409 inmediato, 2 réplicas, caída de BD, db-init real ×2 (pg17 y pg16), migración 014 con duplicados, API por rol 189/189, rendimiento (77 empleados en 0.56 s), jest 18/18 sin carga (68 suites, 2,531 tests; ya no fallan `archivos.storage` ni `adjunto.controller`). Abiertos (menores): F-M4-4 (al apagar con una vuelta colgada la fila queda `error/tiempo_excedido` en vez de `interrumpida`); un turno cuya salida cae dentro de la ventana de comida (p. ej. sábado 08:00-14:00) queda siempre `incompleta` (hoy ningún turno es así); la regla de duplicados de 60 s puede mover una marca a ambos lados de las 16:00. Bajo carga artificial 2/10 corridas de jest fallan por suites de la Fase 3 (`ingesta.test.js` envío 61 → 429 y `servidorIngesta.test.js` ECONNRESET), sensibles al reloj/recursos de este WSL.
**Pantallas (rama `feat/asistencia-pantallas`, HEAD `0758246`):** revisor CON OBSERVACIONES (0 críticos/altos; 8 medios corregidos); tester (frontend real, Chromium y Firefox, Postgres real, db-init real ×2) PASS sin fallos funcionales ni de seguridad y 3 menores corregidos (aria-live estable, diálogos en 320/360 px, pestaña sin permiso de departamentos); jest 64 suites / 2,269 tests.
**Fusión prevista:** (1) PR del motor → CI → merge; (2) pantallas: actualizar con `main` (conflictos esperados solo en `asistencia.routes.js` —conservar ambos bloques de rutas e imports— y `memory/*` —unión—), CI → merge; (3) despliegue conjunto a staging con respaldo; la migración 014 se aplica con el db-init, el planificador queda activo (`ASISTENCIA_MOTOR_ACTIVO=true` en staging) y la primera vuelta calcula del 2026-09-01 a hoy dejando abiertas las quincenas previas al 16-31 oct; los 8 empleados sin nómina quedan `sin_identificador`. Requiere GO/NO-GO de cada rama y OK de despliegue del humano.

### [2026-10-23] orquestador — Despliegue a staging del motor y las pantallas (PR #18 y #19, merge 12be73a) y GO a las pantallas de resultados para RH
**Despliegue (autorizado por el humano: "go al motor, go a las pantallas, fusiona y despliega"):** PR #18 (motor) y PR #19 (pantallas, con `main` incorporado y conflictos resueltos en `asistencia.routes.js` y memoria) con CI en verde y fusionados; imágenes de `12be73a`; respaldo `~/backups-intranet/motor-pantallas-pre-<fecha>.sql` (28 MB); staging con la 014 aplicada, 0 tablas sin RLS, parámetros sembrados (análisis desde 2026-09-01, cierre automático desde 2026-10-16, cierre a 3 días, comida 13:00-16:00), planificador activo (`ASISTENCIA_MOTOR_ACTIVO=true`), puerto dedicado de ingesta intacto, rutas nuevas sin sesión → 401, ingesta por el dominio público → 404.
**Primera vuelta real (2026-10-23):** 3,763 días evaluados, 3,339 guardados, 63 empleados (los 8 sin nómina quedan fuera), 4 quincenas abiertas (01-15 sep, 16-30 sep, 01-15 oct, 16-31 oct). Estatus: puntual 1,665 · descanso 882 · falta 342 · incompleta 197 · retardo 73 · festivo 63 · pendiente 63 · salida_anticipada 54. Sobre 2,331 días laborables evaluados las faltas son 15 %: 290 sin ninguna marca y 52 con marcas (llegada >30 min tarde o marca fuera de lo esperado); 6 empleados con 0 faltas, la mayoría con 1 a 8, y 2 con 32 y 3 con 21-22 (revisar: ¿no checan por su puesto o su código apunta a otra persona?); sin día concentrado (máx. 18 en un día; 199 en sep y 143 en oct); incompletas: 76 por última marca en comida y 114 por una sola marca. Vacaciones, incapacidades y permisos anteriores no estaban capturados en el sistema, por eso aparecen como faltas hasta que RH los registre y recalcule. Las quincenas siguen abiertas: no cerrar hasta validar.
**GO del humano (directo):** "sí, avanza al siguiente paso" = pantallas de RH para ver y validar los resultados. Rama `feat/asistencia-resultados-rh` desde `main` (12be73a). Alcance: Resultados (quincena, empleado, departamento, estatus; resumen y detalle por día con marcas, regla aplicada y cruces; justificar/anular), Periodos (cerrar/reabrir con motivo, recalcular, ajustes pendientes, empleados sin identificador) y Parámetros (comida, cierre, margen); "Mi asistencia" y "Mi equipo" (empleado y jefe) quedan para el paso siguiente.

### [2026-10-28] orquestador — Estado de staging y de las pantallas de resultados para RH; ronda de correcciones
**Pregunta del humano:** "¿ya está aplicado al staging?". **Respuesta verificada (2026-10-28):** staging corre la imagen `12be73a` (motor + pantallas de administración; PR #18 y #19); las **pantallas de Resultados/Periodos/Parámetros** (commit `f9f0ac5`, rama `feat/asistencia-resultados-rh`) **no están publicadas ni desplegadas** (sin PR; revisor CON OBSERVACIONES, 12 medios; el tester se cortó al cerrarse la sesión anterior y se vuelve a lanzar sobre el código corregido).
**Salud del motor en staging tras 5 días:** 459 vueltas, todas `ok` (la última hace minutos); `asistencia_diaria` calculada hasta 2026-10-28 (3,654 filas); las 4 quincenas siguen abiertas (el cierre automático de la 16-31 oct ocurrirá el 2026-11-03: fin 10-31 + 3 días); 40,540 marcas, la última de hoy 14:42 UTC, 35,211 vinculadas (13 % sin vincular: faltan las 8 nóminas); la interfaz usó su llave por última vez hace minutos (planificador de la interfaz activo); vuelta incremental sin errores. `asistencia_ejecuciones` crece ~96 filas/día (la poda de 180 días acordada sigue pendiente).
**Decisiones del orquestador para las correcciones (R2A-2, 1, 3, 15, 12):** cerrar solo si la quincena ya terminó y no tiene días pendientes (409 en el servidor); contadores frescos y `esperados` en el cierre; confirmación reforzada en el servidor para `analisis_desde`, `cierre_automatico_desde` y `dias_cierre`; motivo de reapertura ≥ 10 caracteres; el CSV de resultados conserva nombre y nómina (auditado con solo conteos).

### [2026-10-28] [tester] — PARA RESOLVER: pantallas de resultados, periodos y parámetros de Asistencia (Fase 5, parte 2a), HEAD 7d97c61: F-R2A-T1 (alto) y F-R2A-T2..T6 (bajos); detalle y evidencia en tests.md «Pantallas de resultados, periodos y parámetros de Asistencia (Fase 5, parte 2a)»
**Verificado como corregido (R2A):** cerrar con pendientes o sin terminar → 409 del servidor; contadores frescos y `esperados` (409 `datos_cambiaron`, recarga, carrera con la ingesta real); confirmación reforzada de parámetros en el servidor con atomicidad de la ventana de comida; motivo de reapertura ≥ 10; CSV auditado ANTES de descargar (fail-closed, con fallo simulado y real), tope de 15 000 con última fila y aviso, BOM, CRLF, fórmulas neutralizadas, nombre y nómina; tarjetas fijas y `sin_turno`; rol de marca del servidor = oráculo propio en las 2 424 combinaciones; IDOR de jefe, permisos por rol y campos solo-RH. Sin fallos de lógica del motor ni de seguridad.
**PARA RESOLVER F-R2A-T1 (ALTO, funcional, bloquea llegar a las pantallas desde el menú):** las 3 entradas nuevas («Resultados», «Periodos», «Parámetros») quedan recortadas e inalcanzables con el mouse para super_admin y rh_admin. `.rayhsa .sidebar-subitems.abierto { max-height: 600px; overflow: hidden }` (`modules/portal/frontend/styles/rayhsa-system.css:155`; igual en `:1656` y `globales.css:170`) y el submenú de RH pasó de 589 px (15 enlaces, cabían) a 700 px (18 enlaces): los 3 últimos quedan fuera del recorte a cualquier alto de ventana (a 1280x900 el encabezado de Tickets cubre el centro de «Resultados»). Evidencia: `out/menu_recorte.txt` («nuevo … OCULTOS por el recorte: [Resultados, Periodos, Parámetros]»; base 12be73a: []), `out/sidebar_1280x900.png`, axe `target-size`. Solo se llega por URL (o forzando el foco con Tab). Hay que subir/quitar el límite (p. ej. `max-height` suficiente o por contenido) y comprobar el drawer móvil (`rayhsa-system.css:1656`). Criterio incumplido: las pantallas aprobadas para RH deben ser alcanzables desde el menú.
**PARA RESOLVER F-R2A-T2 (bajo):** `GET /api/asistencia/ejecuciones` sin `limite` responde 400 («limite debe ser un entero entre 1 y 100») aunque `pantallas-resultados.md` dice «(1-100, 20)»: en `ejecuciones()` el valor por omisión es el número 20 y la validación exige `typeof limite === "string"`. La pantalla siempre envía `?limite=20`, por eso no se ve. Corregir el código o el doc.
**PARA RESOLVER F-R2A-T3 (bajo, accesibilidad):** axe `label-content-name-mismatch` (WCAG 2.5.3, serious) en las celdas de la cuadrícula: `aria-label="viernes 2026-10-16: Falta. 31 min de retardo"` no contiene el texto visible «Vie 16 ✗ Falta 31 min» (Chromium y Firefox). Hacer que el nombre accesible empiece por el texto visible o sea igual a él.
**PARA RESOLVER F-R2A-T4 (bajo, decisión de permisos):** (a) el doc y el menú (`requiere`) dicen que `Empleados:edicion` basta para LEER las 3 pantallas, pero la API las protege con `LEER` (`Asistencia:consulta`) además de `RH_LECTURA`: un rol con SOLO `Empleados:edicion` ve las 3 entradas y las pantallas pero todas las llamadas dan 403 («No tienes permiso para esta pantalla o acción»); un rol con `Empleados:edicion` + `Asistencia:consulta` sí queda en solo lectura. Decidir si la API acepta `Empleados:edicion` sin `Asistencia:consulta` o el menú/doc exigen ambos. (b) Un rol con `Empleados:edicion` + `Asistencia:consulta` pero sin `Departamentos:consulta` ve en Resultados el aviso «No tienes permiso para esta pantalla o acción» (por `GET /departamentos` 403) y el filtro de departamento deshabilitado (no existe hoy: rh_admin y super_admin tienen ambos).
**PARA RESOLVER F-R2A-T5 (bajo):** el CSV de detalle filtra en el cliente lo que baja de `/resultados` SIN filtro: con un rango de 61 días y 591 empleados (33 657 días > 15 000) y un solo empleado filtrado exporta 26 de sus 58 días y dice «Archivo INCOMPLETO… Acota el periodo o los filtros»: filtrar no ayuda, solo acotar fechas. No es silencioso (la última fila lo dice) pero el consejo engaña; pasar el filtro al servidor o corregir el texto (el coder lo dejó como R2A-6 parcial).
**PARA RESOLVER F-R2A-T6 (bajo, herramienta):** `scripts/asistencia/verificar-motor.js` quedó obsoleto con el contrato nuevo: 3 de sus 125 comprobaciones fallan en pg16 (`POST /periodos/:id/cerrar` sin `esperados` → 400 y `PUT /parametros` de `dias_cierre` sin `confirmacion`), las otras 122 pasan; `docs/asistencia/motor-analisis.md` §8 lo recomienda como verificación reproducible. Actualizar el script (enviar `esperados` y `confirmacion`).
**Regresión (atribución):** jest completo x 12: 6 corridas 72/72 (2 855 tests) y 6 con UN test caído cada una, ninguno en los archivos nuevos: 5 x `servidorIngesta.proceso.test.js` (Fase 3, espera de 4 s del log) y 1 x `ingesta.test.js` (envío 61 → 429, sensible al reloj, ya documentado). Es PREEXISTENTE y propio de este WSL: el árbol `12be73a` ya desplegado falla igual en 5 de 10 corridas (4 x `servidorIngesta.proceso`, 1 x `asistenciaOrquestacion.test.js`); `servidorIngesta.proceso` aislado pasa 15/15 en HEAD y 14/15 en base. eslint 0 errores, build OK.
**Observaciones sin PARA RESOLVER:** subir `analisis_desde` no retira los días ya guardados de las quincenas abiertas anteriores a esa fecha (conservan su resultado y se siguen mostrando, mientras el texto de impacto dice «dejan de calificarse»); las marcas de días de descanso, festivo, vacaciones o permiso se muestran «No usada» (no «Comida»).

### [2026-10-28] orquestador — Pantallas de resultados para RH: el tester halló el menú recortado (ALTO) y otros 5; última ronda de correcciones
**Tester (HEAD 7d97c61, Chromium y Firefox, motor activo, oráculo propio):** PASS en todo lo funcional: motor vs oráculo 3,497 días (pg17 y pg16) sin diferencias, rol de cada marca 2,424/2,424, Resultados y detalle (56/56 ×2 y 59/59 ×6 en México/UTC/Auckland), justificar/anular 28/28, cerrar con 409 en el servidor y `esperados` con carreras con la ingesta real (76/76 y 34/34), reabrir/ajustes/bitácora, lo cerrado no cambia y lo abierto sí, 409 de candado y carrera cierre-recálculo 12/12, parámetros 30/30 ×2, CSV auditado antes de descargar 22/22 ×4, permisos por rol/IDOR/campos solo RH, menú de otros módulos idéntico, 591 empleados (motor 5.7 s; Resultados carga en 0.5-1 s). FALLOS: **F-R2A-T1 (ALTO)** `max-height: 600px` del submenú oculta 'Resultados', 'Periodos' y 'Parámetros' (el submenú pasó de 589 a 700 px: solo se llega por URL); T2 `GET /ejecuciones` sin `limite` da 400; T3 axe en celdas de la cuadrícula; T4 la API exige además `Asistencia:consulta` y un rol con solo `Empleados:edicion` ve las pantallas y recibe 403; T5 CSV de detalle filtrado exporta de menos; T6 `verificar-motor.js` obsoleto (3/125).
**Estabilidad de jest:** en 12 corridas completas 6 pasaron 72/72 y 6 tuvieron un test caído (5 en `servidorIngesta.proceso.test.js`, 1 en `ingesta.test.js`); el árbol ya desplegado `12be73a` falla igual en 5 de 10 corridas, es decir preexistente; se endurece en esta ronda (el CI de GitHub sí pasó en todas sus corridas).
**Decisión:** corregir T1-T6 y endurecer esos tests antes del PR; después un re-test corto. Despliegue solo con el OK del humano.

### [2026-10-28] [tester] — PARA RESOLVER: re-test del menú y layout global (HEAD 80c0a71): F-R2B-T1 (medio-bajo) y F-R2B-T2 (bajo); detalle en tests.md «Re-test: menú y layout global, permisos y CSV filtrado»
**Verificado como corregido:** F-R2A-T1 (los 8 enlaces de Asistencia visibles y alcanzables con clic y teclado a 1280x720, 1280x500, 1024, 768, 641, 640 y 360; todos los demás grupos y módulos sin cambios frente a `12be73a`, 60 capturas lado a lado: idénticas píxel a píxel a 360, 1024 y 1280), T2 (`/ejecuciones` sin límite = 20), T3 (axe `label-content-name-mismatch` 0), T4 (Empleados:edicion solo lee, escrituras 403, sin avisos de permiso), T5 (`POST /resultados/dias`, CSV filtrado exacto con aviso «N de TOTAL»). jest 11/12 y un flaky preexistente; eslint 0 errores; build OK.
**PARA RESOLVER F-R2B-T1 (medio-bajo, funcional):** a 641-768 px el menú se abre con el botón nuevo pero no se puede cerrar sin navegar: `.responsive-overlay.is-open` solo existe en la media query de ≤ 640 px (`display: none` en 641-768), el drawer abierto tapa el botón (que solo abre: `onMenu={() => setSidebarAbierto(true)}` en `main.jsx`) y no hay manejador de Escape. Mostrar el overlay también en 641-768 (o alternar el estado con el botón / cerrar con Escape). Evidencia: `t13` en Chromium y Firefox («overlay display=none, clic fuera lo cierra=false» a 641, 700 y 768) y captura `out/cap_chromium_drawer_700.png`.
**PARA RESOLVER F-R2B-T2 (bajo, visual):** la animación de CIERRE de los grupos del menú se perdió con `Subitems`: pasa de 700 a 0 px en un cuadro (0 intermedios) en Chromium y Firefox; el base animaba (589 → 0 en 0,25 s, 13 cuadros) y la apertura sí anima. No es funcional. Evidencia `out/anim_base_vs_nuevo.txt`. Observación: ni el base ni el nuevo respetan `prefers-reduced-motion`.
