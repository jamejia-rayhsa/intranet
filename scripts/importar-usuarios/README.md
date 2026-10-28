# Verificación reproducible de "Importar usuarios"

Datos 100 % ficticios (`@rayhsa.com.mx` de mentira, `Nom1`/`Pat1`...). Nada se ejecuta contra staging ni producción. Usa un **GoTrue
real** (`supabase/gotrue`, la versión del compose) con un proxy que inyecta fallos (tiempo agotado, HTTP 500, lentitud).

1. Postgres y GoTrue desechables (la red permite que GoTrue vea al Postgres):
   ```
   docker run -d --name pg-impusu -e POSTGRES_PASSWORD=pw -p 55430:5432 postgres:16-alpine
   docker exec -i pg-impusu psql -U postgres -v ON_ERROR_STOP=1 -q -f - < config/database/init.sql
   docker exec pg-impusu psql -U postgres -c "create database gotrue_verif"
   docker exec pg-impusu psql -U postgres -d gotrue_verif -c "create schema auth authorization postgres"
   docker network create net-impusu && docker network connect net-impusu pg-impusu
   docker run -d --name gotrue-impusu --network net-impusu -p 9998:9998 -e GOTRUE_API_HOST=0.0.0.0 -e GOTRUE_API_PORT=9998 \
     -e API_EXTERNAL_URL=http://127.0.0.1:9998 -e GOTRUE_DB_DRIVER=postgres -e GOTRUE_DB_NAMESPACE=auth \
     -e "DATABASE_URL=postgres://postgres:pw@pg-impusu:5432/gotrue_verif?search_path=auth" -e GOTRUE_SITE_URL=http://127.0.0.1:5199 \
     -e GOTRUE_JWT_SECRET=secreto-de-prueba-harness-gotrue-0123456789abcdef -e GOTRUE_JWT_AUD=authenticated -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated -e GOTRUE_JWT_ADMIN_ROLES=service_role \
     -e GOTRUE_DISABLE_SIGNUP=true -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true -e GOTRUE_MAILER_AUTOCONFIRM=true \
     supabase/gotrue:v2.196.0
   ```
2. `export VERIF_SALIDA=/tmp/importar-usuarios-verif`; `node scripts/importar-usuarios/gotrue-proxy.js &` (puerto 9999) y
   `scripts/importar-usuarios/backend.sh &` (API en 4670, hablando con el proxy).
3. `node scripts/importar-usuarios/verif.js`: 108 comprobaciones por HTTP (permisos por rol con la seed real, vista previa sin escribir,
   alta ms365 sin contraseña + rol + vínculo contra GoTrue real, idempotencia, errores por fila, límites, auditoría, `PUT` sin contraseña
   en ms365, fallos de GoTrue y de la activación con compensación, concurrencia/candados, 200 filas). Re-siembra (`prep.js`) entre secciones.
4. Chromium (opcional): `playwright` y `axe-core` no son dependencias del repo; indica `PLAYWRIGHT_PATH` y `AXE_PATH`, arranca
   `node node_modules/vite/bin/vite.js --config scripts/importar-usuarios/vite.config.mjs &` (portal real con el `supabase-stub.js` de
   `scripts/cuentas`) y `node scripts/importar-usuarios/ui.js` (33 comprobaciones: permisos del botón, plantilla, topes 200 filas/1 MB, vista
   previa obligatoria, resultado, axe, 360 px, Escape y foco).
5. Mutación: `python3 scripts/importar-usuarios/mut.py` (39 mutantes sobre las reglas; las pruebas jest deben matarlos; sobrevive uno equivalente: sin `e.enCommit` el error igual cae en "no conocido" -> verificar). Admite filtro: `mut.py COMMIT alias`.
6. Limpieza: `docker rm -f gotrue-impusu pg-impusu && docker network rm net-impusu` y parar los procesos de los puertos 9999, 4670 y 5198.
