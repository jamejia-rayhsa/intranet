# Supabase self-hosted — runbook

La intranet corre sobre un stack Supabase propio (sin servicio en la nube): **Postgres**, **Auth (GoTrue)** y **Storage**. Este documento es el runbook operativo. Las decisiones y sus motivos están en `memory/decisions.md` (ADR del 2026-10-08, Fases 0-6).

## 1. Arquitectura

```
                  navegador
                      |
              +-------v--------+      mismo origen: / , /api , /auth/v1 , /storage/v1
              |  nginx / Vite  |      (staging/prod: nginx del frontend; dev: proxies de Vite)
              +--+-----+----+--+
     /api        |     |    |  /auth/v1 (quita el prefijo)       /storage/v1 (quita el prefijo
     v           |     |    v                                     y envía X-Forwarded-Prefix)
 +---------+     |     | +--------------+                         v
 | backend |     |     | | supabase-auth|                  +-----------------+
 | Express |-----|-----|>|  (GoTrue)    |                  | supabase-storage|--> volumen
 +----+----+  admin API  +------+-------+                  +--------+--------+    supabase_storage_data
      |   service key           |                                    |
      |  (subir/firmar/borrar)--|------------------------------------+
      v                         v                                    v
 +---------------------------------------------------------------------+
 |  supabase-db  (Postgres 17, base `postgres`)  volumen supabase_db_data |
 |  esquemas: public (app) | auth (GoTrue) | storage (metadatos)        |
 +---------------------------------------------------------------------+
   supabase-rest (PostgREST): solo dependencia interna de Storage, nunca expuesto
   supabase-studio + supabase-meta: solo con --profile admin, en 127.0.0.1:54323
```

Puntos clave (verificados en `docker-compose.supabase.yml`, `config/nginx/*.conf` y `modules/portal/backend/services/*`):

- No hay gateway (Kong/Envoy): nginx enruta `/auth/v1/` y `/storage/v1/`.
- `supabase-db` es el **único** Postgres de la app (base `postgres`, usuario `postgres`).
- El backend **solo acepta tokens de GoTrue** (HS256 con `SUPABASE_JWT_SECRET`, `aud=authenticated`). No existe login casero ni registro público: las cuentas las crea un administrador desde el portal.
- Las contraseñas viven solo en GoTrue. `usuarios.hash_password` queda en desuso (no se borra todavía).
- Archivos: el backend sube con la service key y entrega **URL firmada de 300 s** (`GET .../:id/url`), con descarga forzada. Buckets: `tickets-adjuntos`, `rh-expedientes`, `rh-recibos` (privados) y `noticias` (público). Recibos y expedientes: solo el empleado dueño o RH; tickets: solicitante, técnico asignado o administrador. El backend crea los buckets solo al arrancar.
- RLS deny-all en `public` y sin privilegios para `anon`/`authenticated` (migración `modules/portal/backend/migrations/004-rls-deny-all.sql`): el único acceso a datos de la app es el backend.
- Imágenes con versión fijada (ver `docker-compose.supabase.yml`): `supabase/postgres`, `supabase/gotrue`, `postgrest/postgrest`, `supabase/storage-api`, `supabase/postgres-meta`, `supabase/studio`.

## 2. Arranque por entorno

`docker-compose.supabase.yml` no se levanta solo: lo incluyen los compose de cada entorno con `include:`.

| Entorno | Comando |
|---|---|
| dev | `docker compose -f docker-compose.dev.yml --env-file .env.dev up -d` (incluye también `docker-compose.supabase.dev.yml`, que publica la BD en `127.0.0.1:5432`) |
| staging | `docker compose -f docker-compose.staging.yml --env-file .env.staging up -d` |
| prod | `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d` |
| Studio (opcional) | añadir `--profile admin`; abre `http://127.0.0.1:54323` (por túnel SSH/VPN en servidores). Sin gateway solo funcionan el editor de tablas y SQL; los paneles Auth/Storage no. |

Orden interno: `supabase-db` -> `supabase-db-init` (one-shot: carga `config/database/init.sql` solo si no existe `public.usuarios`, y siempre aplica migraciones idempotentes `004`, `005` y `007`) -> `supabase-auth` y `supabase-storage` -> backend. El backend espera a que `db-init` termine con éxito.

