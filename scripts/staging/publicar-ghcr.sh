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
