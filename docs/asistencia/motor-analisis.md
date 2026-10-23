# Motor de análisis de asistencia

Califica cada día de cada empleado a partir de las marcas del checador (ya ingeridas con la llave, ver `contrato-ingesta-marcas.md`), su turno, el calendario laboral, las vacaciones y los permisos aprobados. Corre solo dentro del backend, cada 15 minutos, y también a demanda de RH por la API. Las pantallas son la Fase 5; este documento cubre el motor, sus reglas, su operación y su API.

Código: `modules/rh/backend/services/asistencia/` (`motor.js` es la función pura que califica un día; `motorAsistencia.js` lee/escribe en la BD; `planificador.js` programa las vueltas; `candado.js` evita que corran dos a la vez) y `controllers/asistenciaMotor.controller.js` (API). Migración: `014-asistencia-motor.sql`.

## 1. Estatus y reglas

Todas las horas son **America/Mexico_City** (la conversión de los instantes UTC la hace `Intl`; no hay horario de verano desde 2022 y la base de zonas sigue tratando bien los años anteriores). Los minutos son enteros: **los segundos de cada marca se truncan** (08:10:59 cuenta como el minuto 08:10).

Orden de precedencia (el primero que aplica gana):

| # | Estatus | Cuándo |
|---|---|---|
| 1 | `no_aplica` | antes de `analisis_desde`, antes de `fecha_ingreso` o después de `fecha_baja`. No se guarda |
| 2 | `sin_identificador` | el empleado no tiene `numero_nomina`, o comparte la misma nómina con otro empleado en el mismo periodo de empleo. **No se analiza** (de lo contrario tendría falta todos los días) y no se guarda; aparece en `GET /sin-identificador` |
| 3 | `sin_turno` | ningún turno efectivo ese día (ni individual ni de su departamento). No es falta |
| 4 | `descanso` | el turno no trabaja ese día de la semana (sábado y domingo en el turno Rayhsa). Si hay marcas se informan (`trabajo_en_descanso`) pero no se califican |
| 5 | `festivo` | `calendario_laboral` activo de tipo `oficial` u `otorgado`. *Actividad de empresa* y *evento* no cambian el día |
| 6 | `vacaciones` | solicitud **aprobada** que cubre el día, en día hábil (lunes a viernes; los festivos ya ganaron en el paso anterior) |
| 7 | `permiso` | `permisos_ausencia` con `estatus = 'aprobado'` que cubre el día |
| 8 | con marcas | `puntual`, `retardo`, `salida_anticipada`, `incompleta`, `falta` o `pendiente` (abajo) |
| 9 | `justificada` | RH justificó (incidencia) una `falta`, `retardo`, `salida_anticipada` o `incompleta`: el cálculo original queda en `detalle.calculo_original` |

### Días con marcas (turno Rayhsa: entrada 08:00, salida 18:00, comida de 60 min dentro de la ventana 13:00-16:00)

El día pertenece a la **fecha local de la entrada** (un turno nocturno 22:00-06:00 de un lunes termina el martes pero es del lunes).

* **Ventana de comida** (decisión del humano, global): `comida_desde = 13:00` y `comida_hasta = 16:00`, **inclusive en ambos extremos a nivel de minuto** (16:00:59 todavía es comida; 16:01 ya no). La duración esperada de la comida es el `descanso_min` del turno (60). Las marcas dentro de la ventana son **marcas de comida: nunca entrada ni salida**. Los turnos que cruzan la medianoche no usan la ventana (su corte es entrada + `ventana_entrada_despues`).
* **Entrada** = la primera marca del día local, desde las 00:00 (sin límite inferior: llegar temprano, p. ej. 06:50, nunca penaliza), siempre que sea anterior a `comida_desde` y no pase de `entrada + ventana_entrada_despues`. Si la primera marca del día cae dentro de la comida o después, es llegada tardía: **no hay entrada y el día es `falta`**. En un turno nocturno el límite inferior sigue siendo `entrada − ventana_entrada_antes` (las marcas de la mañana son la salida del turno del día anterior).
* **Salida** = la **última marca posterior a `comida_hasta`** (y posterior a la entrada), hasta `salida + ventana_salida_despues`. Si es anterior a `salida − tolerancia_salida` es `salida_anticipada` con sus minutos; si no, `puntual`. La `ventana_salida_antes_min` del turno ya no interviene (queda en el snapshot).
* Si la **última marca del día cae dentro de la comida** y no hay ninguna posterior, el día es `incompleta` con la bandera `ultima_marca_en_comida`: puede ser una salida a comer sin regreso o una salida anticipada, y **RH decide o justifica**. Una única marca en todo el día (entrada) también es `incompleta`.
* Con **dos o más marcas dentro de la ventana** el detalle trae `minutos_comida` (última − primera de la ventana) y, si superan `descanso_min`, la bandera `exceso_comida` y `exceso_comida_min`. Es **solo informativo**: no cambia el estatus.
* Marcas a **60 segundos o menos** de la anterior conservada son la misma marca (duplicado de la checada).

