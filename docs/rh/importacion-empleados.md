# Carga masiva de empleados y departamentos

Pantalla: RH > Empleados > **Importar** (y RH > Departamentos > **Importar**). Acepta `.xlsx`, `.xls` y `.csv`.
La plantilla descargable (`.xlsx`) trae la hoja **Empleados** (encabezados en el orden del expediente y 2 filas de
ejemplo FICTICIAS), **Instrucciones** y **Catálogos** (puestos, departamentos, ubicaciones y valores permitidos vigentes).
Con el botón "Descargar empleados actuales en este formato" (`GET /api/empleados/exportar-importacion`, mismo permiso que el listado
de empleados, auditado como `EXPORTAR_EMPLEADOS` solo con el número de filas) se baja la lista actual con las mismas columnas,
en orden único (nombre, apellidos, id), con las fechas AAAA-MM-DD formateadas en SQL (no dependen de la zona horaria) y el jefe
como número de nómina (o CURP si no tiene), para corregirla y reimportarla en modo actualizar. Contiene CURP, NSS, RFC y CLABE:
trátala como dato personal.

## Antes de la carga real

* **Una sola importación a la vez.** Las importaciones se serializan con un candado y el servidor admite como máximo **2 lotes
  ejecutándose a la vez**. Si hay otra en curso (u otra persona importando), el lote responde **409 "Hay otra importación en curso;
  el lote no se aplicó. Espera unos segundos y reintenta"**: no se aplicó nada de ese lote. La pantalla reintenta el mismo lote hasta
  3 veces (a los 2, 5 y 10 s) y, si persiste, lo marca "No se aplicó: otra importación en curso" (no "resultado no confirmado");
  basta volver a importar. La espera por el candado vence a los 3 s (`lock_timeout`), así que una importación atorada nunca congela
  el resto de la intranet.
* **Revisa el archivo a mano** antes de cargarlo: nombres, CURP, nóminas y fechas. En **modo actualizar comprueba que "insertados" sea 0**
  (todos los empleados del archivo ya existen): un "insertado" significa que una fila no coincidió con nadie y se creó un empleado nuevo.
* **Libros de Excel con sistema de fechas 1904** (Mac antiguo; Archivo > Opciones > Avanzadas > "Usar el sistema de fechas 1904"):
  se detecta y los números de serie se convierten con la época correcta (el mismo serial es 1462 días posterior que en un libro normal).
* **Número de nómina:** solo letras, dígitos, guion, guion bajo y punto. Con espacios (`700 002`) o con otros caracteres la **fila se
  rechaza** (sería un empleado distinto para el sistema y se duplicaría). `101.0` de Excel pasa a `101`.
* Si el mismo empleado aparece en dos lotes (más de 100 filas entre una y otra), en modo actualizar gana la última fila y la pantalla
  avisa "repetido en el archivo: se aplicó la última fila"; dentro de un mismo lote se aplica la primera y la otra se reporta repetida.
* No guardes la hoja de empleados actuales como CSV para reabrirla en Excel: una celda que empieza con `=`, `+`, `-` o `@` se evaluaría.

## Encabezados

Se reconocen sin importar acentos, mayúsculas, espacios ni puntuación y aceptan alias (`No. Nómina`, `Numero de Nomina`,
`Fecha de Nacimiento`, `Fecha nac.`, `Telefono celular`, `C.P.`, `Estado de nacimiento`, ...). La vista previa muestra
**Columnas ignoradas** (las que no se reconocieron, p. ej. por una errata) y **Columnas requeridas que faltan** (bloquea la
importación si faltan Nombre o Apellido Paterno). Los 17 encabezados del layout anterior siguen funcionando igual.

## Columnas de empleados (en el orden del expediente)

| Grupo | Columna (clave) | Formato / regla |
|---|---|---|
| Personales | Nombre (`nombre`), Apellido Paterno (`apellido_paterno`) | **Obligatorios**, 100 caracteres |
| | Apellido Materno | 100 caracteres |
| | Fecha Nacimiento | fecha |
| | CURP | 18 caracteres alfanuméricos (se pasa a mayúsculas). Si viene y es inválida, la **fila se rechaza** (no se puede identificar al empleado) |
| | RFC | 12 o 13 caracteres (mayúsculas) |
| | NSS | 11 dígitos; con 10 NO se completa con ceros: se omite con la advertencia "verifica el 0 inicial" |
| | Género, Estado Civil, Escolaridad | valores de la hoja Catálogos |
| | Estado de nacimiento | uno de los 32 estados |
| Contacto | Celular Personal, Teléfono de emergencia | 10 dígitos (se quitan espacios, guiones, paréntesis, puntos y +52 / 52 inicial) |
| | Correo Personal | correo válido, 255 |
| | Parentesco de emergencia (50), Contacto de emergencia (100) | texto |
| Domicilio | Calle (255), Colonia (100), Municipio (100) | texto |
| | Código postal | 5 dígitos (con 4 se completa con 0) |
| | Estado de residencia | uno de los 32 estados |
| Laborales | Número de Nómina | texto, 50; se recortan espacios y `101.0` de Excel pasa a `101` |
| | Fecha de alta IMSS, Fecha Ingreso, Fecha de renovación | fecha |
| | Tipo Contrato | valores de la hoja Catálogos |
| | Celular corporativo | 10 dígitos |
| | Infonavit, Fonacot | texto, 20 |
| | Puesto, Departamento, Ubicación | nombre del catálogo (sin acentos ni mayúsculas) |
| | Jefe (número de nómina), Jefe (CURP) | ver "Jefe inmediato" |
| Financieros | Banco | uno de la hoja Catálogos |
| | CLABE | 18 dígitos |
| | CP fiscal | 5 dígitos |
| Control | Estatus | `activo`, `baja` o `suspendido` (por omisión `activo` al crear). **Solo al crear**: en modo actualizar se ignora |
| | Fecha de baja (fecha), Motivo de baja (500) | Solo al crear (una baja exige fecha de baja; sin ella se crea activo con advertencia). En modo actualizar se ignoran |

