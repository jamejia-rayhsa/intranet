#!/bin/bash
# Backend de verificación contra el Postgres desechable (puerto VERIF_PG_PORT, 55420 por omisión) en VERIF_API_PORT (4660).
cd "$(dirname "$0")/../.."
export POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=${VERIF_PG_PORT:-55420} POSTGRES_DB=postgres POSTGRES_USER=postgres POSTGRES_PASSWORD=pw \
  SUPABASE_JWT_SECRET=secreto-de-prueba-harness-cuentas-0123456789abcdef PORT=${VERIF_API_PORT:-4660} NODE_ENV=test INGESTA_PORT= \
  ASISTENCIA_MOTOR_ACTIVO=false PG_POOL_MAX=6 SUPABASE_URL=http://127.0.0.1:1 SUPABASE_SERVICE_ROLE_KEY=x
exec node modules/portal/backend/app.js
