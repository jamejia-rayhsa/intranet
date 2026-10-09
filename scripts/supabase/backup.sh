#!/usr/bin/env bash
# Respaldo del stack Supabase self-hosted (base de datos + objetos de Storage).
#
# Genera  $BACKUP_DIR/supabase-<UTC>/  con:
#   db.dump[.enc]       pg_dump -Fc de la base `postgres` (esquemas public, auth y storage)
#   storage.tar.gz[.enc] contenido del volumen de objetos de Storage (con xattrs)
#   MANIFEST            fecha, imágenes, conteos de filas y sha256 de cada archivo
#
# Uso:   bash scripts/supabase/backup.sh
# Variables (todas opcionales):
#   BACKUP_DIR                 destino (default ./backups/supabase)
#   BACKUP_RETENCION_DIAS      borra respaldos propios más viejos (default 14; 0 = no borrar)
#   BACKUP_PASSPHRASE          si se define, cifra db.dump y storage.tar.gz (AES-256-CBC, PBKDF2)
#   SUPABASE_DB_CONTAINER      default intranet_supabase_db
#   SUPABASE_STORAGE_CONTAINER default intranet_supabase_storage
#   SUPABASE_STORAGE_VOLUME    default <proyecto compose del contenedor Storage>_supabase_storage_data
#                              (se detecta del montaje de /var/lib/storage; solo se fuerza si hace falta)
#   BACKUP_HELPER_IMAGE        imagen con GNU tar para leer el volumen (default debian:bookworm-slim)
# Staging: SUPABASE_DB_CONTAINER=... según `docker ps` (los container_name son fijos en el compose).
#
# Nunca imprime contraseñas. Sale con código != 0 ante cualquier fallo y no deja un
# respaldo a medias (se construye en un directorio temporal y se renombra al final).
set -euo pipefail
umask 077

BACKUP_DIR="${BACKUP_DIR:-./backups/supabase}"
BACKUP_RETENCION_DIAS="${BACKUP_RETENCION_DIAS:-14}"
DB_CT="${SUPABASE_DB_CONTAINER:-intranet_supabase_db}"
ST_CT="${SUPABASE_STORAGE_CONTAINER:-intranet_supabase_storage}"
# Superusuario real de la imagen supabase/postgres (entra por socket local sin password).
# El rol `postgres` no puede desactivar triggers del sistema ni leer todo.
DB_SUPERUSER="${SUPABASE_DB_SUPERUSER:-supabase_admin}"
PSQL=(docker exec -i "$DB_CT" psql -U "$DB_SUPERUSER" -h /var/run/postgresql -d postgres -X -v ON_ERROR_STOP=1)

log() { printf '[backup] %s\n' "$*" >&2; }
die() { printf '[backup] ERROR: %s\n' "$*" >&2; exit 1; }

[[ "$BACKUP_RETENCION_DIAS" =~ ^[0-9]+$ ]] || die "BACKUP_RETENCION_DIAS debe ser un entero"
command -v docker >/dev/null || die "docker no está disponible"
command -v sha256sum >/dev/null || die "sha256sum no está disponible"
if [[ -n "${BACKUP_PASSPHRASE:-}" ]]; then
  command -v openssl >/dev/null || die "BACKUP_PASSPHRASE definida pero falta openssl"
fi

for ct in "$DB_CT" "$ST_CT"; do
  [[ "$(docker inspect -f '{{.State.Running}}' "$ct" 2>/dev/null || true)" == "true" ]] \
    || die "el contenedor $ct no existe o no está corriendo"
done

# Volumen de objetos: el que está montado en /var/lib/storage del contenedor Storage
VOLUME="${SUPABASE_STORAGE_VOLUME:-$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/var/lib/storage"}}{{.Name}}{{end}}{{end}}' "$ST_CT")}"
[[ -n "$VOLUME" ]] || die "no se pudo determinar el volumen de Storage (define SUPABASE_STORAGE_VOLUME)"
docker volume inspect "$VOLUME" >/dev/null 2>&1 || die "el volumen $VOLUME no existe"
# Se necesita GNU tar (las imágenes de Supabase solo traen busybox, que no copia xattrs).
HELPER_IMAGE="${BACKUP_HELPER_IMAGE:-debian:bookworm-slim}"
if ! docker image inspect "$HELPER_IMAGE" >/dev/null 2>&1; then
  log "descargando imagen auxiliar $HELPER_IMAGE (solo la primera vez)..."
  docker pull -q "$HELPER_IMAGE" >/dev/null || die "no se pudo descargar $HELPER_IMAGE; define BACKUP_HELPER_IMAGE con una imagen local con GNU tar"
fi
docker run --rm --network none --entrypoint tar "$HELPER_IMAGE" --version 2>/dev/null | grep -q 'GNU tar' \
  || die "$HELPER_IMAGE no tiene GNU tar (BACKUP_HELPER_IMAGE)"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FINAL="$BACKUP_DIR/supabase-$STAMP"
TMP="$BACKUP_DIR/.incompleto-$STAMP"
[[ ! -e "$FINAL" ]] || die "ya existe $FINAL"
mkdir -m 700 "$TMP"
trap 'rc=$?; if [[ $rc -ne 0 ]]; then rm -rf "$TMP"; log "FALLÓ (código $rc); se descartó el respaldo incompleto"; fi' EXIT

