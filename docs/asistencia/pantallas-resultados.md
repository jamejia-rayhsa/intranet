# Pantallas de resultados de Asistencia (Fase 5, parte 2a)

Rutas bajo `/rh/asistencia/` (grupo «Asistencia» del menú de RH): `resultados`, `periodos`, `parametros`. Código: `modules/rh/frontend/pages/Asistencia{Resultados,Periodos,Parametros}Page.jsx`,
`components/asistencia/{CuadriculaAsistencia,DetalleDiaDialogo,PeriodoDialogos,EstatusInsignia}.jsx`, lógica pura en `utils/asistencia{Resultados,Periodos,Parametros}.js` (pruebas
`modules/rh/tests/asistenciaResultados.util.test.js`) y estilos `styles/asistenciaResultados.css`.

## Quién ve qué

- **Leer** (resultados de todos, periodos, parámetros, sin identificador, ajustes, bitácora): `Asistencia:edicion` o `Empleados:edicion` (rh_admin y super_admin), **sin exigir además `Asistencia:consulta`** (la API acepta cualquiera de las dos; un rol con solo `Empleados:edicion` ve las pantallas sin 403). Las lecturas compartidas (`/resultados`, `/resumen`, `/periodos`, `/resultados/dia`) siguen abiertas con `Asistencia:consulta` y alcance propio/subordinados. El filtro de departamento sale del propio resumen (no pide `/departamentos`). **Escribir** (justificar, anular, cerrar, reabrir,
  recalcular, resolver ajustes, guardar parámetros): `Asistencia:edicion`. Un rol con solo `Empleados:edicion` ve todo en solo lectura. `rh_empleado`, `portal_admin`, jefes y empleados no ven las tres entradas
  del menú y las rutas responden «No tienes permiso» (la API da 403 en lo de gestión; los endpoints de resultados siguen limitados a su alcance).
- El menú usa el modo estricto del grupo y exige el tipo `edicion` (el `Asistencia:consulta` de `rh_empleado` no basta).

## Endpoints añadidos (`/api/asistencia`)

| Ruta | Permiso | Qué hace |
|---|---|---|
| `GET /resultados/dia?empleado_id&fecha` | `Asistencia:consulta` + alcance (como `/resultados`; un jefe solo ve a sus subordinados directos) | día con snapshot del turno, marcas del día local con su `rol` (entrada, salida, comida, duplicada u otra: lo calcula `clasificarMarcas` del motor, no la pantalla; el siguiente día también si el turno cruza la medianoche; tope 100 con `marcas_truncadas`; `terminal_sn` solo para RH), cruces (vacaciones, permiso, festivo, justificación activa). Quién justificó solo lo ve RH. 404 si el día no tiene resultado |
| `GET /periodos/:id/contadores` | RH (lectura) | contadores FRESCOS del cierre: `dias_pendientes`, `ajustes_pendientes`, `sin_identificador` |
| `POST /resultados/dias` `{desde,hasta,empleado_ids,limite,despues_id}` | RH (lectura) | días de los empleados ya filtrados para el CSV de detalle, paginados por clave (id) con `total` real en la primera página y `siguiente`; hasta 5 000 empleados |
| `GET /ejecuciones?limite` (1-100, 20 por omisión) | RH (lectura) | bitácora del motor (sin datos personales; error recortado a 120 caracteres) |
| `POST /resultados/exportaciones` `{tipo: resumen\|detalle, filas}` | RH (lectura) | rastro de la exportación en auditoría (`EXPORTAR_ASISTENCIA`, solo tipo y filas, tope 15 000). Si la bitácora falla responde 500 y la pantalla NO descarga el archivo |
| `GET /resumen` | sin cambio de permisos | ahora trae `departamento`, `dias_con_marcas`, `faltas_con_marcas` e `incompletas_comida` |
| `GET /periodos` | sin cambio de permisos | ahora trae `dias_pendientes`; `cerrado_por`, los nombres de quien cerró/reabrió y el motivo solo para RH. La lectura de quincenas sigue abierta a quien tenga `Asistencia:consulta`; el 403 de «gestión» aplica a la pantalla y a sus escrituras y lecturas de gestión |
| `POST /periodos/:id/cerrar` | `Asistencia:edicion` | exige `esperados: {ajustes_pendientes, sin_identificador}` (lo que RH vio al confirmar; si el servidor ve otros valores: 409 «Los datos cambiaron…» con los datos frescos), 409 si la quincena no terminó (fecha de México) o tiene días `pendiente` (sin «forzar»); la auditoría guarda los contadores |
| `POST /periodos/:id/reabrir` | `Asistencia:edicion` | motivo de 10 a 500 caracteres |
| `PUT /parametros` | `Asistencia:edicion` | cambiar `analisis_desde`, `cierre_automatico_desde` o `dias_cierre` exige `confirmacion: "CAMBIAR"` (sin ella, 400); la ventana de comida se valida dentro de la transacción |
| `GET /parametros` | sin cambio | ahora trae `minimo` y `maximo` |

