#!/usr/bin/env bash
# Genera los secretos del stack Supabase self-hosted e imprime líneas listas para el .env.
# Uso: bash scripts/supabase/generar-secretos.sh >> .env.staging
set -euo pipefail

b64url() { openssl base64 -A | tr '+/' '-_' | tr -d '='; }

firmar_jwt() { # $1 = rol, $2 = secreto
  local header payload iat exp unsigned sig
  iat=$(date +%s); exp=$((iat + 10 * 365 * 24 * 3600))
  header=$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)
  payload=$(printf '{"role":"%s","iss":"supabase","iat":%s,"exp":%s}' "$1" "$iat" "$exp" | b64url)
  unsigned="$header.$payload"
  sig=$(printf '%s' "$unsigned" | openssl dgst -sha256 -hmac "$2" -binary | b64url)
  printf '%s.%s' "$unsigned" "$sig"
}

jwt_secret=$(openssl rand -hex 32)

echo "# --- Supabase self-hosted (generado $(date +%F)) ---"
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
echo "SUPABASE_JWT_SECRET=$jwt_secret"
echo "SUPABASE_ANON_KEY=$(firmar_jwt anon "$jwt_secret")"
echo "SUPABASE_SERVICE_ROLE_KEY=$(firmar_jwt service_role "$jwt_secret")"
echo "PG_META_CRYPTO_KEY=$(openssl rand -hex 16)"
