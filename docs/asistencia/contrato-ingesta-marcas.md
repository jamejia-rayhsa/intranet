# Contrato de ingesta de marcas de asistencia (v1, borrador)

Para: equipo de la interfaz con BioTime. De: equipo de la intranet (módulo RH, asistencia).

**Estado:** borrador acordado en diseño. El endpoint se implementa en la Fase 3 del módulo; hasta entonces las rutas de abajo **todavía no existen**. Cuando estén desplegadas se entregan la URL base del entorno y la llave. Si algo de este contrato no les sirve, avisen antes de la implementación: después es un cambio de versión.

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
      "id_externo": "1566931",
      "codigo_empleado": "1234",
      "marca_ts": "2026-10-21T14:10:22Z",
      "subida_ts": "2026-10-21T14:10:24.134Z",
      "estado_marca": 0,
      "tipo_verificacion": 15,
      "terminal_sn": "SN-DE-EJEMPLO",
      "terminal_alias": "CORPORATIVO",
      "area_externa": "CORPORATIVO",
      "crudo": { "work_code": "0", "source": 1, "is_attendance": null }
    }
  ]
}
```

Es una lista de marcas, pero **no es la misma estructura que la tabla `asistencia_marcas`**: la interfaz solo manda los campos de arriba. `id`, `lote_id`, `empleado_id` y `fecha_importacion` los llena la intranet y se ignoran si vienen.

| Campo | Obligatorio | Regla |
|---|---|---|
| `origen` | no | texto corto; por defecto `biotime`. Debe coincidir con el origen de la llave |
| `id_externo` | sí | `id` de `iclock_transaction`, como texto o número; máximo 64 caracteres. Con `origen` forma la llave anti-duplicados |
| `codigo_empleado` | sí | `emp_code` tal cual; se le quitan espacios de los extremos; máximo 50 caracteres; no vacío |
| `marca_ts` | sí | `punch_time` en **ISO 8601 con zona** (`Z` o desplazamiento, por ejemplo `-06:00`). **Sin zona se rechaza.** Mándenlo en UTC como ya hacen. Se rechaza si está más de 24 h en el futuro |
| `subida_ts` | no | `upload_time` en ISO 8601 con zona |
| `estado_marca` | no | `punch_state`; número o texto numérico (`"0"` vale); entero pequeño. No lo interpretamos: la entrada y la salida se deducen con el turno |
| `tipo_verificacion` | no | `verify_type`; entero |
| `terminal_sn`, `terminal_alias`, `area_externa` | no | `terminal_sn`, `terminal_alias`, `area_alias` |
| `crudo` | no | objeto con lo demás que quieran conservar (`work_code`, `source`, `is_attendance`…); máximo 2 KB por marca |

No conviertan la hora a la zona de México ni la normalicen: el instante en UTC es lo correcto. No filtren marcas "raras" ni las de empleados que no conozcan; mándenlas todas.

### Límites

- **Máximo 500 marcas y 1 MB por envío** (decidido por la intranet; propusieron 1,000). Con 500 por envío, la carga de unas 134 mil marcas históricas son unos 270 envíos.
- Un envío a la vez (secuencial), por orden ascendente de `id`.
- Hasta 60 envíos por minuto por llave; más devuelve `429` con `Retry-After`.
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
    "ultimo_id_externo": "1567430",
    "rechazos": [
      { "indice": 41, "id_externo": "1567001", "motivo": "marca_ts sin zona horaria" }
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
    "ultimo_id_externo": "1567430",
    "ultima_marca_ts": "2026-10-21T20:03:11Z",
    "ultima_subida_ts": "2026-10-21T20:03:13Z",
    "ultimo_exito": "2026-10-21T20:15:02Z",
    "ultimo_error": null,
    "total_marcas": 134264
  }
}
```

Con esto la interfaz puede retomar sin guardar nada propio: pide a BioTime las transacciones con `id` mayor a `ultimo_id_externo`. (Si no hay marcas todavía, `ultimo_id_externo` es `null`: carga completa.)

## 4. Quién registra qué

- **La intranet** crea el registro de cada envío (`asistencia_sync_lotes`: recibidas, insertadas, duplicadas, rechazadas, estado, error) y actualiza el cursor (`asistencia_sync_estado`). **La interfaz no tiene que mandar ni escribir nada de eso**; solo hace el `POST`.
- **`empleado_id` lo llena la intranet**, no la interfaz: al recibir la marca busca un empleado cuyo `numero_nomina` sea igual a `codigo_empleado`. Si hay una sola coincidencia lo vincula; si no hay (ex empleados, códigos desconocidos) o hay varias, queda vacío y se cuenta en `sin_empleado`. Los vacíos se reintentan periódicamente.
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