El motor, sus reglas y sus resultados no se tocaron.

## Cómo leer un día (detalle)

1. **Resultado**: estatus (color + ícono + texto), minutos de retardo y de salida anticipada, comida (`minutos_comida`, exceso solo informativo). Si está justificada, el cálculo original. Si es pendiente, el cálculo provisional.
2. **Regla que produjo el estatus**: la primera explicación del motor («Falta: Sin marcas en el día: no hay marca de entrada hasta las 08:30»); debajo, el resto.
3. **Marcas del día** en hora de México (pasa el cursor para ver el UTC). Cada una dice cómo se usó: *Entrada (tomada)*, *Salida (tomada)*, *Comida* (cae en la ventana de comida), *Duplicada* (≤ 60 s de otra) o *No usada*.
4. **Turno usado**: es el snapshot con el que se calculó (nombre, horario, hasta qué hora vale la entrada, tolerancias, ventanas, comida), no necesariamente el turno de hoy.
5. **Qué hay que revisar**: las banderas en español (`ultima_marca_en_comida`, `exceso_comida`, `marca_intermedia_sin_salida`…).
6. **Cruces**: vacaciones, permiso, festivo y justificación (quién y cuándo, para RH).

## Cómo validar una quincena con RH

1. En *Resultados* elige la quincena. Revisa las tarjetas y el % de puntualidad (son del periodo completo; los filtros solo afectan la tabla y su total aparece en una línea aparte) (= puntuales ÷ puntuales + retardos + faltas + salidas anticipadas + incompletas + justificadas; no cuentan descansos, festivos, vacaciones, permisos ni pendientes).
2. Recorre los atajos «Para revisar»: **Más faltas** (¿no checan por su puesto o su código apunta a otra persona?), **Faltas con marcas** (llegó más de 30 min tarde u otra marca fuera de lo esperado), **Incompletas por comida**
   (la última marca cae entre 13:00 y 16:00: ¿salió a comer y no volvió, o se fue y olvidó checar?) y **Sin ninguna marca**.
3. Abre la cuadrícula de 5 a 10 empleados y compara con la lista de BioTime. Justifica lo que corresponda (motivo obligatorio); se puede anular y el día vuelve a su cálculo original.
4. Revisa «Empleados sin identificador»: no se analizan hasta asignar su nómina con la plantilla de carga de empleados y re-vincular las marcas (Marcas).
5. Registra antes las vacaciones, permisos e incapacidades que falten, **recalcula** (Periodos) y vuelve a mirar las faltas.

## Cuándo cerrar

