# Contrato de ingesta de marcas de asistencia (v1)

Para: equipo de la interfaz con BioTime. De: equipo de la intranet (módulo RH, asistencia).

**Estado:** implementado en la Fase 3 del módulo (endpoints, llaves, límites y simulador). La URL base del entorno y la llave se entregan al desplegar. El comportamiento coincide con este contrato; las precisiones de la implementación (casos de borde que el borrador no definía y las pocas diferencias) están en la sección 7. Si algo no les sirve, avisen: un cambio de comportamiento es un cambio de versión.

## 1. Conexión

| Dato | Valor |
|---|---|
| URL base | `https://<DOMINIO-DE-LA-INTRANET>` (se confirma al desplegar; dev, staging y producción tendrán cada uno su URL y su llave) |
| Enviar marcas | `POST /api/asistencia/ingesta/marcas` |
| Consultar estado y cursor | `GET /api/asistencia/ingesta/estado` |
| Formato | JSON UTF-8, cabecera `Content-Type: application/json` |
| Autenticación | cabecera **`X-Api-Key: <llave>`** (no `Authorization`, no `Bearer`) |

**La llave**
- La genera la intranet (32 bytes aleatorios) y se entrega por un gestor de contraseñas. **Nunca** por chat, correo ni repositorio. Va en el `.env` de la interfaz (por ejemplo `INTRANET_API_KEY`).
- La intranet la guarda solo con hash. Si se pierde, se genera otra; no se puede recuperar.
- Se puede rotar con un periodo de solape (las dos llaves valen un tiempo) y revocar al instante.
- Cada llave es de un solo origen (`biotime`) y solo sirve para estas dos rutas.

## 2. Enviar marcas: `POST /api/asistencia/ingesta/marcas`

### Cuerpo

```json
{
  "origen": "biotime",
  "marcas": [
    {
      "id_externo": "1000123",
      "codigo_empleado": "1234",
      "marca_ts": "2026-01-15T14:00:00Z",
      "subida_ts": "2026-01-15T14:00:02Z",
      "estado_marca": 0,
      "tipo_verificacion": 15,
      "terminal_sn": "SN-DE-EJEMPLO",
      "terminal_alias": "SEDE-A",
      "area_externa": "SEDE-A",
      "crudo": { "work_code": "0", "source": 1, "is_attendance": null }
    }
  ]
}
```

Es una lista de marcas, pero **no es la misma estructura que la tabla `asistencia_marcas`**: la interfaz solo manda los campos de arriba. `id`, `lote_id`, `empleado_id` y `fecha_importacion` los llena la intranet y se ignoran si vienen.

| Campo | Obligatorio | Regla |
|---|---|---|
| `origen` | no | texto corto; por defecto `biotime`. Debe coincidir con el origen de la llave |
| `id_externo` | sí | `id` de `iclock_transaction`. **Envíenlo como TEXTO de dígitos** (`"1000123"`): sin ceros a la izquierda y de hasta 18 dígitos. Un número JSON también se acepta, pero solo si es un entero seguro de JavaScript (hasta 9 007 199 254 740 991); más allá, un número pierde precisión al leerse, así que solo el texto es fiable. En el servidor se guarda como entero de 64 bits (BIGINT, que alcanza 19 dígitos; se piden 18 por holgura). Con `origen` forma la llave anti-duplicados |
| `codigo_empleado` | sí | `emp_code` tal cual; se le quitan espacios de los extremos; máximo 50 caracteres; no vacío |
| `marca_ts` | sí | `punch_time` en **ISO 8601 con zona** (`Z` o desplazamiento, por ejemplo `-06:00`). **Sin zona se rechaza.** Mándenlo en UTC como ya hacen. Se rechaza si está más de 24 h en el futuro |
| `subida_ts` | no | `upload_time` en ISO 8601 con zona |
| `estado_marca` | no | `punch_state`; número o texto numérico (`"0"` vale); entero pequeño. No lo interpretamos: la entrada y la salida se deducen con el turno |
| `tipo_verificacion` | no | `verify_type`; entero |
| `terminal_sn`, `terminal_alias`, `area_externa` | no | `terminal_sn`, `terminal_alias`, `area_alias` |
| `crudo` | no | objeto con lo demás que quieran conservar (`work_code`, `source`, `is_attendance`…); máximo 2 KB por marca |

