# roadmap — control de avance por fases

> Tablero del orquestador. Plan de esta tarea: **mejorar la visualización de Noticias y Eventos
> (imagen vertical 2:3 de 500x750, categoría "boletín" solo imagen, eventos con carrusel de
> varias imágenes)**. No hay plan previo en PLAN.md: las fases son una PROPUESTA del orquestador
> y no arrancan sin el GO del humano. Cada fase se cierra solo con una puerta GO/NO-GO suya.

## Estado global
- **Fase actual:** 0 cerrada; esperando GO para la Fase 1
- **Situación:** DECISIONES DE PRODUCTO APROBADAS; falta el GO del humano para iniciar la Fase 1
- **Actualizado:** 2026-10-14

### Leyenda de situación
`NO INICIADA` · `EN CURSO` · `BLOQUEADA POR HUMANO` · `LISTA PARA GO/NO-GO` · `CERRADA`

---

## Fase 0 — Investigación del estado actual
- **Situación:** CERRADA (investigador, 2026-10-14; ver research.md "Noticias, eventos e imágenes")
- **Resultado:** "evento" no existe en el código; tipos reales: noticia, comunicado, oferta_empleo (`tipo VARCHAR(30)` sin CHECK); la BD ya admite varias imágenes por noticia (`noticia_imagenes`, máx. 5 por API) pero ninguna vista muestra más de `imagenes[0]`; no hay redimensionado de imágenes ni tests de noticias.

## Fase 1 — Presentación vertical 2:3 (solo frontend/CSS, sin tocar BD)
- **Situación:** NO INICIADA (propuesta)
- **Objetivo:** componente reutilizable de imagen vertical (proporción 2:3, hasta 500x750, centrado en el área de contenido, responsive en móvil) con la imagen completa sobre fondo desenfocado (decisión del humano), aplicado en TODAS las vistas de noticias.
- **Tareas:** [ ] componente de imagen 2:3 con fondo desenfocado · [ ] aplicarlo en carrusel de Inicio, modal y tarjetas/cuadrícula de `/noticias` · [ ] estilos y responsive (500 px no cabe en móvil: escalar manteniendo 2:3).
- **Puerta:** revisión visual del humano en staging.

## Fase 2 — Categoría "boletín" (solo imagen)
- **Situación:** NO INICIADA (propuesta)
- **Objetivo:** nuevo valor de `tipo` = `boletin`; sin título ni descripción visibles, solo la imagen; el clic amplía la imagen; aparece en el carrusel de Inicio y en `/noticias`. Se guarda un título interno (solo para el panel).
- **Tareas:** [ ] lista central de tipos válidos en backend (hoy sin validación) · [ ] editor: opción "Boletín" (una imagen) · [ ] vistas: carrusel de Inicio, `/noticias`, filtro y etiquetas · [ ] ampliar imagen al clic · [ ] tests.
- **Puerta:** GO del humano tras ver un boletín de prueba.

## Fase 3 — Eventos con varias imágenes y carrusel
- **Situación:** NO INICIADA (propuesta)
- **Objetivo:** `tipo = 'evento'` con fecha y lugar propios y varias imágenes mostradas en un carrusel 2:3 centrado.
- **Tareas:** [ ] migración BD (`fecha_evento`, `lugar`) también en init.sql y db-init · [ ] editor con campos de evento, subida múltiple y orden · [ ] carrusel de imágenes (modal/vista) · [ ] tests.
- **Puerta:** GO del humano.

## Fase 4 — Endurecimiento, revisión y pruebas
- **Situación:** NO INICIADA (propuesta)
- **Tareas:** [ ] límite de cuerpo de nginx en `/api/` de producción (hoy 1 MB) · [ ] tests de noticias (hoy cero) · [ ] revisor · [ ] tester · [ ] despliegue a staging.
- **Puerta:** GO del humano antes de mergear/desplegar.
