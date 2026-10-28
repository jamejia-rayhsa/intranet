# Mi asistencia y Mi equipo

Dos pantallas de solo lectura dentro del submenú de RH (fuera del grupo «Asistencia», que es de administración).
Justificar, cerrar quincenas y recalcular siguen siendo de RH.

## Qué ve cada rol

| Quién | Qué ve |
|---|---|
| Empleado **activo** con cuenta vinculada y `Asistencia:consulta` | **Mi asistencia** (`/rh/asistencia/mi-asistencia`): su quincena, tarjetas, cuadrícula y detalle del día, con el motivo de las justificaciones que RH le hizo. |
| Jefe inmediato **vigente** y **activo** de al menos un empleado activo | Además **Mi equipo** (`/rh/asistencia/mi-equipo`): estado de hoy, resumen de la quincena y detalle de sus subordinados **directos** (no los de sus subordinados, ni pares, ni su jefe). Ve el motivo de las justificaciones de su equipo. |
| RH (`Empleados:edicion` o `Asistencia:edicion`) | Las pantallas de gestión de siempre. Si además es empleado/jefe, Mi asistencia y Mi equipo muestran solo lo suyo y su equipo (`?equipo=1`). Es el único que ve el nombre de quien justificó (los demás leen «RH»). |
| Usuario sin empleado vinculado, o sin `Asistencia:consulta` | Sin entradas en el menú; la ruta explica el motivo. |

Un empleado o jefe **dado de baja o suspendido** pierde las dos pantallas y todas las lecturas de inmediato (403; el menú desaparece y la ruta dice «Tu registro está dado de baja o suspendido»), aunque conserve su cuenta y subordinados asignados. Hoy la baja no desactiva ni desvincula la cuenta de usuario: se recomienda hacerlo aparte. Un empleado de baja no conserva acceso a su historial.

Equipo del jefe: subordinados directos **activos**; un suspendido no cuenta; un subordinado dado de baja aparece solo en los rangos que se solapan con el periodo en que estuvo activo (su `fecha_baja` es igual o posterior al inicio del rango), marcado «baja». Un ciclo de jefes (A jefe de B y B de A) se rechaza al editar al empleado.

El menú lo decide el servidor con `GET /api/asistencia/mi-contexto` (caché de 60 s en el cliente).

## Cómo leer un día

La cuadrícula muestra un día por cuadro con color, ícono y texto. Al tocar un día se explica en palabras sencillas:
horario del turno, tus marcas en hora de México (el UTC aparece solo al pasar el cursor), por qué quedó así, la
comida (con 2 o más marcas se mide de la primera a la última; el exceso es solo informativo), vacaciones, permisos,
festivos y, si RH lo justificó, el motivo. Los minutos de retardo son los minutos reales de llegada tarde (si entras
08:14 con entrada 08:00 son 14, y la tolerancia de 10 solo decide si cuenta como retardo). El **% de puntualidad** no cuenta los días justificados (ni suben ni bajan el porcentaje).

Mientras la quincena está **abierta** los resultados pueden cambiar (el sistema se actualiza cada ~15 minutos);
**cerrada** es definitiva. El análisis empieza en la fecha `analisis_desde` (hoy 2026-09-01).

### Lo que el jefe no ve (privacidad)

Del equipo, el jefe no recibe el tipo de permiso (solo «Permiso»; el tipo, p. ej. incapacidad, lo ven el propio empleado y RH), ni las horas ni el exceso de la comida (solo «Comida: N marcas» y la regla), ni la última marca del día, ni la terminal. Los textos para el jefe son neutros. A quien no es RH no le llegan ids internos ni el detalle completo del motor (lista blanca de campos) ni datos de gestión de los periodos.

## Si algo no cuadra

Avisa a RH: puede revisar las marcas, justificar el día o corregir datos. Avisos que verás:
sin número de nómina (tus marcas no se pueden relacionar), sin turno asignado, nómina compartida con otro registro,
cuenta sin empleado vinculado.

## API (solo GET)

- `GET /mi-contexto`: empleado vinculado, `tiene_nomina`, turno de hoy, `es_jefe`, `subordinados_directos`, `analisis_desde`, `periodo_actual`.
- `GET /mi-equipo/hoy`: subordinados directos con la fila de hoy del motor y las marcas de hoy (sin recalcular reglas).
- `GET /resumen` y `/resultados` aceptan `equipo=1` (solo directos, sin el propio empleado, aun para RH).
- A quien no es RH, `/resultados`, `/resumen`, `/resultados/dia` y `/periodos` no devuelven ids internos, `terminal_sn`, quién cerró/reabrió, motivo de reapertura ni conteos globales de periodos.