No conviertan la hora a la zona de México ni la normalicen: el instante en UTC es lo correcto. No filtren marcas "raras" ni las de empleados que no conozcan; mándenlas todas.

### Límites

- **Máximo 500 marcas y 1 MB por envío; vale el límite que se alcance primero.** Con `crudo` de 2 KB en cada marca, 500 marcas pesan cerca de 1,07 MB y el envío se rechaza con `413` aunque no pase de 500: en ese caso envíen menos marcas por envío. Un lote real con `crudo` pequeño (unos 500 bytes) pesa alrededor de 300 KB, muy por debajo del tope. Una carga histórica de unas 134 mil marcas son unos 268 envíos y, por el tope de 60 envíos por minuto, tarda alrededor de 4 o 5 minutos.
- Un envío a la vez (secuencial), por orden ascendente de `id`.
- Hasta 60 envíos por minuto por llave; más devuelve `429` con `Retry-After`. Las consultas de `GET /estado` tienen su propio contador, también de 60 por minuto.
- Un cuerpo de más de 1 MB devuelve `413`; una lista de más de 500 marcas, `400`.

### Respuesta (200)

```json
{
  "exito": true,
  "datos": {
    "lote_id": 812,
    "recibidas": 500,
    "insertadas": 497,
    "duplicadas": 2,
    "rechazadas": 1,
    "sin_empleado": 12,
    "ultimo_id_externo": "1000622",
    "rechazos": [
      { "indice": 41, "id_externo": "1000150", "motivo": "marca_ts sin zona horaria" }
    ]
  }
}
```

- `insertadas`: marcas nuevas guardadas (incluye las `sin_empleado`).
- `duplicadas`: ya existían con el mismo `(origen, id_externo)`, o venían repetidas dentro del mismo envío. **No es un error.**
- `rechazadas`: no pasaron la validación; la lista `rechazos` trae el detalle (máximo 50 elementos). **Las demás sí se guardaron**: el envío no es todo o nada. Corrijan y reenvíen solo las rechazadas.
- `sin_empleado`: marcas guardadas cuyo `codigo_empleado` no coincide con ningún empleado de la intranet. No es un error: se guardan y se vinculan solas cuando el empleado exista.
- `ultimo_id_externo`: el mayor `id_externo` numérico que la intranet tiene guardado para el origen.
- Reenviar el mismo envío es seguro: devuelve todo como `duplicadas`.

### Errores

| Código | Cuándo | Qué hacer |
|---|---|---|
| 400 | JSON inválido, `marcas` ausente o vacía, más de 500 marcas, origen distinto al de la llave | corregir; no reintentar igual |
| 401 | falta `X-Api-Key` o es incorrecta | revisar la llave |
| 403 | llave revocada o IP no permitida | avisar a la intranet |
| 413 | cuerpo mayor de 1 MB | enviar menos marcas |
| 429 | demasiadas peticiones | esperar `Retry-After` y reintentar |
| 500 / 502 / 503 | falla de la intranet | reintentar con espera creciente (por ejemplo 5 s, 30 s, 2 min); el reintento es seguro |

Los errores devuelven `{ "exito": false, "mensaje": "..." }` sin detalles internos.

## 3. Consultar el cursor: `GET /api/asistencia/ingesta/estado`

```json
{
  "exito": true,
  "datos": {
    "origen": "biotime",
    "ultimo_id_externo": "1000622",
    "ultima_marca_ts": "2026-01-15T20:00:00Z",
    "ultima_subida_ts": "2026-01-15T20:00:02Z",
    "ultimo_exito": "2026-01-15T20:15:00Z",
    "ultimo_error": null,
    "total_marcas": 100000
  }
}
```

