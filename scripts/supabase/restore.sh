#!/usr/bin/env bash
# Restaura un respaldo hecho con backup.sh en un stack Supabase NUEVO o existente.
# DESTRUCTIVO: reemplaza los datos de public, auth y storage y el volumen de objetos.
#
# Uso:   bash scripts/supabase/restore.sh [--yes] <directorio-de-respaldo>
#   --yes   no pide confirmación (automatización / pruebas)
# Variables: las mismas de backup.sh (SUPABASE_DB_CONTAINER, SUPABASE_STORAGE_CONTAINER,
#   SUPABASE_STORAGE_VOLUME, SUPABASE_AUTH_CONTAINER, BACKUP_HELPER_IMAGE) y BACKUP_PASSPHRASE
#   si el respaldo está cifrado.
#
# ESTRATEGIA (probada de extremo a extremo; ver docs/supabase.md):
#  1. El stack destino debe haber arrancado al menos una vez completo (db + db-init + auth +
#     storage): las imágenes crean los esquemas auth/storage y sus tablas de migraciones. Por eso
#     se restauran SOLO DATOS (nada de DROP/CREATE de esquemas ajenos).
#  2. Se detienen auth y storage durante la operación (se reinician al terminar).
#  3. En UNA transacción y como `supabase_admin` (el rol `postgres` no puede desactivar triggers
#     del sistema): TRUNCATE ... RESTART IDENTITY CASCADE de las tablas de public/auth/storage
#     (salvo auth.schema_migrations y storage.migrations) y carga de datos con
#     `pg_restore --data-only --disable-triggers`. Si algo falla, no queda nada a medias.
#  4. Se vacía el volumen de objetos y se extrae el tar.gz conservando xattrs (content-type).
#  5. Se comparan los conteos de filas con el MANIFEST.
set -euo pipefail
umask 077

DB_CT="${SUPABASE_DB_CONTAINER:-intranet_supabase_db}"
ST_CT="${SUPABASE_STORAGE_CONTAINER:-intranet_supabase_storage}"
AUTH_CT="${SUPABASE_AUTH_CONTAINER:-intranet_supabase_auth}"
DB_SUPERUSER="${SUPABASE_DB_SUPERUSER:-supabase_admin}"
PSQL=(docker exec -i "$DB_CT" psql -U "$DB_SUPERUSER" -h /var/run/postgresql -d postgres -X -v ON_ERROR_STOP=1)

log() { printf '[restore] %s\n' "$*" >&2; }
die() { printf '[restore] ERROR: %s\n' "$*" >&2; exit 1; }

YES=0; DIR=""
for a in "$@"; do
  case "$a" in
    --yes|-y) YES=1 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    -*) die "opción desconocida: $a" ;;
    *) [[ -z "$DIR" ]] || die "solo se acepta un directorio"; DIR="$a" ;;
  esac
done
[[ -n "$DIR" ]] || die "uso: restore.sh [--yes] <directorio-de-respaldo>"
[[ -d "$DIR" ]] || die "no existe el directorio $DIR"
DIR="$(cd "$DIR" && pwd)"
[[ -f "$DIR/MANIFEST" ]] || die "falta $DIR/MANIFEST (¿es un respaldo de backup.sh?)"
command -v docker >/dev/null || die "docker no está disponible"

# ---- Archivos y cifrado ------------------------------------------------------------------
SUF=""
if [[ -f "$DIR/db.dump.enc" ]]; then SUF=".enc"; fi
DUMP="$DIR/db.dump$SUF"; OBJ="$DIR/storage.tar.gz$SUF"
[[ -f "$DUMP" && -f "$OBJ" ]] || die "faltan db.dump$SUF o storage.tar.gz$SUF en $DIR"
if [[ -n "$SUF" ]]; then
  [[ -n "${BACKUP_PASSPHRASE:-}" ]] || die "el respaldo está cifrado: define BACKUP_PASSPHRASE"
  command -v openssl >/dev/null || die "falta openssl"
fi
descifrar() { openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_PASSPHRASE; }
leer() { # $1 = archivo -> stdout en claro
  if [[ -n "$SUF" ]]; then descifrar < "$1"; else cat "$1"; fi
}

# ---- Integridad ----------------------------------------------------------------------
log "verificando sha256 del MANIFEST..."
sed -n '/^\[sha256\]$/,$p' "$DIR/MANIFEST" | tail -n +2 > "$DIR/.sha256.tmp"
[[ -s "$DIR/.sha256.tmp" ]] || { rm -f "$DIR/.sha256.tmp"; die "el MANIFEST no tiene sección [sha256]"; }
if ! (cd "$DIR" && sha256sum -c --quiet .sha256.tmp); then
  rm -f "$DIR/.sha256.tmp"; die "los archivos no coinciden con el MANIFEST (respaldo corrupto o alterado)"
fi
rm -f "$DIR/.sha256.tmp"
if [[ -n "$SUF" ]]; then
  descifrar < "$DUMP" > /dev/null 2>&1 || die "BACKUP_PASSPHRASE incorrecta"
fi

# ---- Destino ------------------------------------------------------------------------
for ct in "$DB_CT" "$ST_CT"; do
  docker inspect "$ct" >/dev/null 2>&1 || die "no existe el contenedor $ct"