Variables: plantilla en `.env.supabase.example` (se añaden al `.env.<entorno>`). `POSTGRES_DB` del backend debe ser `postgres`.

## 3. Secretos

```bash
bash scripts/supabase/generar-secretos.sh >> .env.staging   # imprime líneas listas para el .env
```

Genera `POSTGRES_PASSWORD` (hex, URL-safe: va dentro de URLs de GoTrue/Storage), `SUPABASE_JWT_SECRET`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (JWT firmados con ese secreto, 10 años) y `PG_META_CRYPTO_KEY`.

- **Nunca reutilices** los secretos de `.env.dev` en staging/prod. Los `.env.staging`/`.env.prod` están en `.gitignore`; guárdalos en un gestor de secretos y respáldalos aparte de los datos.
- Solo la **anon key** llega al navegador (pública por diseño), junto con el flag de Microsoft: el contenedor del frontend la lee **al arrancar** de `SUPABASE_ANON_KEY` y `AZURE_AD_ENABLED` y genera `/config.js` (`config/nginx/40-config-js.sh`); en desarrollo se usan `VITE_SUPABASE_ANON_KEY`/`VITE_MS365_LOGIN`. La imagen es la misma para todos los entornos (también la del CI). La service role key y el JWT secret solo los ven backend, GoTrue, PostgREST y Storage.
- En staging el frontend es una imagen publicada (`scripts/staging/publicar-ghcr.sh` lee `SUPABASE_ANON_KEY`): si cambia la anon key hay que **republicar la imagen del frontend**.
- `SUPABASE_PUBLIC_URL` es el origen público (sin slash final) desde el que el navegador llega a `/auth/v1` y `/storage/v1`; en dev es `http://localhost:3000` (proxy de Vite).

## 4. Migración desde el Postgres anterior

Procedimiento ejecutado con éxito sobre el entorno de desarrollo (contenedor viejo `intranet_postgres_dev`, base `intranet_dev`). El volumen viejo `intranet_postgres_data_dev` **no se toca**: sirve de plan B.

1. **Volcar solo datos del contenedor viejo** (esquema nuevo lo pone `init.sql`):
   ```bash
   docker start intranet_postgres_dev          # si está detenido
   docker exec intranet_postgres_dev pg_dump -U postgres -d intranet_dev \
     --data-only --column-inserts --disable-triggers > datos_viejos.sql
   docker stop intranet_postgres_dev            # libera el puerto 5432 (ver Troubleshooting)
   ```
2. **Levantar solo `supabase-db` y `supabase-db-init`** (crean el esquema y RLS):
   ```bash
   docker compose -f docker-compose.dev.yml --env-file .env.dev up -d supabase-db supabase-db-init
   docker logs intranet_supabase_db_init | tail      # debe terminar en "[db-init] listo"
   ```
3. **Vaciar y cargar en UNA transacción, como `supabase_admin`** (con `postgres` falla con `permission denied: RI_ConstraintTrigger ... is a system trigger`; `supabase_admin` es el superusuario real y entra por socket local sin contraseña):
   ```bash
   TABLAS=$(docker exec intranet_supabase_db psql -U supabase_admin -h /var/run/postgresql -d postgres -tAc \
     "SELECT string_agg(format('%I', tablename), ', ') FROM pg_tables WHERE schemaname='public'")
   { echo "TRUNCATE TABLE $TABLAS RESTART IDENTITY CASCADE;"; cat datos_viejos.sql; } \
     | docker exec -i intranet_supabase_db psql -U supabase_admin -h /var/run/postgresql -d postgres \
         -1 -v ON_ERROR_STOP=1
   ```
   Si algo falla no queda nada a medias. Revisa antes del corte que no haya valores más largos que `init.sql` en `empleados.clabe/nss/infonavit/fonacot` (18/11/20/20).
4. **Levantar el resto** (`up -d` completo) y **migrar usuarios a GoTrue**. Los scripts van **dentro de la imagen del backend** (`/app/scripts`) y se ejecutan en la red del compose (GoTrue y Storage no se publican), sin necesitar el repositorio en el servidor. Prueba siempre primero con `--dry-run`:
   ```bash
   docker compose -f docker-compose.dev.yml --env-file .env.dev run --rm --no-deps \
     backend \
     node scripts/migrar-usuarios-supabase.js --dry-run
   ```
   `scripts/migrar-usuarios-supabase.js` (también `npm run db:migrar-usuarios-supabase`): importa los hashes bcrypt tal cual (**nadie resetea contraseña**); usuarios `ms365` se crean en GoTrue sin contraseña y ya vinculados (`auth_uid`); en su primer login con Microsoft, GoTrue asocia la identidad de Azure a ese usuario por correo; usuarios locales sin hash se omiten (un admin debe resetearles la contraseña); es idempotente y sale con 1 si hubo errores. Opciones: `--dry-run`, `--only=<correo>`, `--limit=N`.