| Situación | Resultado |
|---|---|
| Entrada 07:55, salida 18:02 | `puntual` |
| Entrada 08:10:59 (minuto 10) | `puntual` (tolerancia 10) |
| Entrada 08:11:00 (minuto 11) | `retardo`, `minutos_retardo = 11` |
| Entrada 08:30:59 | `retardo` (30 min, aún dentro del umbral de falta) |
| Entrada 08:31:00 | `falta` (más de 30 min), `minutos_retardo = 31` |
| Entrada 08:15 y salida 17:56 | `retardo` con **ambos** minutos: `minutos_retardo = 15`, `minutos_salida_anticipada = 4` |
| Entrada 06:50 y salida 18:00 | `puntual` (llegar temprano no es falta) |
| 08:02 / 14:01 / 15:03 / 18:05 | `puntual`; `minutos_comida = 62` y `exceso_comida` (2 min, informativo) |
| 08:02 / 13:00 / 14:00 / 17:57 | `puntual` (60 min de comida) |
| Entrada 08:00 y salida 17:56 (4 min antes; la tolerancia de salida de Rayhsa es 3) | `salida_anticipada`, 4 min |
| 08:02 / 17:30 | `salida_anticipada`, 30 min |
| 08:00 / 17:50 | `salida_anticipada`, 10 min (excede la tolerancia de 3) |
| 08:02 / 14:10 (la última marca está en la comida) | `incompleta` con `ultima_marca_en_comida` |
| 08:02 / 16:00 exacto | `incompleta` con `ultima_marca_en_comida` (16:00 pertenece a la ventana) |
| 08:02 / 11:00 (marca suelta de la mañana) | `incompleta` con `marca_intermedia_sin_salida` |
| Una sola marca a las 08:02 | `incompleta` (`marca_unica`) |
| Primera marca del día a las 14:30 | `falta` (llegada tardía) |
| Sin marcas, o ninguna antes de las 13:00 | `falta` |
| Solo una marca a las 18:00 | `falta` con la bandera `salida_sin_entrada` |
| El día aún no termina | `pendiente` |

Un día **se califica solo cuando ya terminó**: la hora actual de México debe ser mayor o igual que `salida programada + margen_dia_completo_min` (por omisión 120 min, es decir, a partir de las 20:00 para Rayhsa). Antes es `pendiente` (con el cálculo provisional en `detalle.calculo_provisional`). Para un turno nocturno la comparación usa la salida del día siguiente.

`explicaciones` (texto para RH) y `banderas` quedan en `detalle`: `marcas_duplicadas`, `marca_unica`, `marcas_fuera_de_ventana`, `ultima_marca_en_comida`, `exceso_comida`, `marca_intermedia_sin_salida` (marcas sueltas de la mañana después de la entrada y ninguna salida), `salida_sin_entrada`, `trabajo_en_descanso`, `trabajo_en_festivo`, `marcas_en_vacaciones`, `marcas_en_permiso`, `turno_inactivo`, `dia_pendiente`, `nomina_duplicada`.

### Snapshot del turno (opción A de la decisión del 2026-10-21)

Cada día calculado guarda el turno usado: nombre, entrada y salida programadas, tolerancias, umbral de falta, ventanas, descanso, `origen_turno` (`departamento` o `empleado`), `departamento_id`, las marcas usadas como entrada y salida, `version_calculo` y el `periodo_id`. Editar un turno o transferir a alguien **no cambia los periodos cerrados**; los abiertos se recalculan con el turno nuevo. **Aviso para la pantalla de asignación (Fase 5):** un traslado a mitad de una quincena abierta reclasifica los días anteriores de esa quincena, salvo que RH asigne un turno individual con vigencia.

