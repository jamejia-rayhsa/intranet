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
- **Fase actual:** TAREA COMPLETA: Fases 1-5 hechas; LISTA PARA GO/NO-GO FINAL del humano (push/PR/despliegue solo con su OK). **Actualizado:** 2026-10-15

## Fase 1 — Investigación — CERRADA (research.md 1545-1638)
## Fase 2 — Calendario laboral: BD, backend, permisos, auditoría, semilla de festivos MX — CERRADA (commit c5247eb)
## Fase 3 — Pantalla de administración del calendario (RH/Admin) — CERRADA (commit 07400d2)
## Fase 4 — Días hábiles + bloqueo por departamento con cupo + fechas ocupadas en el selector — CERRADA (commit fa87d41)
## Fase 5 — Revisión, pruebas y cierre — LISTA PARA GO/NO-GO FINAL (ver decisions.md "Cierre de la tarea")

---

# Tarea adicional (2026-10-16): tipo "Día Actividad Empresa" (bloquea vacaciones)
> Misma rama `feat/calendariolaboral-vacaciones`. Una sola fase: coder (BD+API+UI) → revisor + tester → commit → GO/NO-GO del humano.
- **Situación:** LISTA PARA GO/NO-GO (coder + revisor + tester; ver decisions.md 2026-10-16).

---

# Tarea (2026-10-21): Módulo de asistencia en RH
> Rama `feat/asistencia-rh`. Fases = PROPUESTA del orquestador; cada una cierra con GO/NO-GO del humano. Decisiones en decisions.md (2026-10-21).

## Estado global
- **Fase actual:** 3 LISTA PARA GO/NO-GO (commit hecho en la rama). Fases 1 y 2 CERRADAS. **Actualizado:** 2026-10-21

## Fase 1 — Investigación (repo, reglas de cruce, modelo de turnos de BioTime, diseño) — CERRADA (research.md 1640-1908)
## Fase 2 — BD (turnos, asignaciones, marcas, asistencia diaria, incidencias), API, permisos, auditoría — EN CURSO (coder)
## Fase 3 — Endpoint de ingesta con llave + contrato para la interfaz de BioTime + simulador de marcas — NO INICIADA
## Fase 4 — Motor de análisis (retardo/falta/salida anticipada/incompleta, cruce con vacaciones, permisos y calendario) con snapshot de turno y periodos quincenales cerrados a los 3 días — EN CURSO (coder, rama feat/asistencia-motor)
## Fase 5 — Pantallas: Mi asistencia, Equipo (jefe), RH (turnos, asignaciones, justificaciones, estado de sincronización) — NO INICIADA
## Fase 6 — Revisión final, pruebas integrales y cierre — NO INICIADA

---

# Corrección (2026-10-22): importador de empleados (fechas de Excel y resultado oculto)
> Rama `fix/importador-empleados-fechas`. Una sola fase: coder → revisor + tester → commit → PR → GO/NO-GO y OK de despliegue del humano.
- **Situación:** EN CURSO (coder). Diagnóstico y alcance en decisions.md (2026-10-22).

---

# Tarea (2026-10-23): Convenios de compra (módulo Comercial)
> Rama propuesta: `feat/comercial-convenios`, creada desde `main` (la rama actual `feat/importador-expediente` tiene trabajo sin aprobar de otra tarea; no se mezcla con esta). Fases = PROPUESTA del orquestador; cada una cierra con GO/NO-GO del humano, igual que las tareas anteriores. Investigación en research.md (2026-10-22, "Convenios de compra"); decisiones del humano y hallazgo de MBA3 en decisions.md (2026-10-23); bloqueo resuelto en blockers.md.

## Resumen del requerimiento
Convenios de compra para productos que no se tienen en stock y hay que comprar en mínimos de paquete con el proveedor: autorización por una lista de personas designadas, cantidad a facturar periódicamente al cliente, tiempo estimado de consumo del stock adquirido, datos de cliente/vendedor/producto, registro real de consumo y un dashboard del estado de cada convenio. Carga inicial desde el CSV de convenios actuales adjuntado por el humano (1 convenio = 1 cliente + 1 vendedor + 1 o más líneas de producto; folios que agrupan varios clientes se separan en convenios independientes).

## Estado global
- **Fase actual:** NO INICIADA — plan en revisión del humano, ninguna fase tiene GO todavía.
- **Actualizado:** 2026-10-23