Con esto la interfaz puede retomar sin guardar nada propio: pide a BioTime las transacciones con `id` mayor a `ultimo_id_externo`. (Si no hay marcas todavía, `ultimo_id_externo` es `null`: carga completa.)

## 4. Quién registra qué

- **La intranet** crea el registro de cada envío (`asistencia_sync_lotes`: recibidas, insertadas, duplicadas, rechazadas, `sin_empleado`, `estatus` (`en_curso`, `ok` o `error`) y `error`) y actualiza el cursor (`asistencia_sync_estado`). **La interfaz no tiene que mandar ni escribir nada de eso**; solo hace el `POST`.
- **`empleado_id` lo llena la intranet**, no la interfaz: al recibir la marca busca un empleado cuyo `numero_nomina` sea igual a `codigo_empleado`. Si hay una sola coincidencia **cuyo periodo de empleo contiene la fecha de la marca** (fecha de ingreso <= fecha de la marca en America/Mexico_City <= fecha de baja; fecha vacía = abierto) lo vincula, de modo que un número de nómina reutilizado no atribuye marcas viejas al empleado nuevo; si no hay (ex empleados, códigos desconocidos) o hay varias, queda vacío y se cuenta en `sin_empleado`. Los vacíos se reintentan periódicamente (la función de re-vinculación ya existe; el proceso periódico llega con el motor de análisis, Fase 4: mientras tanto RH puede ejecutarla a mano).
- Las marcas **nunca se editan ni se borran** y se conservan siempre.

## 5. Cómo debería comportarse la interfaz

1. **Arranque y cada ciclo (15 min):** `GET /estado` → leer `ultimo_id_externo` (o ninguno).
2. Leer de BioTime las transacciones con `id > ultimo_id_externo`, en orden ascendente (las marcas que suben tarde de una terminal sin red reciben un `id` nuevo, así que este cursor las alcanza). Como margen de seguridad pueden retroceder unos cientos de `id`: los duplicados no hacen daño.
3. Partir en envíos de máximo 500 y mandarlos en orden, uno a la vez.
4. Si un envío falla por red, `429` o `5xx`: esperar y reintentar el mismo envío. No avanzar al siguiente.
5. Si hay `rechazadas`: registrar el motivo en su propio log y seguir; no bloquear el cursor por eso.
6. Primera ejecución: sin cursor, carga todo el historial por el mismo camino (la intranet lo recibe igual).
7. No consulten ni escriban en la base de datos de la intranet: todo pasa por estas dos rutas.

## 6. Pendientes de confirmar

- URL base de cada entorno y desde qué IP llamará la interfaz (para la lista de IP permitidas).
- Si 500 marcas por envío les alcanza (si no, lo vemos con datos reales).
- Versión comercial de BioTime (informativo).

## 7. Precisiones de la implementación (v1, Fase 3)

Casos de borde que el borrador no definía y cómo se resolvieron. Las marcadas con **(diferencia)** acotan algo que el texto del borrador dejaba más abierto: la interfaz que sigue el contrato al pie de la letra no las nota, pero conviene conocerlas.

