# Carga masiva de empleados y departamentos

Pantalla: RH > Empleados > **Importar** (y RH > Departamentos > **Importar**). Acepta `.xlsx`, `.xls` y `.csv`.
La plantilla descargable (`.xlsx`) trae la hoja **Empleados** (encabezados en el orden del expediente y 2 filas de
ejemplo FICTICIAS), **Instrucciones** y **Catálogos** (puestos, departamentos, ubicaciones y valores permitidos vigentes).
Con el botón "Descargar empleados actuales en este formato" se baja la lista actual con las mismas columnas para
corregirla y reimportarla en modo actualizar (la fecha sale como AAAA-MM-DD y el jefe como número de nómina, o CURP si no tiene).

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
| | CURP | 18 caracteres alfanuméricos (se pasa a mayúsculas) |
| | RFC | 12 o 13 caracteres (mayúsculas) |
| | NSS | 11 dígitos; con 10 se completa con un 0 a la izquierda y se avisa |
| | Género, Estado Civil, Escolaridad | valores de la hoja Catálogos |
| | Estado de nacimiento | uno de los 32 estados |
| Contacto | Celular Personal, Teléfono de emergencia | 10 dígitos (se quitan espacios, guiones, paréntesis, puntos y +52 / 52 inicial) |
| | Correo Personal | correo válido, 255 |
| | Parentesco de emergencia (50), Contacto de emergencia (100) | texto |
| Domicilio | Calle (255), Colonia (100), Municipio (100) | texto |
| | Código postal | 5 dígitos (con 4 se completa con 0) |
| | Estado de residencia | uno de los 32 estados |
| Laborales | Número de Nómina | texto, 50 |
| | Fecha de alta IMSS, Fecha Ingreso, Fecha de renovación | fecha |
| | Tipo Contrato | valores de la hoja Catálogos |
| | Celular corporativo | 10 dígitos |
| | Infonavit, Fonacot | texto, 20 |
| | Puesto, Departamento, Ubicación | nombre del catálogo (sin acentos ni mayúsculas) |
| | Jefe (número de nómina), Jefe (CURP) | ver "Jefe inmediato" |
| Financieros | Banco | uno de la hoja Catálogos |
| | CLABE | 18 dígitos |
| | CP fiscal | 5 dígitos |
| Control | Estatus | `activo`, `baja` o `suspendido` (por omisión `activo` al crear) |
| | Fecha de baja (fecha), Motivo de baja (500) | |

**Fechas.** `AAAA-MM-DD`, `DD/MM/AAAA` (día primero) o celdas con formato de fecha de Excel; año entre 1900 y 2100. Una fecha
inválida **omite la fila**. **Ceros a la izquierda:** NSS, CP, nómina, CLABE y teléfonos deben ser TEXTO en Excel (la
plantilla ya trae las columnas con formato Texto); si Excel los convirtió en número ya perdieron los ceros (el NSS y el CP se
reparan solos; la CLABE no).

## Qué rechaza una fila y qué solo avisa

* **Error de la fila (no entra):** falta Nombre o Apellido Paterno, fecha inválida, nombre con caracteres no permitidos (NUL),
  conflicto de CURP/nómina en modo actualizar.
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
  * Una fila sin CURP ni nómina se inserta como nueva (no hay forma de identificarla). Dos filas del mismo empleado en el mismo
    lote: la segunda se reporta como repetida.
  * Respuesta: insertados, actualizados (con solo el **número** de campos modificados por fila), sin cambios, duplicados,
    errores, advertencias, avisos de catálogo y jefes.
  * Cada lote de 100 filas va en **una transacción**: los errores de validación por fila no la abortan; un fallo inesperado
    de SQL deshace todo el lote (error 500 genérico y el resultado del lote queda "no confirmado" en la pantalla).

## Jefe inmediato

`Jefe (número de nómina)` y/o `Jefe (CURP)`. El jefe puede venir en el mismo archivo (incluso en un lote posterior) o ya
existir. Como el archivo se envía en lotes, la asignación es una **segunda pasada** al final (`POST /api/empleados/importar/jefes`,
hasta 500 pares por petición). Se avisa y **no se asigna** en estos casos: jefe no encontrado, nómina y CURP del jefe que apuntan a
personas distintas, auto-referencia (A es jefe de A) y ciclos (A→B→A o más largos, incluso contra jefes que ya estaban en la BD;
ningún miembro del ciclo recibe la asignación nueva). Una celda vacía nunca quita un jefe. Si hay más de 500 pares, la
detección de ciclos entre peticiones distintas protege igual (la segunda arista que cierra el ciclo se rechaza), pero las aristas de
la primera petición ya quedaron asignadas.

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
* La tabla de Departamentos muestra el **Turno actual** (solo lectura; el vigente hoy).
* Auditoría `IMPORTAR_DEPTOS` (la columna `accion` admite 20 caracteres; `IMPORTAR_DEPARTAMENTOS` no cabe) solo con conteos.