## 2. Parámetros

Tabla `asistencia_parametros`; se leen y editan con `GET/PUT /api/asistencia/parametros` (solo RH; `PUT` valida el formato HH:MM y que `comida_desde` < `comida_hasta`). Un cambio de la ventana de comida aplica a los periodos abiertos en el siguiente barrido completo (o con *Recalcular*). La migración los siembra solo si faltan (no pisa lo que RH editó).

| Clave | Inicial | Rango | Qué hace |
|---|---|---|---|
| `analisis_desde` | `2026-09-01` | fecha 2020-2100 | primer día que se analiza; lo anterior se guarda pero no se califica |
| `cierre_automatico_desde` | `2026-10-16` | fecha | solo las quincenas que **terminan** en esa fecha o después se cierran solas |
| `dias_cierre` | 3 | 0-30 | días después de terminada la quincena en que el motor la cierra (margen para marcas tardías de terminales sin red) |
| `margen_dia_completo_min` | 120 | 0-720 | minutos después de la salida a partir de los cuales el día se califica |
| `version_motor` | 1 | solo lectura | se guarda en cada día; súbela al cambiar las reglas para que el siguiente barrido reescriba todo |
| `ventana_seguridad_dias` | 7 | 0-31 | cada vuelta recalcula además los últimos N días de todos los empleados |
| `barrido_completo_horas` | 24 | 1-168 | cada cuántas horas se recalculan por completo los periodos abiertos |
| `comida_desde` | `13:00` | HH:MM | inicio de la ventana de comida (global; no hay comida por turno) |
| `comida_hasta` | `16:00` | HH:MM, mayor que `comida_desde` | fin de la ventana de comida (inclusive); la salida es la última marca posterior |

Las tolerancias, el umbral de falta, las ventanas y el descanso **no son parámetros del motor**: son del turno (`/api/asistencia/turnos`).

## 3. Periodos y cierre

Los periodos son **quincenas** (1-15 y 16-fin de mes), `asistencia_periodos`. El motor los crea según los necesita. Un periodo está `abierto` o `cerrado`:

* **Cierre automático**: cuando `fecha_fin + dias_cierre <= hoy` **y** `fecha_fin >= cierre_automatico_desde`. Con los valores iniciales solo cierra desde la quincena 16-31 de octubre de 2026 (la primera en cerrarse sola es el 3 de noviembre). Antes de cerrar hace una última pasada de cálculo del periodo.
* Las quincenas anteriores (1-15 sep, 16-30 sep, 1-15 oct) **se calculan pero quedan abiertas** hasta que RH las cierre a mano (`POST /periodos/:id/cerrar`), después de validarlas. Un cierre manual exige que la quincena ya haya terminado y también recalcula una última vez.
* Un periodo **cerrado no se recalcula**: ni el planificador, ni `POST /recalcular`, ni una edición de turnos. Hay tres defensas: el motor omite sus días, la transacción de escritura bloquea el periodo (`FOR SHARE`) y revisa su estado, y un trigger de la BD rechaza insertar o recalcular un día de un periodo cerrado.
* **Marcas que llegan o se vinculan después del cierre** (`fecha_importacion` posterior a `cerrado_en`, o una marca huérfana que se vincula a un empleado) no recalculan nada: quedan en `asistencia_ajustes_pendientes` (una fila por marca) para que RH decida si reabre el periodo. `POST /ajustes-pendientes/:id/resolver` los marca como atendidos.
* **Reapertura**: solo `rh_admin` y `super_admin`, con motivo obligatorio (5-500 caracteres) y auditoría. El periodo vuelve a `abierto`, se recalcula y **ya no se cierra solo** (RH lo cierra a mano).
* **Justificar** un día (`POST /incidencias`) solo es posible en un periodo abierto; en uno cerrado hay que reabrirlo primero. Las marcas nunca se modifican.

## 4. Planificador