- **`id_externo` (diferencia):** para el origen `biotime` debe ser un entero de hasta 18 dígitos; se recomienda mandarlo como **texto de dígitos** (un número JSON solo es fiable hasta 9 007 199 254 740 991, el mayor entero seguro de JavaScript; el servidor lo guarda como BIGINT). Se guarda su forma canónica sin ceros a la izquierda (`"00123"` y `123` son la misma transacción). Un `id_externo` no numérico se rechaza (el borrador decía "texto o número, máximo 64 caracteres"; el máximo de 64 sigue valiendo como tope previo).
- **`codigo_empleado`:** debe ser **texto** (un número JSON se rechaza: perdería los ceros a la izquierda). Se recorta de espacios y se compara con `empleados.numero_nomina` como **texto exacto**; `007` no coincide con `7` (no se normalizan ceros; se decidirá con datos reales de nómina). Si dos empleados tienen el mismo número de nómina no se vincula a ninguno.
- **`marca_ts` / `subida_ts`:** ISO 8601 con `T` como separador y zona obligatoria (`Z`, `±HH:MM`, `±HHMM` o `±HH`); fracciones de segundo opcionales (se guardan hasta milisegundos); los segundos son opcionales. Se rechazan fechas que no existen (30 de febrero) y años anteriores a 1970 **(diferencia)**. `marca_ts` más de 24 h en el futuro se rechaza; `subida_ts` no tiene tope. Una cadena vacía en `subida_ts` es un error (la cadena vacía solo es válida en `terminal_sn`, `terminal_alias` y `area_externa`).
- **`estado_marca` y `tipo_verificacion`:** número entero o texto numérico (`"0"` vale); `estado_marca` entre -32768 y 32767. Se guardan como texto. `tipo_verificacion` 0 es válido.
- **Caracteres no permitidos (diferencia):** cualquier texto (o clave de `crudo`) con el carácter NUL (`\u0000`) o con un sustituto Unicode suelto se rechaza, porque la base de datos no puede almacenarlo.
- **`crudo`:** objeto (no lista) de hasta 2 048 **bytes** UTF-8 una vez serializado y hasta 20 niveles de profundidad.
- **Duplicados dentro del mismo envío:** gana la primera aparición; las demás cuentan como `duplicadas` aunque traigan datos distintos. Una marca válida con el mismo id que otra rechazada se guarda.
- **Orden:** el servidor guarda cada envío en orden ascendente de `id_externo` (evita bloqueos entre envíos simultáneos que se traslapan); no hace falta que los manden ordenados dentro del envío, aunque sí por envío.
- **`sin_empleado`** cuenta solo las marcas **guardadas** en ese envío; una duplicada que ya estaba sin empleado no se cuenta otra vez. `insertadas + duplicadas + rechazadas = recibidas`.
- **`ultimo_id_externo`:** el mayor id guardado del origen (el cursor se actualiza con el mayor id del envío aunque sus marcas ya existieran), como texto; `null` si no hay marcas. `lote_id` es un número. Las fechas de `GET /estado` salen en ISO UTC con `Z` y sin milésimas cuando son cero (`2026-01-15T20:00:00Z`). `ultimo_exito` es la hora del último envío procesado sin error; `ultimo_error` es un texto genérico del último envío que falló y se limpia con el siguiente éxito.
- **Si un envío falla (500):** se revierte **completo** (no queda a medias) y el reintento es seguro. Un envío en el que todas las marcas se rechazan responde 200 con `insertadas: 0`.
- **`origen`:** debe coincidir con el de la llave (`biotime`); si falta o es `null` se usa el de la llave. Mayúsculas distintas (`BioTime`) o cualquier otro valor dan 400.
- **Errores (diferencia):** además de los códigos del borrador, 403 también se devuelve para una llave **vencida o aún no vigente** (durante la rotación las dos llaves valen a la vez), y 415 cuando el `Content-Type` declara un charset distinto de UTF-8 (`utf-16`, `latin1`...); mejor no declarar charset o declarar `utf-8`. Una IP con más de 30 fallos de autenticación en un minuto recibe `429` con `Retry-After` antes de que se consulte la llave. Los mensajes 401 y 403 son siempre los mismos (`Llave de acceso no válida` y `Acceso denegado`) sin indicar el motivo. El límite de tasa se aplica después de validar la llave: 429 solo lo reciben llaves válidas.
- **IP permitidas:** cada llave puede restringirse a una lista de IP/CIDR (ver `operacion-ingesta.md`); la IP que cuenta es la que ve la intranet, y depende de cómo esté configurado el proxy.

