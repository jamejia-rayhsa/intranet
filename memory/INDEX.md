# INDEX — Memory Palace

> Mapa del cuaderno. Toda entrada nueva se referencia aquí en una línea.

## Archivos activos
- [context](context.md) — misión y alcance
- [decisions](decisions.md) — decisiones de arquitectura
- [research](research.md) — investigación en curso
- [code-notes](code-notes.md) — decisiones de código (si aplica)
- [reviews](reviews.md) — hallazgos de revisión (si aplica)
- [blockers](blockers.md) — unknowns activos
- [glossary](glossary.md) — terminología del proyecto

## Últimas entradas
<!-- formato: - [YYYY-MM-DD] [agente] → archivo#anchor — título -->
- [2026-10-09] orquestador → decisions.md — Middleware sin vinculación por correo (user_metadata/correo editables por el usuario); Azure probado en dev
- [2026-10-08] orquestador → decisions.md — Fase 6 completa: acceso por propietario, auth legado eliminado, respaldos probados, datos de dev migrados; Azure sin probar
- [2026-10-08] revisor → reviews.md — Fase 6A+6B: Autorización por propietario + eliminación auth legado (APROBADO, 2 observaciones menores)
- [2026-10-08] orquestador → decisions.md — Fase 5 completa: archivos en Supabase Storage; deriva de recibos_nomina corregida; autorización por propietario pendiente
- [2026-10-08] orquestador → decisions.md — Fase 4 completa: frontend sobre Supabase Auth; Playwright 16/16; Microsoft sin probar
- [2026-10-08] orquestador → decisions.md — Fase 3 completa: Supabase Auth conviviendo con login legado; hash fuera de la API; eliminar usuario local-primero
- [2026-10-08] revisor → reviews.md — Fase 5: Storage en Supabase (APROBADO, 3 observaciones menores)
- [2026-10-08] orquestador → decisions.md — Fase 2 completa: app sobre Postgres de Supabase; init en una transacción; pendientes (hash en /auth/perfil)
- [2026-10-08] coder → code-notes.md — Fase 2: compose dev/staging/prod incluyen Supabase (include:), supabase-db-init one-shot, envs actualizados
- [2026-10-08] revisor → reviews.md — Fase 2: Migración Supabase self-hosted (APROBADO, 3 observaciones)
- [2026-10-08] revisor → reviews.md — Fase 3A+3B: Supabase Auth (middleware, admin service, migration) - RECHAZADO (1 IMPORTANTE: eliminar debe ir GoTrue primero)
- [2026-10-08] orquestador → decisions.md — Migración a Supabase self-hosted: línea base del esquema, stack sin gateway, RLS, trampas de GoTrue/Storage
- [2026-05-15] orquestador → code-notes.md — CSS: pagina-contenedor no existe globalmente; cada módulo debe definirla en su propio CSS
- [2026-05-15] orquestador → code-notes.md — Gotcha Docker: volúmenes frontend son explícitos por módulo (agregar línea en docker-compose.dev.yml)
- [2026-05-15] orquestador → SolicitudesListado.jsx — Fix: ruta /imprimir → /editar (bug bloqueante corregido)
- [2026-05-15] revisor → reviews.md — Módulo Comercial Fase 1: RECHAZADO → fix aplicado (1 ruta inexistente)
- [2026-05-15] coder → code-notes.md — Módulo Comercial Fase 1: 9 archivos creados, 4 modificados, formulario 7 pestañas
- [2026-05-15] orquestador → decisions.md — ADR: Módulo Comercial Fase 1 (solicitudes crédito, JSONB arrays, window.print PDF, MBA3 stub)
- [2026-05-15] investigador → research.md — Módulo Comercial: MBA3 API (PDFs comprimidos), patrones RH, permisos granulares, SUB_RUTAS, PDF generación, auditoría
- [2026-05-13] orquestador → decisions.md — ADR: Fix dashboard RH (3 SQL bugs) + CSS permisos (4 archivos)
- [2026-05-13] orquestador → permisoAusencia.model.js — Fix directo: 6× tabla + 2× apellido_paterno
- [2026-05-13] revisor → reviews.md — Fix dashboard RH + CSS permisos: RECHAZADO (bug modelo permisos detectado y corregido)
- [2026-05-13] coder → code-notes.md — Fix dashboard RH (3 SQL bugs) + CSS permisos
- [2026-04-29] orquestador → decisions.md — ADR: Fix bugs admin/roles/sidebar + CSS vacaciones (6 archivos)
- [2026-04-29] revisor → reviews.md — Fix bugs admin/roles/sidebar + CSS vacaciones (6 archivos, APROBADO)
- [2026-04-29] coder → code-notes.md — Fix bugs admin/roles/sidebar + CSS vacaciones (6 archivos)
- [2026-04-29] investigador → research.md — Auditoría bugs admin, roles, sidebar módulos y CSS páginas RH
- [2026-04-29] investigador → research.md — Dashboard RH (endpoint correcto) y estilos página Permisos (ya con constantes)
- [2026-04-29] orquestador → decisions.md — ADR: Logo sidebar +10%, login logo Rayhsa, filtrado menú por permisos
- [2026-04-29] coder → code-notes.md — Logo sidebar, logo login, filtrado permisos menú (6 archivos)
- [2026-04-29] revisor → reviews.md — Logo sidebar, logo login, filtrado permisos menú: revisión post-coder (APROBADO CON OBSERVACIONES)
- [2026-04-29] investigador → research.md — Auditoría sidebar logo, login logo y permisos menú dinámico
- [2026-04-29] orquestador → decisions.md — ADR: Combos unificados, title case, nivel_salarial eliminado (5 archivos)
- [2026-04-29] coder → code-notes.md — Combos unificados, title case, nivel_salarial (5 archivos, catálogos centralizados)
- [2026-04-29] revisor → reviews.md — Combos unificados, title case, nivel_salarial: revisión post-coder (APROBADO)
- [2026-04-29] investigador → research.md — Auditoría nivel_salarial y campos combo (ubicación, estructura puestos, inconsistencias)
- [2026-04-29] orquestador → decisions.md — ADR: Validaciones y combos formularios empleado (estados, bancos, HTML5)
- [2026-04-29] revisor → reviews.md — Validaciones y combos: revisión post-coder (APROBADO CON OBSERVACIONES)
- [2026-04-29] coder → code-notes.md — Validaciones y combos formularios empleado (catalogos.js creado, 2 formularios actualizados)
- [2026-04-29] revisor → reviews.md — Alta empleado: validación post-coder (APROBADO CON OBSERVACIONES)
- [2026-04-29] investigador → research.md — Auditoría módulo RH: brecha alta empleado (EmpleadoPage desactualizado)
- [2026-04-29] coder → code-notes.md — Alta empleado: sincronización 40 campos (3 archivos, bug apellido corregido)
- [2026-04-28] orquestador → context.md — Contexto inicial del proyecto intranet Rayhsa
- [2026-04-28] orquestador → decisions.md — ADR: Módulo Vacaciones RH (tabla nueva, saldo calculado, flujo aprobación)
- [2026-04-28] coder → code-notes.md — Implementación completa módulo Vacaciones RH (9 archivos creados/modificados)
- [2026-04-28] orquestador → decisions.md — ADR: Listado separado vacaciones + visibilidad por rol + seed
- [2026-04-28] coder → code-notes.md — Listado separado vacaciones + seed (bug req.user.usuario_id; correos @empresa.com corregidos)

- [2026-10-08] revisor → reviews.md — Fase 4A+4B: Frontend Supabase Auth + proxies Vite (APROBADO CON OBSERVACIÓN, 1 IMPORTANTE bajo riesgo)
