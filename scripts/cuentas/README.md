# Verificación reproducible de la vinculación cuenta <-> empleado

Datos 100 % ficticios (`@ejemplo.test`, nombres `Nom1`/`Pat1`...). Nada de esto se ejecuta contra staging ni producción.

1. Postgres desechable con el esquema real (puerto `VERIF_PG_PORT`, 55420 por omisión):
   `docker run -d --name pg-cuentas -e POSTGRES_PASSWORD=pw -p 55420:5432 postgres:16-alpine` y
   `docker exec -i pg-cuentas psql -U postgres -v ON_ERROR_STOP=1 -q -f - < config/database/init.sql`.
2. `export VERIF_SALIDA=/tmp/cuentas-verif` (estado y capturas) y `node scripts/cuentas/prep.js`: siembra 71 empleados, 8 cuentas sin
   empleado (3 exactas simples, 1 con materno, 1 privilegiada, 1 sin rol de Asistencia, 1 homónimos, 1 sin coincidencia), 7 actores
   con vínculo (rh_admin, super_admin, portal_admin, rh_empleado, jefe, empleado, rh_consulta) y tokens HS256 de prueba.
3. `scripts/cuentas/backend.sh &` (API en `VERIF_API_PORT`, 4660) y `node scripts/cuentas/verif.js`: 117 comprobaciones por HTTP
   (permisos por rol con la seed real, vista previa exacta, ejecución, idempotencia, 409 atómico, concurrencia y candado 4601,
   auditoría, plantilla de carga, correos duplicados, suspendidos y la UNIQUE ausente). Re-siembra entre secciones.
4. Chromium (opcional): `playwright` y `axe-core` no son dependencias del repo; indica `PLAYWRIGHT_PATH` y `AXE_PATH`, arranca
   `node node_modules/vite/bin/vite.js --config scripts/cuentas/vite.config.mjs &` (portal real con `supabase-stub.js`) y
   `node scripts/cuentas/ui.js` (67 comprobaciones: vista previa, selección, 409, perfil, plantilla, 320/360/768, axe).
5. Mutación: `python3 scripts/cuentas/mut.py` (31 mutantes manuales sobre las reglas; 30 matados; el sobreviviente,
   "pisa vínculo del empleado", es equivalente: sin la comprobación en JS el `UPDATE ... AND usuario_id IS NULL` da el mismo 409).
6. Limpieza: `docker rm -f pg-cuentas` y parar los procesos de los puertos 4660 y 5197.