done
[[ "$(docker inspect -f '{{.State.Running}}' "$DB_CT")" == "true" ]] || die "$DB_CT no está corriendo"
VOLUME="${SUPABASE_STORAGE_VOLUME:-$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/var/lib/storage"}}{{.Name}}{{end}}{{end}}' "$ST_CT")}"
[[ -n "$VOLUME" ]] || die "no se pudo determinar el volumen de Storage (SUPABASE_STORAGE_VOLUME)"
HELPER_IMAGE="${BACKUP_HELPER_IMAGE:-debian:bookworm-slim}"
if ! docker image inspect "$HELPER_IMAGE" >/dev/null 2>&1; then
  log "descargando imagen auxiliar $HELPER_IMAGE..."
  docker pull -q "$HELPER_IMAGE" >/dev/null || die "no se pudo descargar $HELPER_IMAGE (BACKUP_HELPER_IMAGE)"
fi

# El esquema destino debe existir (el stack tiene que haber arrancado completo al menos una vez)
for t in public.usuarios auth.users auth.identities storage.buckets storage.objects; do
  ok=$("${PSQL[@]}" -tA -c "SELECT to_regclass('$t') IS NOT NULL")
  [[ "$ok" == "t" ]] || die "en el destino falta la tabla $t: arranca el stack completo (db, db-init, auth, storage) antes de restaurar"
done

echo "Respaldo:  $DIR" >&2
sed -n '/^fecha_utc=/p;/^imagen\./p' "$DIR/MANIFEST" | sed 's/^/           /' >&2
echo "Destino:   base en $DB_CT, objetos en volumen $VOLUME" >&2
echo "Esto REEMPLAZARÁ todos los datos de public, auth y storage y el contenido de $VOLUME." >&2
if [[ $YES -ne 1 ]]; then
  [[ -t 0 ]] || die "sin terminal interactiva: usa --yes para confirmar"
  read -r -p "Escribe RESTAURAR para continuar: " resp
  [[ "$resp" == "RESTAURAR" ]] || die "cancelado"
fi

# ---- Detener servicios que escriben en la base/volumen ---------------------------------
REINICIAR=()
for ct in "$AUTH_CT" "$ST_CT"; do
  if [[ "$(docker inspect -f '{{.State.Running}}' "$ct" 2>/dev/null || true)" == "true" ]]; then
    log "deteniendo $ct..."
    docker stop "$ct" >/dev/null
    REINICIAR+=("$ct")
  fi
done
reiniciar() {
  for ct in "${REINICIAR[@]}"; do log "iniciando $ct..."; docker start "$ct" >/dev/null || true; done
}
trap 'rc=$?; reiniciar; if [[ $rc -ne 0 ]]; then log "FALLÓ (código $rc)"; fi' EXIT

# ---- Base de datos -----------------------------------------------------------------------
log "restaurando base de datos (una transacción)..."
TRUNCATE_SQL=$("${PSQL[@]}" -tA -c "
  SELECT 'TRUNCATE TABLE ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' RESTART IDENTITY CASCADE;'
  FROM pg_tables
  WHERE schemaname IN ('public','auth','storage')
    AND NOT (schemaname = 'auth' AND tablename = 'schema_migrations')
    AND NOT (schemaname = 'storage' AND tablename = 'migrations');")
[[ -n "$TRUNCATE_SQL" ]] || die "no se encontraron tablas que vaciar"
{
  printf '%s\n' "$TRUNCATE_SQL"
  leer "$DUMP" | docker exec -i "$DB_CT" pg_restore --data-only --disable-triggers -f -
} | "${PSQL[@]}" -1 -q -o /dev/null

# ---- Objetos de Storage --------------------------------------------------------------------
log "restaurando objetos de Storage en $VOLUME..."
leer "$OBJ" | docker run --rm -i --network none -v "$VOLUME":/data --entrypoint sh "$HELPER_IMAGE" -ec \
  'find /data -mindepth 1 -delete && tar --xattrs --xattrs-include="user.*" --numeric-owner -xzf - -C /data'

reiniciar
REINICIAR=()
trap - EXIT

# ---- Verificación de conteos -------------------------------------------------------------
log "esperando a que Storage y Auth respondan..."
for ct in "$AUTH_CT" "$ST_CT"; do
  for _ in $(seq 1 30); do
    est=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$ct" 2>/dev/null || echo ausente)
    [[ "$est" == "healthy" || "$est" == "running" ]] && break
    sleep 2
  done
done

FALLOS=0
while IFS='=' read -r tabla esperado; do
  [[ "$esperado" == "n/a" ]] && continue
  real=$("${PSQL[@]}" -tA -c "SELECT CASE WHEN to_regclass('$tabla') IS NULL THEN 'n/a' ELSE (xpath('/row/c/text()', query_to_xml('SELECT count(*) AS c FROM $tabla', false, true, '')))[1]::text END" </dev/null)
  if [[ "$real" == "$esperado" ]]; then
    printf '[restore]   %-28s %s OK\n' "$tabla" "$real" >&2
  else
    printf '[restore]   %-28s esperado %s, real %s  <-- DIFERENCIA\n' "$tabla" "$esperado" "$real" >&2
    FALLOS=1
  fi
done < <(sed -n '/^\[conteos\]$/,/^\[sha256\]$/p' "$DIR/MANIFEST" | grep -E '^[a-z_]+\.[a-z_]+=')
[[ $FALLOS -eq 0 ]] || die "los conteos no coinciden con el MANIFEST"
log "OK: restauración completa y verificada"