Corre dentro del proceso del backend, **sin dependencias nuevas**, y solo cuando el proceso se ejecuta como servidor (`node app.js`); importar `app.js` (pruebas) no programa nada.

| Variable | Por omisión | Qué hace |
|---|---|---|
| `ASISTENCIA_MOTOR_ACTIVO` | `false` (dev y pruebas) · `true` en los compose de staging y prod | solo el valor `true` lo enciende |
| `ASISTENCIA_MOTOR_INTERVALO_MIN` | 15 | minutos entre vueltas (1-1440) |
| `ASISTENCIA_MOTOR_TIEMPO_MAX_MIN` | 10 | tiempo máximo **blando** por vuelta (se acota al 80 % del tope duro); el motor se detiene entre bloques y lo pendiente se retoma en la siguiente (1-120) |
| `ASISTENCIA_MOTOR_TIMEOUT_MIN` | 10 | **tope duro** de una vuelta (1-240): `statement_timeout` en la conexión de la vuelta y `SET LOCAL` en sus transacciones, más un vigilante que al vencer mata la sesión (`pg_terminate_backend`), destruye la conexión (el candado de sesión muere con ella), libera la vuelta y deja la ejecución en error `tiempo_excedido`. La siguiente vuelta corre normal |
| `ASISTENCIA_MOTOR_RETRASO_INICIAL_S` | 30 | espera antes de la primera vuelta tras arrancar (0-3600) |

Cada vuelta: (1) toma el candado, (2) **vincula las marcas huérfanas** (`Ingesta.vincularHuerfanas`), (3) recalcula lo afectado, (4) detecta ajustes pendientes y (5) cierra los periodos vencidos. Todo queda en `asistencia_ejecuciones` (tipo, estado, conteos; **sin datos personales**).

* **Qué se recalcula**: la primera vuelta y una vez cada `barrido_completo_horas` (o cuando se edita un turno) es **completa** (todos los empleados, todos los periodos abiertos). Las demás son **incrementales**: los últimos `ventana_seguridad_dias` días de todos, más los días con marcas importadas o vinculadas desde la vuelta anterior (con 2 min de solape), y los días afectados por cambios de calendario, vacaciones, permisos, incidencias, altas o cambios de empleados y nuevas asignaciones de turno.
* **Cursor y traslape**: la vuelta incremental toma las marcas con `fecha_importacion` posterior al inicio de la última vuelta exitosa **menos 10 minutos** (una marca cuya transacción de ingesta empezó antes pero se confirmó después no se pierde) y las aprobaciones de vacaciones y permisos hechas desde entonces (`fecha_autoriza` / `fecha_respuesta`). **Solo entran con el barrido completo (≤ 24 h) o con *Recalcular*** los cambios sin marca de tiempo: corregir las fechas de una vacación o permiso ya aprobados, terminar una asignación de turno, cambiar de jefe y borrar un permiso o festivo.
* **Latencia**: una marca llega a la intranet cuando la interfaz sincroniza (cada 15 min entre 07:00 y 20:00) y se refleja en el siguiente tick del motor (otros 0 a 15 min). En total, **hasta ~30 min** entre la checada y su resultado; no hay disparo inmediato tras la ingesta. Cambios que no dejan marca de tiempo (terminar una asignación de turno) se recogen en el barrido completo (≤ 24 h) o con `POST /recalcular`.
* **Varias réplicas**: el candado consultivo de PostgreSQL (`pg_try_advisory_lock(4501, 1)`, de sesión; no colisiona con 4217, 4301, 4302 ni 4410) asegura una sola ejecución; la otra réplica registra "vuelta omitida". No se retienen conexiones del pool entre vueltas.
* **Errores**: se registran como `la vuelta del motor falló (codigo XXXXX)` sin texto de PostgreSQL ni datos, y la siguiente vuelta reintenta. Nunca tumban el portal. Al recibir SIGTERM/SIGINT el planificador deja de programar y espera (hasta 5 s) la vuelta en curso.
* Una vuelta interrumpida (apagado a medias) deja su fila `en_curso`; la siguiente la marca como `error / interrumpida`.

## 5. API (`/api/asistencia`, JWT)

`recalcular`, `cerrar` y `reabrir` **no esperan** el candado: si hay un recálculo en curso responden 409 inmediato ("Hay un recálculo en curso"), sin retener una conexión.

