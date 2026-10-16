---
name: decisions
description: ADRs del proyecto — decisiones de arquitectura con fecha y autor
type: project
---

# Decisiones de Arquitectura

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
   - MBA3: `POST /solicitudes/:id/sincronizar-mba3` (stub — retorna 501 con mensaje pendiente)
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
   - Endpoint `POST /solicitudes/:id/sincronizar-mba3` retorna `{ exito: false, mensaje: 'Integración MBA3 pendiente de especificación de API' }`
   - Comentario en el código indica los campos que se mapearán cuando llegue la documentación
   - Estado `enviada_mba3` no se activa en el stub

9. **MenuDinamico.jsx — agregar SUB_RUTAS comercial**
   ```js
   comercial: [
     { path: '/comercial', label: 'Dashboard', opcion: null },
     { path: '/comercial/creditos', label: 'Solicitudes de Crédito', opcion: 'Solicitudes de Crédito' },
   ]
   ```

10. **Auditoría** — `registrarAccion(req, 'comercial', 'solicitudes_credito', id, accion, previo, nuevo)` en crear, actualizar y cambiar estado

**Restricciones aceptadas:**
- MBA3 no implementado (spec en PDF no legible)
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
