# roadmap — control de avance por fases

> Tablero del orquestador. Plan de esta tarea: **mejorar la visualización de Noticias y Eventos
> (imagen vertical 2:3 de 500x750, categoría "boletín" solo imagen, eventos con carrusel de
> varias imágenes)**. No hay plan previo en PLAN.md: las fases son una PROPUESTA del orquestador
> y no arrancan sin el GO del humano. Cada fase se cierra solo con una puerta GO/NO-GO suya.

## Estado global
- **Fase actual:** 2 LISTA PARA GO/NO-GO (revisión visual del humano pendiente)
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
- **Situación:** LISTA PARA GO/NO-GO (coder + 2 rondas de correcciones; revisor APROBADO CON OBSERVACIONES, 0 críticos/altos; tester sin fallos en Chromium y Firefox con los componentes reales). Falta que el humano vea un boletín en su entorno y la prueba con Storage real y sesión real.
- **Objetivo:** nuevo valor de `tipo` = `boletin`; sin título ni descripción visibles, solo la imagen; el clic amplía la imagen; aparece en el carrusel de Inicio y en `/noticias`. Se guarda un título interno (solo para el panel).
- **Tareas:** [x] lista central de tipos válidos (backend y frontend, con paridad comentada) · [x] editor: opción "Boletín" (una imagen, título interno, bloqueo de publicar sin imagen) · [x] vistas: carrusel de Inicio, `/noticias`, filtro y etiquetas · [x] ampliar imagen al clic (visor 2:3 accesible por teclado) · [x] tests backend (30) · [x] borradores ya no visibles por id público (ruta `GET /noticias/admin/:id` para el panel) · [x] API pública del boletín sin título/subtítulo/contenido/autor.
- **Puerta:** GO del humano tras ver un boletín de prueba.

## Fase 3 — Eventos con varias imágenes y carrusel
- **Situación:** NO INICIADA (propuesta)
- **Objetivo:** `tipo = 'evento'` con fecha y lugar propios y varias imágenes mostradas en un carrusel 2:3 centrado.
- **Tareas:** [ ] migración BD (`fecha_evento`, `lugar`) también en init.sql y db-init · [ ] editor con campos de evento, subida múltiple y orden · [ ] carrusel de imágenes (modal/vista) · [ ] tests.
- **Puerta:** GO del humano.

## Fase 4 — Endurecimiento, revisión y pruebas
- **Situación:** NO INICIADA (propuesta)
- **Tareas:** [ ] límite de cuerpo de nginx en `/api/` de producción (hoy 1 MB) · [ ] revisor · [ ] tester · [ ] despliegue a staging con prueba de subida real a Storage.
- **Candidatos diferidos de las Fases 1-2 (bajos salvo H5):** H3 coste del blur con 50 tarjetas (medir en staging) · H4 warnings falsos de ESLint (`react/jsx-uses-vars`) · H5 filtro de `/noticias` aplicado tras paginar en servidor (medio) · `GET /api/noticias/admin` sin id cae en `/:id` y devuelve 500 con `error.message` de Postgres · `paraPublico` debería listar en blanco también los campos de `imagenes[]` (`nombre_archivo`, `ruta_archivo`, `noticia_id`) · PUT sin `auditoriaMiddleware` · foco del visor/modales · carrera del límite de 1 imagen · `obtenerNoticiaAdmin` sin consumidor y `portal.permissions.js` sin uso · tests de ruta frágiles (`router.stack`).
- **Puerta:** GO del humano antes de mergear/desplegar.