Lectura de resultados (necesita `Asistencia:consulta`): **RH** (`Empleados:edicion` o `Asistencia:edicion`; `super_admin`) ve a todos; cualquier otro usuario ve **su empleado y a sus subordinados directos** (jefe inmediato vigente, leído en cada petición; un subordinado dado de baja solo aparece si su baja no es anterior al rango consultado). Un empleado fuera del alcance —ajeno o inexistente— recibe el mismo 403. Rango máximo 92 días; paginación `pagina` y `limite` (hasta 500).

| Método y ruta | Quién | Qué hace |
|---|---|---|
| `GET /resultados?desde&hasta[&empleado_id]` | alcance arriba | días calculados con turno, minutos, marcas usadas y `detalle` |
| `GET /resumen?desde&hasta[&departamento_id]` | alcance arriba | conteos por empleado y estatus (más minutos acumulados) |
| `GET /periodos[?estado]` | `Asistencia:consulta` | quincenas, estado, cierre, número de reaperturas y ajustes pendientes. `reabierto_motivo` y `reabierto_por` solo los ve RH |
| `POST /periodos/:id/cerrar` | `Asistencia:edicion` (rh_admin, super_admin) | recalcula y cierra (manual); 409 si ya está cerrado, aún no termina o hay un recálculo en curso |
| `POST /periodos/:id/reabrir` `{motivo}` | `Asistencia:edicion` | reabre con motivo; auditado |
| `POST /recalcular` `{desde,hasta[,empleado_id]}` | `Asistencia:edicion` | solo periodos abiertos; 409 si el motor está ocupado o todo el rango está cerrado |
| `GET /sin-identificador` | RH (lectura) | empleados que el motor no analiza (sin nómina o nómina repetida) |
| `GET /ajustes-pendientes[?resueltos=true]` | RH (lectura) | marcas posteriores al cierre |
| `POST /ajustes-pendientes/:id/resolver` `{nota?}` | `Asistencia:edicion` | marca el ajuste como atendido |
| `POST /incidencias` `{empleado_id,fecha,motivo}` | `Asistencia:edicion` | justifica una falta/retardo/salida anticipada/incompleta de un periodo **abierto** y recalcula ese día; a lo más **una** justificación activa por empleado y día (409 si ya hay) |
| `POST /incidencias/:id/anular` | `Asistencia:edicion` | anula la justificación (periodo abierto) y **recalcula el día**: vuelve a su resultado original |
| `GET /parametros` · `PUT /parametros` | RH (lectura) · `Asistencia:edicion` | valida rangos; `version_motor` no se edita |

Toda escritura queda en la auditoría (`CERRAR_PERIODO`, `REABRIR_PERIODO`, `RECALCULAR`, `RESOLVER_AJUSTE`, `JUSTIFICAR_DIA`, `ANULAR_INCIDENCIA`, `ACTUALIZAR_PARAM`; la columna `accion` admite 20 caracteres). Los errores 500 son genéricos. Con los roles del seed solo `rh_admin` y `super_admin` tienen `Asistencia:edicion`; `rh_empleado` solo tiene `Asistencia:consulta` y ve lo propio.

## 6. Cómo validar los resultados con RH

1. Que RH asigne la nómina a los 8 empleados que no la tienen (`GET /sin-identificador`) y espere una vuelta del motor: se vinculan sus marcas y se calculan sus días.
2. Elegir 5 a 10 empleados y una quincena (por ejemplo 1-15 sep) y comparar `GET /resultados` con su lista de asistencia de BioTime: mismos retardos, faltas y salidas anticipadas. `detalle.explicaciones` dice por qué cada día quedó como quedó y `marcas_usadas` qué marcas se tomaron como entrada y salida.
3. Revisar los casos de borde que RH quiera fijar: los segundos se truncan (08:10:59 es puntual), el umbral de falta (30 min) frente a la ventana de captura de BioTime (150 min), la tolerancia de salida por turno (3 min en Rayhsa y 0 en Logística).
4. Los días con la bandera `ultima_marca_en_comida` terminan con una marca entre las 13:00 y las 16:00: conviene preguntar al empleado si salió a comer y no volvió o si se fue y olvidó checar. 
5. Cerrar a mano cada quincena ya validada (`POST /periodos/:id/cerrar`); si luego llegan marcas tardías aparecerán como ajustes pendientes.