5. **Migrar archivos a Storage**: `scripts/migrar-archivos-storage.js` (`npm run db:migrar-archivos-storage`) con `--dry-run` primero; opciones `--limit=N`, `--tabla=<nombre>`. Lee de `UPLOADS_DIR` (default `./uploads`), no borra el origen, es idempotente y sale con 1 si hay faltantes. En **staging/prod** el volumen `uploads_data` se monta `:ro` y nace **vacío**: copia ahí los archivos viejos antes de migrar (`docker cp <contenedor_viejo>:/app/uploads/. <dir>` y de ahí al volumen).
6. **Verificar**:
   ```bash
   # conteos por tabla: comparar contra el contenedor viejo
   docker exec intranet_supabase_db psql -U supabase_admin -h /var/run/postgresql -d postgres -c \
     "SELECT (SELECT count(*) FROM public.usuarios) usuarios, (SELECT count(*) FROM auth.users) auth_users,
             (SELECT count(*) FROM storage.objects) objetos"
   # secuencias: la siguiente fila no debe chocar con un id existente
   docker exec intranet_supabase_db psql -U supabase_admin -h /var/run/postgresql -d postgres -c \
     "SELECT last_value FROM usuarios_id_seq; SELECT max(id) FROM usuarios"
   ```
   `auth.users` debe igualar a los usuarios activos con contraseña o `ms365`; inicia sesión con un usuario real.

## 5. Microsoft / Azure

El botón de Microsoft está apagado por defecto. Para activarlo:

1. En Azure Portal (Entra ID, single-tenant) registra el redirect URI **`https://<host>/auth/v1/callback`** (en desarrollo `http://localhost:3000/auth/v1/callback`).
2. En el `.env.<entorno>` (en desarrollo, `.env.dev.local`: `.env.dev` está versionado, no pongas ahí el secreto): `AZURE_AD_ENABLED=true`, `AZURE_AD_TENANT_ID`, `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`. `AZURE_AD_ENABLED` decide también si el frontend muestra el botón (lo lee al arrancar el contenedor: basta recrearlo, sin reconstruir la imagen). `GOTRUE_EXTERNAL_AZURE_URL` es solo `https://login.microsoftonline.com/<tenant>`, **sin `/v2.0`**.
3. Todo usuario debe existir antes en GoTrue **y vinculado** (`usuarios.auth_uid`): el registro público está apagado (`SUPABASE_DISABLE_SIGNUP=true`) y el backend autoriza solo por `auth_uid`. Lo crea un administrador (panel, alta de empleado) o `scripts/migrar-usuarios-supabase.js`.

**Cómo se identifica a un usuario de Microsoft:** en el primer login, GoTrue asocia la identidad `azure` al usuario de GoTrue que ya tiene ese correo (ese es el único punto donde el correo importa; debe coincidir con el correo de Microsoft). A partir de ahí el backend resuelve la fila local por `auth_uid`, nunca por correo (ver ADR de la Fase 6 sobre por qué se eliminó la vinculación por correo del middleware).

**Estado:** probado en desarrollo con un usuario real (2026-10-09): GoTrue creó la identidad `azure` y la asoció al usuario existente. Observado en `auth.identities`/`auth.users`: la identidad `email` del usuario migrado tiene `identity_data.email_verified = false` aunque `raw_user_meta_data.email_verified = true`, y la identidad `azure` tiene ambos en `true`. Como el backend ya no depende de `email_verified`, no hace falta hacer nada con esa diferencia. Pendiente de probar: staging/prod con sus propias URIs.

## 6. Respaldos y restauración

Operar Supabase por cuenta propia hace del respaldo una responsabilidad del equipo. Scripts: `scripts/supabase/backup.sh` y `scripts/supabase/restore.sh` (probados de extremo a extremo, ver 6.4).

