# roadmap — control de avance por fases

> Tablero del orquestador. Plan de esta tarea: **mejorar la visualización de Noticias y Eventos
> (imagen vertical 2:3 de 500x750, categoría "boletín" solo imagen, eventos con carrusel de
> varias imágenes)**. No hay plan previo en PLAN.md: las fases son una PROPUESTA del orquestador
> y no arrancan sin el GO del humano. Cada fase se cierra solo con una puerta GO/NO-GO suya.

## Estado global
- **Fase actual:** 4 CERRADA, publicada (PR #9) y desplegada a staging el 2026-10-15; plan completo. Falta la prueba manual del humano en staging (sesión real y subida real a Storage) y migrar producción
- **Situación:** Fase 1 CERRADA por el humano (GO a la Fase 2); Fases 3-4 esperan su GO
- **Actualizado:** 2026-10-14

### Leyenda de situación
`NO INICIADA` · `EN CURSO` · `BLOQUEADA POR HUMANO` · `LISTA PARA GO/NO-GO` · `CERRADA`

---

## Fase 0 — Investigación del estado actual
- **Situación:** CERRADA (investigador, 2026-10-14; ver research.md "Noticias, eventos e imágenes")
- **Resultado:** "evento" no existe en el código; tipos reales: noticia, comunicado, oferta_empleo (`tipo VARCHAR(30)` sin CHECK); la BD ya admite varias imágenes por noticia (`noticia_imagenes`, máx. 5 por API) pero ninguna vista muestra más de `imagenes[0]`; no hay redimensionado de imágenes ni tests de noticias.

## Fase 1 — Presentación vertical 2:3 (solo frontend/CSS, sin tocar BD)
- **Situación:** CERRADA (coder + revisor + tester; el humano la vio en desarrollo y dio GO a la Fase 2). Pendiente de commit/publicación. Diferidos: H3 coste del blur en staging, H4 warnings de ESLint.
- **Objetivo:** componente reutilizable de imagen vertical (proporción 2:3, hasta 500x750, centrado en el área de contenido, responsive en móvil) con la imagen completa sobre fondo desenfocado (decisión del humano), aplicado en TODAS las vistas de noticias.
- **Tareas:** [x] componente `ImagenVertical` 2:3 con fondo desenfocado · [x] aplicado en carrusel de Inicio, modal y tarjetas/cuadrícula de `/noticias` (tarjetas angostas 200x300 por decisión del humano) · [x] estilos y responsive · [ ] revisión visual en staging (humano) · diferidos: H3 coste del blur (medir en staging), H4 warnings de ESLint (chore aparte).
- **Puerta:** revisión visual del humano en staging.

## Fase 2 — Categoría "boletín" (solo imagen)
- **Situación:** CERRADA (GO del humano a la Fase 3; commit 158f063 junto con la Fase 1). Antes: LISTA PARA GO/NO-GO (coder + 2 rondas de correcciones; revisor APROBADO CON OBSERVACIONES, 0 críticos/altos; tester sin fallos en Chromium y Firefox con los componentes reales). Falta que el humano vea un boletín en su entorno y la prueba con Storage real y sesión real.
- **Objetivo:** nuevo valor de `tipo` = `boletin`; sin título ni descripción visibles, solo la imagen; el clic amplía la imagen; aparece en el carrusel de Inicio y en `/noticias`. Se guarda un título interno (solo para el panel).
- **Tareas:** [x] lista central de tipos válidos (backend y frontend, con paridad comentada) · [x] editor: opción "Boletín" (una imagen, título interno, bloqueo de publicar sin imagen) · [x] vistas: carrusel de Inicio, `/noticias`, filtro y etiquetas · [x] ampliar imagen al clic (visor 2:3 accesible por teclado) · [x] tests backend (30) · [x] borradores ya no visibles por id público (ruta `GET /noticias/admin/:id` para el panel) · [x] API pública del boletín sin título/subtítulo/contenido/autor.
- **Puerta:** GO del humano tras ver un boletín de prueba.

## Fase 3 — Eventos con varias imágenes y carrusel
- **Situación:** CERRADA (coder + revisor APROBADO CON OBSERVACIONES, 0 críticos/altos + tester sin fallos en navegador real y Postgres real; decisiones del humano aplicadas; commit al cerrar la fase). Pendiente: revisión visual del humano en su entorno, aplicar la migración 006 en staging/prod y probar con Storage y sesión reales.
- **Objetivo:** `tipo = 'evento'` con fecha y lugar propios y varias imágenes mostradas en un carrusel 2:3 centrado.
- **Tareas:** [x] migración `006-eventos-noticias.sql` (`fecha_evento TIMESTAMPTZ`, `lugar`) también en init.sql y db-init · [x] editor: fecha y hora, lugar, subida múltiple, orden ↑/↓ y portada · [x] `CarruselImagenes` 2:3 en el detalle · [x] evento como noticia en Inicio y /noticias con "Finalizado" al terminar el día · [x] endpoint de reorden · [x] límites 10/1/5 también al cambiar de tipo · [x] tests (323).
- **Puerta:** GO del humano.

## Fase 4 — Endurecimiento, revisión y pruebas
- **Situación:** CERRADA (coder + 3 rondas; revisor APROBADO CON OBSERVACIONES, 0 críticos/altos; tester sin fallos con Postgres real, nginx real y componentes reales). Publicar/desplegar solo con OK del humano.
- **Tareas:** [x] `client_max_body_size 50m` en `/api/` (prod, staging, spa; probado con nginx real: 6 MB y 50 MB pasan, 51 MB da 413) · [x] filtro `?tipo=` en servidor con paginación estable (desempate por id) y topes de `limite` (100) y `pagina` · [x] ids validados, errores públicos genéricos · [x] auditoría en crear/editar/eliminar/imágenes/reordenar · [x] transacciones atómicas (FOR UPDATE) para límite de imágenes, orden y reordenar · [x] `fecha_evento` exige zona · [x] foco del modal (hook `useFocoModal`) y cuerpo enfocable del evento · [x] eliminar imagen verifica propiedad · [x] revisor · [x] tester · [x] despliegue a staging (2026-10-15, commit `d278a9a`, migración 006 aplicada; ver decisions.md) · [ ] prueba manual en staging con sesión real y subida real a Storage (la hace el humano).
- **Hecho después del cierre (decisiones del humano 2026-10-15):** `eslint-plugin-react` instalado (devDependency, regla `react/jsx-uses-vars`; avisos de modules/ de 178 a 19, sin errores) · slides del carrusel de Inicio activables con teclado (un solo control por slide, solo el activo en el orden de Tab, el foco acompaña al slide activo con ←/→, mejoras de axe en diálogos/regiones desplazables/contraste del meta).
- **Fuera / deuda aceptada:** axe restante (3 menores, paleta previa): contraste de `.badge-comunicado` (2,86:1) y `.badge-noticia` (3,00:1), contraste de `.rayhsa-modal__acciones-meta` (#718096 sobre #f8f9fb) y resumen/"Leer artículo" del slide fuera de su nombre accesible · `error.message` en endpoints autenticados · `portal.permissions.js` sin uso (lo cita docs/AGENT.portal.md) · tests de modelo por regex (la prueba con Postgres real fue manual del tester, sin test permanente) · asegurarBuckets no actualiza buckets existentes.
- **Candidatos diferidos de la Fase 3 (bajos):** atomicidad del límite de imágenes y `MAX(orden)+1` bajo concurrencia · validación del reorden dentro de la transacción y auditoría de las rutas de imágenes · fechas sin zona en la API · slides de Inicio no enfocables por teclado · aplicar la migración 006 en staging con el `db-init` y probar subida real a Storage.
- **Candidatos diferidos de las Fases 1-2 (bajos salvo H5):** H3 coste del blur con 50 tarjetas (medir en staging) · H4 warnings falsos de ESLint (`react/jsx-uses-vars`) · H5 filtro de `/noticias` aplicado tras paginar en servidor (medio) · `GET /api/noticias/admin` sin id cae en `/:id` y devuelve 500 con `error.message` de Postgres · `paraPublico` debería listar en blanco también los campos de `imagenes[]` (`nombre_archivo`, `ruta_archivo`, `noticia_id`) · PUT sin `auditoriaMiddleware` · foco del visor/modales · carrera del límite de 1 imagen · `obtenerNoticiaAdmin` sin consumidor y `portal.permissions.js` sin uso · tests de ruta frágiles (`router.stack`).
- **Puerta:** GO del humano antes de mergear/desplegar.

---

# Tarea: Calendario laboral y bloqueo de vacaciones por departamento (2026-10-15)
> Rama `feat/calendariolaboral-vacaciones`. Fases = PROPUESTA del orquestador; cada una cierra con GO del humano. Decisiones en decisions.md (2026-10-15).

## Estado global
- **Fase actual:** 3 LISTA PARA GO/NO-GO (commit hecho en la rama). **Actualizado:** 2026-10-15

## Fase 1 — Investigación — CERRADA (research.md 1545-1638)
## Fase 2 — Calendario laboral: BD, backend, permisos, auditoría, semilla de festivos MX — CERRADA (commit c5247eb)
## Fase 3 — Pantalla de administración del calendario (RH/Admin) — LISTA PARA GO/NO-GO (coder + revisor + tester; ver decisions.md)
## Fase 4 — Días hábiles + bloqueo por departamento con cupo + fechas ocupadas en el selector — NO INICIADA
## Fase 5 — Revisión, pruebas y cierre — NO INICIADA