## 7. Límites conocidos

* Los segundos se truncan: no hay forma de distinguir 08:10:00 de 08:10:59.
* La comida es una ventana **global** (13:00-16:00): no hay comida por turno. Quien sale a comer y no regresa, o se va temprano en la tarde sin checar después de las 16:00, queda `incompleta` con `ultima_marca_en_comida`: el motor no puede distinguirlo y RH decide o justifica. Una salida anticipada real se detecta solo si la marca es posterior a las 16:00.
* Una sola marca antes de las 13:00 es `incompleta`; una sola marca de comida o posterior es `falta` (llegada tardía; después de las 16:00, con `salida_sin_entrada`): el motor no adivina más.
* Las **vacaciones aprobadas cubren de lunes a viernes**: no cubren un sábado laborable del turno (los turnos actuales tienen el sábado de descanso). Si algún día un turno trabaja sábado, las vacaciones de ese sábado no lo cubren y se calificará con las marcas.
* Una vuelta que se cuelga (tabla bloqueada, red) se aborta al vencer el tope duro; los cambios de esa vuelta que no alcanzaron a confirmarse se pierden y se reintentan en la siguiente.
* No se aplican las **correcciones de marca** de RH (`asistencia_incidencias` tipo `correccion_marca`): solo las justificaciones. Las marcas nunca se editan.
* No hay permisos por horas (`permisos_ausencia` solo trae fechas): un permiso de medio día cubre el día completo.
* El departamento del empleado no tiene historial: se usa el actual (por eso existe el snapshot y el cierre de periodos).
* Un turno nocturno cuya ventana de entrada cruza la medianoche usa marcas del día anterior y del siguiente; no se contemplan jornadas mayores de 24 h.
* Los festivos son para toda la empresa (el calendario no tiene alcance por sede).
* Una baja sin `fecha_baja` no se analiza (no se sabe hasta cuándo trabajó). Marcas posteriores a la baja o anteriores al ingreso quedan huérfanas (la vinculación respeta el periodo de empleo).
* Con una nómina repetida entre empleados con periodos de empleo traslapados ninguno se analiza hasta corregir los datos.
* Terminar una asignación de turno no deja marca de tiempo: su efecto llega con el barrido completo (hasta 24 h) o al pulsar *Recalcular*.
* Varias réplicas comparten el candado de PostgreSQL, pero el límite de tasa de la ingesta sigue siendo por proceso.

## 8. Verificación reproducible con PostgreSQL real

`scripts/asistencia/verificar-motor.js` siembra 71 empleados ficticios con casos especiales (sin nómina, sin departamento, nómina repetida, bajas e ingresos a mitad de periodo, turno individual y nocturno, vacaciones, permisos y festivos), arranca el backend real, carga marcas con el simulador (`jornadas`) por la ingesta con llave y compara **cada empleado-día** con un oráculo escrito aparte (la hora local la calcula PostgreSQL, no `Intl`). Incluye 8 empleados de borde (entrada 06:50, comida de 62 y de 60 min, última marca en la comida, 16:00 exacto, salida 17:50 y 17:30, una sola marca). Después prueba idempotencia, rendimiento, concurrencia, cierre automático, periodos cerrados intactos tras editar un turno o transferir, reapertura, marcas tardías y re-vinculadas, el planificador con dos réplicas, el tope duro con una vuelta colgada de verdad (tabla bloqueada) y la API con tokens HS256 por rol. Úsalo solo con una base **desechable**:

```bash
docker run -d --name pg-motor -e POSTGRES_PASSWORD=pw -p 55416:5432 postgres:16-alpine   # o supabase/postgres:17.6.1.136
docker exec -i pg-motor psql -U postgres -v ON_ERROR_STOP=1 --single-transaction -q < config/database/init.sql
node scripts/asistencia/verificar-motor.js --pg postgres://postgres:pw@127.0.0.1:55416/postgres --semilla 7
docker rm -f pg-motor
```

Tarda unos 3 minutos (una espera de ~70 s corresponde a las vueltas de un minuto del planificador). Sale con código 1 si alguna comprobación falla.