# Cifrado opcional: lee stdin, escribe stdout. La frase viaja por entorno, no por argumentos.
cifrar() { openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass env:BACKUP_PASSPHRASE; }
SUF=""
[[ -n "${BACKUP_PASSPHRASE:-}" ]] && SUF=".enc"

# ---- (a) Base de datos ---------------------------------------------------------------
# schema_migrations/migrations se excluyen: las crean y mantienen las imágenes de GoTrue y
# Storage al arrancar; restaurarlas de otra versión rompería sus migraciones.
log "volcando base de datos (esquemas public, auth, storage)..."
DUMP="$TMP/db.dump$SUF"
if [[ -n "$SUF" ]]; then
  docker exec "$DB_CT" pg_dump -U "$DB_SUPERUSER" -h /var/run/postgresql -d postgres -Fc \
    -n public -n auth -n storage \
    --exclude-table-data='auth.schema_migrations' --exclude-table-data='storage.migrations' \
    | cifrar > "$DUMP"
else
  docker exec "$DB_CT" pg_dump -U "$DB_SUPERUSER" -h /var/run/postgresql -d postgres -Fc \
    -n public -n auth -n storage \
    --exclude-table-data='auth.schema_migrations' --exclude-table-data='storage.migrations' \
    > "$DUMP"
fi
[[ -s "$DUMP" ]] || die "el volcado quedó vacío"

# ---- (b) Objetos de Storage ------------------------------------------------------------
# Contenedor desechable, volumen en solo lectura. --xattrs: el backend `file` guarda
# content-type y cache-control como atributos extendidos; sin ellos los objetos pierden su tipo.
log "empaquetando volumen de Storage ($VOLUME)..."
OBJ="$TMP/storage.tar.gz$SUF"
TAR_CMD=(docker run --rm --network none -v "$VOLUME":/data:ro --entrypoint tar "$HELPER_IMAGE"
         --xattrs --xattrs-include='user.*' --numeric-owner -czf - -C /data .)
if [[ -n "$SUF" ]]; then "${TAR_CMD[@]}" | cifrar > "$OBJ"; else "${TAR_CMD[@]}" > "$OBJ"; fi
[[ -s "$OBJ" ]] || die "el archivo de Storage quedó vacío"

# ---- (c) MANIFEST ---------------------------------------------------------------------
log "generando MANIFEST..."
conteo() { # $1 = esquema.tabla  -> número o "n/a"
  "${PSQL[@]}" -tA -c "SELECT CASE WHEN to_regclass('$1') IS NULL THEN 'n/a' ELSE (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM $1', false, true, '')))[1]::text END" </dev/null
}
TABLAS=(public.usuarios public.empleados public.roles public.noticias public.tickets
        public.recibos_nomina public.expediente_documentos auth.users auth.identities
        storage.buckets storage.objects)
{
  echo "# MANIFEST de respaldo Supabase (no editar: restore.sh lo verifica)"
  echo "formato=1"
  echo "fecha_utc=$STAMP"
  echo "host=$(hostname)"
  echo "cifrado=$([[ -n "$SUF" ]] && echo aes-256-cbc-pbkdf2 || echo no)"
  echo "db_container=$DB_CT"
  echo "storage_container=$ST_CT"
  echo "storage_volume=$VOLUME"
  for ct in "$DB_CT" "$ST_CT" "${SUPABASE_AUTH_CONTAINER:-intranet_supabase_auth}"; do
    if docker inspect "$ct" >/dev/null 2>&1; then
      echo "imagen.$ct=$(docker inspect -f '{{.Config.Image}}' "$ct")"
    fi
  done
  echo "[conteos]"
  for t in "${TABLAS[@]}"; do echo "$t=$(conteo "$t")"; done
  echo "[sha256]"
  (cd "$TMP" && sha256sum db.dump"$SUF" storage.tar.gz"$SUF")
} > "$TMP/MANIFEST"

chmod 600 "$TMP"/*
mv "$TMP" "$FINAL"
trap - EXIT

# ---- (d) Retención --------------------------------------------------------------------
# Solo directorios con el formato de nombre propio; nunca toca otra cosa de BACKUP_DIR.
if [[ "$BACKUP_RETENCION_DIAS" -gt 0 ]]; then
  while IFS= read -r viejo; do
    [[ -n "$viejo" && "$viejo" != "$FINAL" ]] || continue
    [[ "$(basename "$viejo")" =~ ^supabase-[0-9]{8}T[0-9]{6}Z$ ]] || continue
    log "retención: borrando $(basename "$viejo")"
    rm -rf -- "$viejo"
  done < <(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d \
             -name 'supabase-????????T??????Z' -mtime +"$BACKUP_RETENCION_DIAS")
fi

log "OK: $FINAL ($(du -sh "$FINAL" | cut -f1))"
[[ -n "$SUF" ]] || log "AVISO: sin cifrar (define BACKUP_PASSPHRASE); el respaldo contiene hashes y datos de RH"
printf '%s\n' "$FINAL"
