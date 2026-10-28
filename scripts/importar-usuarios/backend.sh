#!/bin/bash
# Backend de verificación contra el Postgres desechable (VERIF_PG_PORT, 55430) y el proxy de GoTrue (VERIF_GOTRUE_PROXY_PORT, 9999).
# La clave de servicio es un JWT de prueba firmado con el secreto de GoTrue desechable: se pasa en SUPABASE_SERVICE_ROLE_KEY.
cd "$(dirname "$0")/../.."
export POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=${VERIF_PG_PORT:-55430} POSTGRES_DB=postgres POSTGRES_USER=postgres POSTGRES_PASSWORD=pw \
  SUPABASE_JWT_SECRET=secreto-de-prueba-harness-gotrue-0123456789abcdef PORT=${VERIF_API_PORT:-4670} NODE_ENV=test INGESTA_PORT= \
  ASISTENCIA_MOTOR_ACTIVO=false PG_POOL_MAX=8 SUPABASE_AUTH_URL=http://127.0.0.1:${VERIF_GOTRUE_PROXY_PORT:-9999} \
  SUPABASE_SERVICE_ROLE_KEY=$(node -e "console.log(require('jsonwebtoken').sign({role:'service_role',aud:'authenticated'},'secreto-de-prueba-harness-gotrue-0123456789abcdef',{expiresIn:'6h'}))")
exec node modules/portal/backend/app.js