**Fechas.** `AAAA-MM-DD`, `DD/MM/AAAA` (día primero) o celdas con formato de fecha de Excel; año entre 1900 y 2100. Una fecha
inválida **omite la fila**. **Ceros a la izquierda:** NSS, CP, nómina, CLABE y teléfonos deben ser TEXTO en Excel (la
plantilla ya trae las columnas con formato Texto); si Excel los convirtió en número ya perdieron los ceros (el NSS y el CP se
reparan solos; la CLABE no).

## Qué rechaza una fila y qué solo avisa

* **Error de la fila (no entra):** falta Nombre o Apellido Paterno, fecha inválida, nombre con caracteres no permitidos (NUL),
  **CURP presente pero inválida**, nómina con NUL o de más de 50 caracteres, **nómina que solo coincide con otra ignorando ceros a
  la izquierda** (`0101` vs `101`: posible duplicado), CURP o nómina que coincide con **varios** empleados existentes (resuelve el
  duplicado antes), conflicto de CURP/nómina y, en modo actualizar, **fila sin CURP ni nómina** (nunca se crea).
* **Advertencia (la fila entra SIN ese campo):** cualquier valor inválido de un campo opcional (CURP, RFC, NSS, CLABE, teléfono,
  código postal, correo, catálogos cerrados, longitudes, NUL). El resultado lista `fila`, `nombre`, `campo`, `valor recibido`
  (máx. 40 caracteres; para CURP/NSS/RFC/CLABE solo "formato inválido") y `motivo`. Se devuelven hasta 1000 por lote.
* **Aviso de catálogo:** puesto, departamento o ubicación que no existe: el empleado se importa sin ese dato (nuevo) o lo
  conserva (existente) y el resultado lo informa por nombre y número de filas.

## Qué hacer con los empleados que ya existen

* **Omitirlos** (por omisión): una fila cuya CURP o número de nómina ya existe se cuenta como duplicada y no se toca.
* **Actualizarlos con los datos del archivo:** se busca por **CURP** y, si la fila no trae CURP, por **número de nómina**.
  * Solo las celdas **con valor** sobrescriben; una celda vacía **nunca borra** datos. Nunca se cambia la cuenta de usuario.
  * La CURP y el número de nómina se **rellenan** si el empleado no los tiene (los empleados sin nómina se completan así).
    Si ya tiene un valor distinto, o si la CURP es de un empleado y la nómina de otro, la fila es un **error** (no se pisa).
  * Una fila sin CURP ni nómina es un **error** ("Sin identificador") y nunca se inserta. En modo **omitir/crear** sí se crea,
    con la advertencia de que reimportar el archivo la duplicará. Dos filas del mismo empleado en el mismo lote: la segunda se
    reporta como repetida.
  * **Estatus, fecha de baja y motivo de baja se ignoran** en los empleados existentes (una advertencia por fila): para dar de baja
    o reactivar usa la pantalla de Empleados. Nunca se reactiva a nadie por una celda del archivo.
  * Respuesta: insertados, actualizados (con solo el **número** de campos modificados por fila), sin cambios, duplicados,
    errores, advertencias, avisos de catálogo y jefes.
  * Cada lote de 100 filas va en **una transacción** (en ambos modos) con un **SAVEPOINT por fila**: un error de validación o un
    error SQL inesperado de UNA fila revierte solo esa fila, que se reporta ("No se pudo guardar la fila"), y el lote sigue. Solo un
    fallo del lote completo (conexión, lectura) lo deshace todo (500 genérico; la pantalla lo marca "no confirmado").
  * **Concurrencia:** al empezar, cada transacción toma un candado de aplicación (`pg_advisory_xact_lock(4410, 1)` empleados y su
    segunda pasada de jefes, `(4410, 2)` departamentos; no chocan con vacaciones 4217 ni turnos 4301/4302) y lee el estado DESPUÉS.
    Dos importaciones simultáneas con las mismas filas, en el orden que sea, se serializan: sin deadlocks, sin duplicados y sin
    ciclos de jefes. Las escrituras se hacen en orden determinista (actualizaciones por id, altas por clave).

