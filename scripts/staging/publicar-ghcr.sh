#!/usr/bin/env bash
# Construye las imágenes de producción y las publica en ghcr.io
# Uso: ./scripts/staging/publicar-ghcr.sh [SHA]
#
# Si no se pasa SHA, usa el commit actual.
# Requiere: docker login ghcr.io -u <usuario> --password-stdin

set -euo pipefail

REGISTRY="ghcr.io"
OWNER="jamejia-rayhsa"
REPO="intranet"
SHA="${1:-$(git rev-parse HEAD)}"
SHORT="${SHA:0:7}"

# La anon key se hornea en el bundle (pública por diseño). Fuente: entorno o .env.staging
ENV_FILE="${ENV_FILE:-.env.staging}"
if [ -z "${SUPABASE_ANON_KEY:-}" ] && [ -f "$ENV_FILE" ]; then
  SUPABASE_ANON_KEY="$(grep -E '^SUPABASE_ANON_KEY=' "$ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d '"'"'"'\r')"
fi
if [ -z "${SUPABASE_ANON_KEY:-}" ]; then
  echo "ERROR: falta SUPABASE_ANON_KEY (defínela en el entorno o en $ENV_FILE) para hornearla en el frontend." >&2
  exit 1
fi
if [ -z "${AZURE_AD_ENABLED:-}" ] && [ -f "$ENV_FILE" ]; then
  AZURE_AD_ENABLED="$(grep -E '^AZURE_AD_ENABLED=' "$ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d '"'"'"'\r')"
fi
MS365_LOGIN="${AZURE_AD_ENABLED:-false}"

echo "→ Construyendo imágenes para commit $SHORT..."

docker build \
  --file Dockerfile.backend \
  --target production \
  --tag "$REGISTRY/$OWNER/$REPO/backend:$SHA" \
  --tag "$REGISTRY/$OWNER/$REPO/backend:latest" \
  .

docker build \
  --file Dockerfile.frontend \
  --target production \
  --build-arg VITE_API_URL=/api \
  --build-arg VITE_SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
  --build-arg VITE_MS365_LOGIN="$MS365_LOGIN" \
  --tag "$REGISTRY/$OWNER/$REPO/frontend:$SHA" \
  --tag "$REGISTRY/$OWNER/$REPO/frontend:latest" \
  .

echo "→ Publicando en $REGISTRY..."

docker push "$REGISTRY/$OWNER/$REPO/backend:$SHA"
docker push "$REGISTRY/$OWNER/$REPO/backend:latest"
docker push "$REGISTRY/$OWNER/$REPO/frontend:$SHA"
docker push "$REGISTRY/$OWNER/$REPO/frontend:latest"

echo "✓ Listo. Imágenes disponibles:"
echo "  $REGISTRY/$OWNER/$REPO/backend:$SHA"
echo "  $REGISTRY/$OWNER/$REPO/frontend:$SHA"
echo ""
echo "Para desplegar en el servidor remoto:"
echo "  IMAGE_TAG=$SHA docker compose -f docker-compose.staging.yml --env-file .env.staging pull"
echo "  IMAGE_TAG=$SHA docker compose -f docker-compose.staging.yml --env-file .env.staging up -d"