### 6.1 Qué se respalda

`backup.sh` crea `$BACKUP_DIR/supabase-<AAAAMMDDTHHMMSSZ>/` (carpeta 700, archivos 600) con:

| Archivo | Contenido |
|---|---|
| `db.dump` | `pg_dump -Fc` de la base `postgres`, esquemas `public`, `auth` y `storage`, como `supabase_admin` (sin `auth.schema_migrations` ni `storage.migrations`: las gestionan las imágenes) |
| `storage.tar.gz` | volumen de objetos (`/var/lib/storage`), leído en solo lectura con un contenedor desechable (GNU tar, conserva xattrs: el tipo de contenido de cada objeto vive ahí) |
| `MANIFEST` | fecha, imágenes, conteos de filas de tablas clave y sha256 de cada archivo |

Variables: `BACKUP_DIR` (default `./backups/supabase`), `BACKUP_RETENCION_DIAS` (default 14; borra **solo** carpetas con el nombre `supabase-<fecha>`; 0 desactiva), `BACKUP_PASSPHRASE` (cifra con `openssl enc -aes-256-cbc -pbkdf2`; los archivos quedan `.enc`), `SUPABASE_DB_CONTAINER` / `SUPABASE_STORAGE_CONTAINER` / `SUPABASE_STORAGE_VOLUME` (defaults de dev: `intranet_supabase_db`, `intranet_supabase_storage` y el volumen montado en `/var/lib/storage` del contenedor Storage), `BACKUP_HELPER_IMAGE` (default `debian:bookworm-slim`, se descarga la primera vez; las imágenes de Supabase solo traen busybox, cuyo `tar` no copia xattrs). `backups/` está en `.gitignore`: contiene hashes y datos de RH, **cífralo** (sin `BACKUP_PASSPHRASE` el script avisa).

```bash
bash scripts/supabase/backup.sh                               # dev, sin cifrar
BACKUP_PASSPHRASE="$(cat /root/.frase-respaldo)" BACKUP_DIR=/srv/respaldos/supabase \
  SUPABASE_DB_CONTAINER=<contenedor_db> SUPABASE_STORAGE_CONTAINER=<contenedor_storage> \
  bash scripts/supabase/backup.sh
```

Códigos de salida: 0 ok; distinto de 0 ante cualquier fallo (no deja un respaldo a medias: se construye en `.incompleto-*` y se renombra al final). Nunca imprime contraseñas. Los nombres de contenedor son fijos en el compose (`intranet_supabase_*`); en staging/prod revisa `docker ps` por si el entorno los prefija.

### 6.2 Restaurar

```bash
bash scripts/supabase/restore.sh [--yes] backups/supabase/supabase-20261009T044604Z
# si está cifrado: BACKUP_PASSPHRASE=... bash scripts/supabase/restore.sh ...
```

Es **destructivo**: reemplaza public/auth/storage y el volumen de objetos. Pide escribir `RESTAURAR` (sin terminal exige `--yes`). Antes verifica los sha256 del `MANIFEST`. Funciona en un stack **nuevo o existente**.

**Estrategia que funciona (descubierta probando):**
1. El stack destino debe haber arrancado completo al menos una vez (db + db-init + auth + storage), porque las imágenes crean sus esquemas y tablas de migraciones. Se restauran **solo datos**.
2. Se detienen `auth` y `storage` durante la operación (y se reinician).
3. En una sola transacción y como `supabase_admin`: `TRUNCATE ... RESTART IDENTITY CASCADE` de las tablas de public/auth/storage (menos las tablas de migraciones) + `pg_restore --data-only --disable-triggers -f -` canalizado a `psql -1`. Con `postgres` no funciona (no puede desactivar triggers del sistema).
4. Se vacía el volumen de Storage y se extrae el tar con `--xattrs`.
5. Se comparan los conteos con el `MANIFEST`; si difieren, sale con error.

Las contraseñas de los usuarios viajan dentro de `auth.users` (bcrypt): tras restaurar, cada usuario entra con su contraseña. Si el stack nuevo usa otro `SUPABASE_JWT_SECRET`, las sesiones abiertas se invalidan (inician sesión de nuevo); no se pierde nada más.

### 6.3 Programarlo

