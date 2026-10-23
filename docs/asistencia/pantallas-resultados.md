# Pantallas de resultados de Asistencia (Fase 5, parte 2a)

Rutas bajo `/rh/asistencia/` (grupo «Asistencia» del menú de RH): `resultados`, `periodos`, `parametros`. Código: `modules/rh/frontend/pages/Asistencia{Resultados,Periodos,Parametros}Page.jsx`,
`components/asistencia/{CuadriculaAsistencia,DetalleDiaDialogo,PeriodoDialogos,EstatusInsignia}.jsx`, lógica pura en `utils/asistencia{Resultados,Periodos,Parametros}.js` (pruebas
`modules/rh/tests/asistenciaResultados.util.test.js`) y estilos `styles/asistenciaResultados.css`.

## Quién ve qué

- **Leer** (resultados de todos, periodos, parámetros, sin identificador, ajustes, bitácora): `Asistencia:edicion` o `Empleados:edicion` (rh_admin y super_admin). **Escribir** (justificar, anular, cerrar, reabrir,
  recalcular, resolver ajustes, guardar parámetros): `Asistencia:edicion`. Un rol con solo `Empleados:edicion` ve todo en solo lectura. `rh_empleado`, `portal_admin`, jefes y empleados no ven las tres entradas
  del menú y las rutas responden «No tienes permiso» (la API da 403 en lo de gestión; los endpoints de resultados siguen limitados a su alcance).
- El menú usa el modo estricto del grupo y exige el tipo `edicion` (el `Asistencia:consulta` de `rh_empleado` no basta).

## Endpoints añadidos (`/api/asistencia`)

| Ruta | Permiso | Qué hace |
|---|---|---|
| `GET /resultados/dia?empleado_id&fecha` | `Asistencia:consulta` + alcance (como `/resultados`) | día con snapshot del turno, marcas del día local (el siguiente también si el turno cruza la medianoche, tope 100), cruces (vacaciones, permiso, festivo, justificación activa). Quién justificó solo lo ve RH. 404 si el día no tiene resultado |
| `GET /ejecuciones?limite` (1-100, 20) | RH (lectura) | bitácora del motor (sin datos personales; error recortado a 120 caracteres) |
| `POST /resultados/exportaciones` `{tipo: resumen\|detalle, filas}` | RH (lectura) | rastro de la exportación en auditoría (`EXPORTAR_ASISTENCIA`, solo tipo y filas, tope 10 000). Si la bitácora falla responde 500 y la pantalla lo avisa |
| `GET /resumen` | sin cambio de permisos | ahora trae `departamento`, `dias_con_marcas`, `faltas_con_marcas` e `incompletas_comida` |
| `GET /periodos` | sin cambio | ahora trae `dias_pendientes`, `cerrado_por_nombre` y `reabierto_por_nombre` (estos dos, y el motivo, solo para RH) |
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

1. En *Resultados* elige la quincena. Revisa las tarjetas y el % de puntualidad (= puntuales ÷ puntuales + retardos + faltas + salidas anticipadas + incompletas + justificadas; no cuentan descansos, festivos, vacaciones, permisos ni pendientes).
2. Recorre los atajos «Para revisar»: **Más faltas** (¿no checan por su puesto o su código apunta a otra persona?), **Faltas con marcas** (llegó más de 30 min tarde u otra marca fuera de lo esperado), **Incompletas por comida**
   (la última marca cae entre 13:00 y 16:00: ¿salió a comer y no volvió, o se fue y olvidó checar?) y **Sin ninguna marca**.
3. Abre la cuadrícula de 5 a 10 empleados y compara con la lista de BioTime. Justifica lo que corresponda (motivo obligatorio); se puede anular y el día vuelve a su cálculo original.
4. Revisa «Empleados sin identificador»: no se analizan hasta asignar su nómina con la plantilla de carga de empleados y re-vincular las marcas (Marcas).
5. Registra antes las vacaciones, permisos e incapacidades que falten, **recalcula** (Periodos) y vuelve a mirar las faltas.

## Cuándo cerrar

- Solo una quincena ya terminada. La confirmación muestra los días pendientes, los ajustes pendientes y los empleados sin identificador. **Cerrar congela el resultado**: no se recalcula aunque cambien turnos, vacaciones o permisos.
- Cierra cuando (a) el conteo de pendientes es 0, (b) los ajustes están resueltos, (c) los sin identificador ya están corregidos o aceptados, y (d) las vacaciones y permisos de la quincena están capturados.
- El cierre automático rige desde la quincena 16-31 oct (3 días después de terminar); las anteriores se cierran a mano. Una quincena reabierta ya no se cierra sola.
- Para corregir una cerrada: **Reabrir** con motivo (mínimo 10 caracteres), corregir, recalcular y volver a cerrar. Las marcas que lleguen después del cierre aparecen en *Ajustes pendientes*; «Resolver» solo las marca como atendidas (no recalcula).

## Qué hacer con las faltas sin marcas

Una falta sin ninguna marca puede ser inasistencia real, vacaciones o permiso no capturados, un código del checador mal asignado o un empleado que no checa. Primero captura vacaciones/permisos/incapacidades y recalcula; si sigue, revisa el
código con *Marcas*; si es una ausencia justificada, usa **Justificar** con el motivo.

## Parámetros

Comida (desde < hasta, HH:MM), días de cierre (0-30), cierre automático desde, margen del día completo (0-720), analizar desde, ventana de seguridad (0-31) y barrido completo (1-168). Guardar siempre pide confirmar y muestra el impacto
(«Cambiar la ventana de comida recalcula SOLO las quincenas abiertas; las cerradas conservan el valor con el que se calcularon.»). Cambiar `analisis_desde` exige escribir CAMBIAR. El recálculo de la ventana ocurre en el siguiente barrido o con *Recalcular*.

## Exportación

CSV con BOM UTF-8, saltos CRLF, fórmulas neutralizadas y tope de 10 000 filas; incluye nombre y nómina (a diferencia del CSV de marcas, esto es el resultado que RH ya ve en pantalla) y queda en auditoría con solo el tipo y el número de filas.

## Pruebas

Jest: `asistenciaResultados.util.test.js` (utils puros) y `asistenciaResultadosRH.api.test.js` (matriz de permisos, alcance, validaciones, auditoría, 500 genéricos). No hay pruebas de componente ni E2E en el repo: se verificó con un *harness externo*
(Vite sobre el `main.jsx` real con `lib/supabase` simulado, backend real, Postgres desechable y Chromium + axe-core). Al cambiar estas pantallas hay que repetir una verificación equivalente (filtros, cuadrícula con teclado, justificar/anular, cerrar/reabrir, 409, parámetros, CSV, 320/360/768).