- Solo una quincena ya terminada y **sin días pendientes** (el servidor lo exige: 409, sin excepción). Al abrir la confirmación se consultan contadores frescos (días pendientes, ajustes pendientes, empleados sin identificador) y se envían como `esperados`; si cambian antes del clic, el servidor responde 409 y la pantalla recarga los números. **Cerrar congela el resultado**: no se recalcula aunque cambien turnos, vacaciones o permisos.
- Cierra cuando (a) el conteo de pendientes es 0 (si no, recalcula el rango), (b) los ajustes están resueltos, (c) los sin identificador ya están corregidos o aceptados, y (d) las vacaciones y permisos de la quincena están capturados.
- El cierre automático rige desde la quincena 16-31 oct (3 días después de terminar); las anteriores se cierran a mano. Una quincena reabierta ya no se cierra sola.
- Para corregir una cerrada: **Reabrir** con motivo (mínimo 10 caracteres), corregir, recalcular y volver a cerrar. Las marcas que lleguen después del cierre aparecen en *Ajustes pendientes*; «Resolver» solo las marca como atendidas (no recalcula).

## Qué hacer con las faltas sin marcas

Una falta sin ninguna marca puede ser inasistencia real, vacaciones o permiso no capturados, un código del checador mal asignado o un empleado que no checa. Primero captura vacaciones/permisos/incapacidades y recalcula; si sigue, revisa el
código con *Marcas*; si es una ausencia justificada, usa **Justificar** con el motivo.

## Parámetros

Comida (desde < hasta, HH:MM), días de cierre (0-30), cierre automático desde, margen del día completo (0-720), analizar desde, ventana de seguridad (0-31) y barrido completo (1-168). Guardar siempre pide confirmar y muestra el impacto
(«Cambiar la ventana de comida recalcula SOLO las quincenas abiertas; las cerradas conservan el valor con el que se calcularon.»). Cambiar `analisis_desde`, `cierre_automatico_desde` o `dias_cierre` exige escribir CAMBIAR (también lo exige el servidor); el texto de impacto nombra las quincenas abiertas que el cierre automático congelaría con los valores nuevos. El recálculo de la ventana ocurre en el siguiente barrido o con *Recalcular*.

## Exportación

CSV con BOM UTF-8, saltos CRLF, fórmulas neutralizadas (también con espacios antes del signo; un nombre que empiece con - o + sale con ' al inicio) y tope de 15 000 filas. **Se audita antes de descargar** (si la bitácora falla no se entrega el archivo). El detalle se pide al servidor ya filtrado (empleado, departamento, estatus, atajo) y paginado por clave hasta el tope; si se corta, la pantalla dice cuántas filas se exportaron de cuántas hay y la última fila del archivo dice «Se truncó a N filas». Acotar el rango o filtrar a menos empleados sí ayuda. Incluye nombre y nómina (decisión confirmada: RH ya ve esos datos en pantalla) y queda en auditoría con solo el tipo y el número de filas.

## Pendiente / documentado (revisión R2A)

- R2A-11d: no hay E2E de Playwright en el repo (no hay dependencia); se repite el harness externo. R2A-15: el motivo de una justificación lo ven también jefe y empleado (a la espera de una decisión del humano). R2A-5: el número de filas auditado lo declara el cliente.

## Pruebas

Jest: `asistenciaResultados.util.test.js` (utils puros) y `asistenciaResultadosRH.api.test.js` (matriz de permisos, alcance, validaciones, auditoría, 500 genéricos). No hay pruebas de componente ni E2E en el repo: se verificó con un *harness externo*
(Vite sobre el `main.jsx` real con `lib/supabase` simulado, backend real, Postgres desechable y Chromium + axe-core). Al cambiar estas pantallas hay que repetir una verificación equivalente (filtros, cuadrícula con teclado, justificar/anular, cerrar/reabrir, 409, parámetros, CSV, 320/360/768).

## Menú

La altura abierta de un grupo del menú no es fija (`max-height: none` en CSS; `MenuDinamico` anima midiendo el contenido): cualquier número de enlaces es alcanzable y el sidebar hace scroll propio si no cabe en el viewport.