## Jefe inmediato

`Jefe (número de nómina)` y/o `Jefe (CURP)`. El jefe puede venir en el mismo archivo (incluso en un lote posterior) o ya
existir. Como el archivo se envía en lotes, la asignación es una **segunda pasada** al final (`POST /api/empleados/importar/jefes`,
hasta 500 pares por petición). Se avisa y **no se asigna** en estos casos: jefe no encontrado, nómina y CURP del jefe que apuntan a
personas distintas, jefe ambiguo (la nómina o CURP del jefe coincide con varios empleados), jefe que no está activo (baja o
suspendido), auto-referencia (A es jefe de A) y ciclos (A→B→A o más largos, incluso contra jefes que ya estaban en la BD;
ningún miembro del ciclo recibe la asignación nueva). Una celda vacía nunca quita un jefe. La segunda pasada toma el mismo candado y revalida los ciclos contra la BD dentro de él. Si hay más de 500 pares, la
detección de ciclos entre peticiones distintas protege igual (la segunda arista que cierra el ciclo se rechaza), pero las aristas de
la primera petición ya quedaron asignadas. Si un lote falla, los jefes de los lotes ya guardados SÍ se asignan; un 401/403 detiene
todo con el mensaje de permisos (no se marca "resultado no confirmado").

## Límites y qué NO cubre

* El archivo se envía en lotes de hasta 100 filas y 80 kb de JSON (las celdas vacías no se envían); el servidor rechaza más de
  200 filas por petición (400).
* No cubre hijos, documentos del expediente, cuentas de usuario ni la baja con todos sus efectos (solo copia estatus/fecha/motivo).
* No hay `UNIQUE` en CURP ni nómina (pendiente del humano): dos importaciones simultáneas del mismo archivo pueden duplicar.
* CSV: se detecta UTF-8 (con o sin BOM) y, si no es válido, Windows-1252; separador coma, punto y coma o tabulador.
* Auditoría: `IMPORTAR_EMPLEADOS` (por lote) e `IMPORTAR_EMP_JEFES` solo con conteos, sin datos personales.

# Departamentos

Columnas: `Nombre` (**obligatorio**), `Área`, `Descripción`, `Cupo de vacaciones`, `Turno`, `Turno vigente desde` (fecha).
Mismo selector "Omitirlos / Actualizarlos"; coincidencia por **nombre** sin acentos ni mayúsculas; una celda vacía nunca borra.

* **Cupo de vacaciones:** entero de 1 a 999. Vacío = no cambia (al crear, 1). Inválido (0, `abc`, decimal) = advertencia y no se aplica.
* **Turno:** nombre de un turno **activo** (hoja Catálogos con su horario resumido). Fecha por omisión: hoy (America/Mexico_City).
  * Sin asignación vigente en esa fecha: se asigna. Mismo turno vigente: sin cambio.
  * Otro turno: se termina la vigente el **día anterior** a la fecha nueva y se crea la nueva, con los candados y la validación de
    traslape de `TurnoAsignacion`, en la transacción del lote.
  * Si la fecha no es posterior al inicio de la vigente, o se traslapa con otra asignación, esa **fila es un error** (se deshace
    solo esa fila con SAVEPOINT: su cupo tampoco cambia) y el lote sigue.
  * Turno inexistente o inactivo: **advertencia** (el resto de la fila se aplica).
  * Requiere `Turnos: edición` además de `Departamentos: edición`; sin el permiso la columna de turno se ignora con una advertencia.
* Respuesta: `insertados` (= `creados`), `actualizados`, `sin_cambios`, `duplicados`, `turnos_asignados`, `turnos_cambiados`,
  `turnos_sin_cambio`, `advertencias`, `errores`.
* La tabla de Departamentos muestra el **Turno actual** (solo lectura; el vigente hoy) únicamente a quien tiene `rh/Turnos` consulta.
* Dos departamentos existentes cuyos nombres solo difieren en acentos o mayúsculas: la fila que coincide con ellos es un **error**
  (no se elige uno). Un turno para un departamento **inactivo** es advertencia. Si una fila se revierte (SAVEPOINT), el estado en
  memoria también, así que las filas siguientes no ven cambios que ya no existen.
* Las filas de ejemplo de la plantilla son obviamente ficticias ("Departamento de Ejemplo 1", "Turno de Ejemplo"); no hay ninguna
  protección especial contra subirlas: en modo actualizar un nombre real en el archivo actualiza ese departamento.
* Auditoría `IMPORTAR_DEPTOS` (la columna `accion` admite 20 caracteres; `IMPORTAR_DEPARTAMENTOS` no cabe) solo con conteos.
