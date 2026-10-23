# Pantallas de administración de Asistencia (Fase 5, parte 1)

Rutas bajo `/rh/asistencia/` (menú RH, grupo «Asistencia»): `turnos`, `asignaciones`, `marcas`, `sincronizacion`, `llaves`. Solo rh_admin y
super_admin (permisos reales Turnos e Ingesta, consulta/edición). Código en `modules/rh/frontend/` (`pages/Asistencia*Page.jsx`,
`components/asistencia/`, `utils/asistencia*.js`) y lecturas nuevas en `modules/rh/backend/controllers/asistenciaAdmin.controller.js`.

## Criterios acordados

- **Retraso de la sincronización:** se mide con la *última comunicación* de la interfaz (`ultima_comunicacion` de `GET /api/asistencia/sincronizacion/estado` =
  mayor `ultimo_uso` de las llaves activas del origen; cada petición autenticada, también `GET /ingesta/estado` en un día sin marcas, lo actualiza, a lo más cada 30 s por
  llave). Avisa «posible retraso» si pasan más de 45 min dentro de 07:00-20:00 (ambos incluidos) hora de México, **todos los días** (la interfaz sincroniza también fines de semana
  y festivos). Al abrir la ventana la espera cuenta desde las 07:00. Fuera de horario no avisa. «Último envío de marcas» se muestra aparte.
- **Exportación CSV de marcas:** hasta 5 000 filas, paginada por clave (`orden=id&antes_id=…`, id descendente) para no repetir ni omitir filas si entran marcas durante la
  exportación. Cada exportación se registra en la bitácora (`POST /api/asistencia/marcas/exportaciones`, acción `EXPORTAR_MARCAS`, solo el número de filas). **El CSV no lleva nombres de
  empleado** (código = número de nómina, y si la marca está vinculada): el archivo sale del sistema y no queda controlado; los nombres se ven en la pantalla.
- **Terminar una asignación con fecha pasada** se permite, con una confirmación que indica desde qué día cambia el turno efectivo (los días hasta hoy se recalculan si su quincena sigue abierta; las cerradas no cambian).
- **Total de marcas:** estimación de `pg_class.reltuples` si es ≥ 100 000 (se marca «≈», también en el porcentaje); exacto si no.

## Pruebas (qué hay y qué no)

- En el repo: lógica pura de `utils/asistencia*.js` (`modules/rh/tests/asistenciaPantallas.util.test.js`, con `cargarUtilEsm.js`, que transforma el util con esbuild) y la API de lectura
  (`modules/rh/backend/tests/asistenciaAdmin.api.test.js`).
- **No hay pruebas de componente ni E2E en el repo** (no hay Testing Library/Playwright en los `package.json`). Las pantallas se verificaron con un *harness externo* (Vite sobre el
  `main.jsx` real con `AuthContext`/supabase simulados, backend real, Postgres desechable y Chromium + axe-core, scripts fuera del repo). Lo que solo protege ese harness: la llave
  se muestra una sola vez y no queda en DOM/storage/consola, Escape sin confirmar no cierra el diálogo de la llave, foco atrapado y devuelto, menú estricto por permiso, 403 → «sin permiso».
  Al cambiar esas pantallas hay que repetir una verificación equivalente.
- La lógica de decisión de los diálogos vive en utils puros y probados (`validarEdicionIps`, `esErrorSinRespuesta`, `avisoTerminarPasado`, `hayCambios`, `recolectarPorClave`, `evaluarRetraso`).