cron (diario 02:30, conserva 14 días; `/root/.supabase-backup.env` con `BACKUP_DIR=...` y `BACKUP_PASSPHRASE=...`, chmod 600):
```cron
30 2 * * * cd /opt/intranet && set -a && . /root/.supabase-backup.env && set +a && bash scripts/supabase/backup.sh >> /var/log/supabase-backup.log 2>&1
```
systemd timer (`/etc/systemd/system/supabase-backup.service` y `.timer`):
```ini
[Service]
Type=oneshot
WorkingDirectory=/opt/intranet
Environment=BACKUP_DIR=/srv/respaldos/supabase
EnvironmentFile=/root/.supabase-backup.env      # BACKUP_PASSPHRASE=... (chmod 600)
ExecStart=/usr/bin/bash scripts/supabase/backup.sh
[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true
[Install]
WantedBy=timers.target
```
Recomendaciones: **copia fuera del host** (otro servidor/almacenamiento, p. ej. `rclone`/`rsync` tras cada respaldo; un respaldo solo en el mismo disco no sirve ante falla de disco); permisos 700/600 y propietario dedicado; guarda la frase de cifrado y los `.env` en un gestor de secretos **separado** (sin ellos un respaldo cifrado es irrecuperable); alerta si el cron falla o el respaldo más reciente tiene más de 26 h; **prueba la restauración periódicamente** (mensual) en un stack desechable con `COMPOSE_PROJECT_NAME` distinto, nunca sobre producción.

### 6.4 Prueba de extremo a extremo realizada

Con un proyecto aislado (`-p ibk`): se creó un usuario en GoTrue con contraseña, un bucket privado con un objeto de 300 KB, filas en `public.usuarios`; se hizo un respaldo cifrado y otro sin cifrar; se destruyó el proyecto completo (`down -v`) y se levantó uno vacío; `restore.sh` lo restauró. Resultado: el usuario inicia sesión con su contraseña (y una incorrecta se rechaza), conteos idénticos (`public.usuarios` 8, `auth.users` 1, `auth.identities` 1, `storage.buckets` 1, `storage.objects` 1), el objeto descargado por URL firmada tiene el mismo sha256 y `content-type`, y la secuencia de `usuarios` continúa (siguiente id 9). También se probó: sin `BACKUP_PASSPHRASE` o con una incorrecta el restore se niega, sin `--yes` ni terminal se niega, y la retención borra solo carpetas `supabase-<fecha>` antiguas.

## 7. Rotación de claves

- **`SUPABASE_JWT_SECRET`**: invalida todos los tokens. Hay que regenerar también `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` (están firmadas con ese secreto), actualizar el `.env`, y recrear `supabase-auth`, `supabase-rest`, `supabase-storage`, `backend` **y `frontend`** (la anon key se lee al arrancar el contenedor: no hace falta reconstruir ni republicar la imagen). **Todos los usuarios deben iniciar sesión de nuevo.**
- **`POSTGRES_PASSWORD`**: cambia la contraseña de los roles internos (`supabase_auth_admin`, `supabase_storage_admin`, `authenticator`, ...) con `ALTER ROLE` como `supabase_admin`, y el `.env`; recrear los servicios. Es URL-safe obligatoria (hex).
- **Secreto de Azure**: solo `AZURE_AD_CLIENT_SECRET` y recrear `supabase-auth`.
- Registra la fecha de cada rotación y haz un respaldo antes.

## 8. Actualización de imágenes

Las versiones están fijadas en `docker-compose.supabase.yml`. Para actualizar: lee las notas de la versión, **haz un respaldo**, cambia la etiqueta de una imagen a la vez (db primero requiere cuidado: cambios de mayor de Postgres no son un simple cambio de etiqueta), `docker compose ... pull && up -d`, revisa los logs de migraciones de GoTrue/Storage y repite la verificación de la sección 9. Tras actualizar, haz otro respaldo (el `MANIFEST` guarda las versiones usadas).

## 9. Monitoreo mínimo

- `docker ps` y `docker inspect -f '{{.State.Health.Status}}' <contenedor>`: db (`pg_isready`), auth (`/health`), rest (`postgrest --ready`) y storage (`/status`) tienen healthcheck.
- Endpoints: `GET /auth/v1/health` y `GET /storage/v1/status` por el origen público deben dar 200.
- Revisa: edad y tamaño del último respaldo, espacio en disco de los volúmenes `supabase_db_data` y `supabase_storage_data`, `docker logs intranet_supabase_auth` (errores de SMTP/Azure), y que el backend arranque sin el aviso de buckets no creados.