## Fase 1 — Modelo de datos y autorización base
- **Objetivo:** tablas y permisos mínimos para crear/listar/editar un convenio a mano (sin MBA3 ni CSV todavía), con la lista de autorizadores y el registro de quién/cuándo autorizó.
- **Tareas previstas:** migración `comercial_convenios` (cabecera: código/folio de origen opcional, cliente y vendedor por código + snapshot de nombre, fecha de inicio, vigencia fin nullable, estatus, autoriza_id/autoriza_nombre/fecha_autoriza, observaciones) + `comercial_convenio_productos` (línea: código de producto + snapshot, empaque/mínimo de paquete, unidad de medida, cantidad a facturar periódicamente, periodo, precio compra/venta, factor) + `comercial_autorizadores` (lista administrable de usuarios que pueden autorizar, mantenida por super_admin); nueva opción de permiso "Convenios" dentro de Comercial (consulta/edición, patrón existente); regla de autorización copiando vacaciones (nunca lo propio, solo quien está en la lista o super_admin); backend CRUD + endpoint de autorizar/rechazar; auditoría con `registrarAccion`.
- **Puerta:** GO del humano antes de pasar a integrar MBA3.

## Fase 2 — Integración de lectura MBA3 (clientes, vendedores, productos, existencias, ventas)
- **Objetivo:** que el convenio traiga datos reales de MBA3 en vez de captura manual.
- **Tareas previstas:** cliente HTTP para `https://mba3api.rayhsa.net` (login/refresh/logout, manejo de expiración de `access_token`); confirmar contra `/openapi.json` real los endpoints equivalentes a `ficha-cliente` para vendedor, producto, existencias e historial de ventas (no confirmados en el manual); autocompletar cliente/vendedor/producto al capturar su código; decidir y aplicar caché local vs. consulta en vivo (recomendado: snapshot al crear + refresco periódico/al abrir dashboard, nunca bloquear la captura si MBA3 no responde); credenciales de servicio para la intranet (a gestionar con quien administra la API).
- **Puerta:** GO del humano; probablemente necesite credenciales reales antes de cerrarla.

## Fase 3 — Carga histórica del CSV de convenios actuales
- **Objetivo:** migrar los convenios ya existentes del CSV adjuntado a las tablas nuevas, una sola vez.
- **Tareas previstas:** parser dedicado (reutilizando `ImportadorArchivo` + patrón de `importarDepartamentos`: validación por fila, modo migración única, lotes, advertencias) para normalizar: FOLIOS (agrupar líneas del mismo folio+cliente en un convenio con varias líneas de producto; folios con varios clientes se separan), CONSUMO (formatos mixtos → cantidad + periodo), montos y FACTOR, VIGENCIA (fecha o "No vigente"), OBSERVACIONES (señales como "Si comprar"/"Ya no comprar"); reporte de filas migradas/omitidas/con advertencia.
- **Puerta:** GO del humano, con revisión del reporte de la carga antes de confirmarla.

## Fase 4 — Registro real de consumo y tiempo estimado
- **Objetivo:** llevar el consumo real contra lo planeado, no solo un estimado por fechas.
- **Tareas previstas:** tabla `comercial_convenio_movimientos` (línea de producto, fecha, cantidad facturada, quién la registró, comentario); endpoint para registrar un movimiento; cálculo de tiempo estimado para consumir el stock adquirido (a definir la fórmula exacta con el humano: por ejemplo, stock comprado restante ÷ ritmo real de consumo de los movimientos recientes) y de avance real vs. plan.
- **Puerta:** GO del humano; aquí se fija la fórmula exacta de "tiempo estimado" si no quedó clara antes.

## Fase 5 — Dashboard/reporte de estado del convenio
- **Objetivo:** pantalla con el estado de todos los convenios y detalle por convenio.
- **Tareas previstas:** KPIs globales (activos, por vencer, vencidos, sin movimientos recientes) reusando `KPICard`/`BarChart`/`DonutChart`/`TablaCard`; nuevo componente de barra de progreso/semáforo (no existe en el proyecto) para consumo real vs. plan y proximidad de vigencia; vista de detalle por convenio con histórico de movimientos.
- **Puerta:** GO del humano.

## Fase 6 — Endurecimiento, revisión y pruebas integrales
- **Objetivo:** cerrar la tarea con la misma disciplina que las anteriores (revisor + tester reales, sin mocks de BD).
- **Tareas previstas:** revisión transversal de permisos/autorización, pruebas de concurrencia si aplica, pruebas con Postgres real y navegador real, documentación (`docs/comercial/`), commit por fase ya hecho en cada una, GO/NO-GO final antes de desplegar.
- **Puerta:** GO final del humano.
