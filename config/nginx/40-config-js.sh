#!/bin/sh
# Genera /config.js al arrancar el contenedor del frontend (nginx ejecuta /docker-entrypoint.d/*.sh).
# Variables: SUPABASE_ANON_KEY (pública por diseño), SUPABASE_URL (opcional; vacío = mismo origen)
# y MS365_LOGIN (true/false). Los valores se filtran a caracteres seguros para no inyectar JS.
set -eu
limpiar() { printf '%s' "$1" | tr -cd 'A-Za-z0-9._:/-'; }
KEY="$(limpiar "${SUPABASE_ANON_KEY:-}")"
URL="$(limpiar "${SUPABASE_URL:-}")"
case "${MS365_LOGIN:-false}" in true) MS=true ;; *) MS=false ;; esac
cat > /usr/share/nginx/html/config.js <<EOF
window.__APP_CONFIG__ = { SUPABASE_ANON_KEY: "$KEY", SUPABASE_URL: "$URL", MS365_LOGIN: "$MS" };
EOF
[ -n "$KEY" ] || echo "AVISO: SUPABASE_ANON_KEY vacío; el inicio de sesión no funcionará" >&2