## 10. Troubleshooting (trampas reales encontradas)

| Síntoma | Causa y solución |
|---|---|
| Roles internos sin contraseña (p. ej. `supabase_storage_admin`) | El `roles.sql` oficial falla en `supabase_functions_admin` (lo crea `webhooks.sql`, omitido) y se detiene. Se usa la versión corregida `config/supabase/db/roles.sql`; solo corre en el **primer** arranque de un volumen nuevo. |
| GoTrue: `must be owner of function uid` | La imagen crea `auth.uid/role/email` como `postgres`; GoTrue las necesita propias. Ya se reasignan a `supabase_auth_admin` en `roles.sql`. |
| Storage "unhealthy" | El healthcheck con `localhost` resuelve a `::1` y Storage escucha en IPv4: usar `127.0.0.1` (ya está así). |
| `permission denied: RI_ConstraintTrigger ... is a system trigger` al cargar/restaurar | Usaste el rol `postgres`. Usa `supabase_admin` por socket local (`docker exec ... psql -U supabase_admin -h /var/run/postgresql`). |
| `port is already allocated` / `bind: address already in use` en 5432 | El contenedor Postgres viejo (`intranet_postgres_dev`) sigue corriendo. `docker stop intranet_postgres_dev` y vuelve a levantar. |
| Un contenedor queda sin red tras un `up` fallido | Recréalo: `docker compose ... up -d --force-recreate --no-deps <servicio>`. |
| `db-init` con `could not translate host name "supabase-db"` | Mismo origen: `up` fallido a medias dejó `supabase-db` sin red. `--force-recreate --no-deps supabase-db` y relanza `supabase-db-init`. |
| No llegan correos de invitación/recuperación | SMTP sin configurar (`SMTP_*` vacíos). Las altas por admin funcionan igual (`SUPABASE_EMAIL_AUTOCONFIRM=true`); la recuperación de contraseña por correo requiere SMTP. |
| Archivos viejos no aparecen en staging/prod | El volumen `uploads_data` nace vacío y se monta `:ro`: copia ahí los archivos antes de `migrar-archivos-storage.js`. Las filas legadas (`/uploads/...`) responden 409 hasta migrarse. |
| URL firmada responde 400/403 ("invalid signature") | Storage firma con la ruta original: nginx debe quitar `/storage/v1` **y** enviar `X-Forwarded-Prefix /storage/v1` (y Storage `REQUEST_ALLOW_X_FORWARDED_PATH=true`). Revisa `config/nginx/*.conf` si pones otro proxy delante. |
| Usuario válido en GoTrue pero 403 en la API | Existe en GoTrue y no en `public.usuarios` (o está inactivo): el backend autoriza por la fila local. |
| El login ya no funciona tras rotar claves | Esperado (ver sección 7): reiniciar sesión; si falla, la anon key del frontend (variable `SUPABASE_ANON_KEY` del contenedor; recrearlo) no coincide con el nuevo secreto: reconstruir. |
| Login con Microsoft: "No se ha encontrado ninguna página web" en `login.microsoftonline.com/<tenant>/v2.0/oauth2/v2.0/authorize` | `GOTRUE_EXTERNAL_AZURE_URL` terminaba en `/v2.0`: GoTrue ya añade `/oauth2/v2.0/...`, así que la ruta salía duplicada. La URL base debe ser solo `https://login.microsoftonline.com/<tenant>` (corregido en `docker-compose.supabase.yml`; recrear `supabase-auth`). |
| Restauración: "falta la tabla auth.users" | El stack destino no ha arrancado completo: levanta db, db-init, auth y storage antes de restaurar. |

### `npm test` se llevó mi volumen de datos de desarrollo
`docker-compose.test.yml` compartía nombre de proyecto (`intranet`) y servicio (`postgres`) con el compose de desarrollo, y Compose "recrea" el contenedor viejo `intranet_postgres_dev` como `intranet_postgres_test` **heredando su volumen de datos**. Ya no ocurre porque el compose de tests declara `name: intranet-test`. Si una instalación antigua ve un contenedor `intranet_postgres_test` con el volumen `intranet_postgres_data_dev`, verifique los datos sobre una copia (nunca arrancando el contenedor) antes de borrarlo.

