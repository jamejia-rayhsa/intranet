# Simulador de marcas de asistencia

`scripts/asistencia/simulador-marcas.js` imita a la interfaz con BioTime para probar la ingesta (`POST /api/asistencia/ingesta/marcas` y `GET /api/asistencia/ingesta/estado`). No tiene dependencias (Node 18 o superior). Todos los datos son **ficticios**: los códigos de empleado son `1`…`30` (o los que se indiquen) y las terminales `SN-FICTICIO-00x`.

## Preparación

1. Crea una llave de pruebas (ver `operacion-ingesta.md`, sección 2) en el entorno que vas a probar: **nunca la llave de producción** para pruebas con datos ficticios, porque las marcas se guardan de verdad y no se pueden borrar.
2. Exporta la llave y la URL como variables de entorno (la llave nunca se pasa como argumento):

```bash
export INTRANET_API_KEY='rhk_...'          # la llave de pruebas
export INTRANET_URL='http://localhost:4000'  # por omisión
```

## Modos

```bash
# Carga histórica: 20 mil marcas en envíos de 500
node scripts/asistencia/simulador-marcas.js historico --total 20000

# Ciclo incremental (como la interfaz): GET /estado -> cursor -> envía lo nuevo, 3 ciclos
node scripts/asistencia/simulador-marcas.js incremental --ciclos 3 --por-ciclo 120

# Solo ver el cursor
node scripts/asistencia/simulador-marcas.js estado
```

Opciones útiles: `--lote N` (1..500), `--semilla N`, `--id-inicial N`, `--sin-anomalias`, `--empleados N`, `--desde AAAA-MM-DD`, `--pausa-ms N`, `--silencioso`; en `historico`, `--paralelo N` (N trabajadores envían los **mismos** lotes a la vez) y `--repetir N` (cada lote N veces seguidas); en `incremental`, `--intervalo-s N` (la interfaz real espera 900) y `--retroceso N` (por omisión 300 ids, como el contrato). `--ayuda` imprime todas.

## Qué genera

La misma semilla y los mismos ids producen las mismas marcas, así que repetir una corrida debe devolver todo como `duplicadas` (prueba de idempotencia). Los **ids** dependen solo de `--id-inicial` (por omisión 1000000) y de la posición; la semilla cambia el contenido de las marcas, no sus ids: para generar marcas nuevas en una base que ya recibió otras, usa otro `--id-inicial`. Los ids crecen **con huecos**, igual que `iclock_transaction`, y se mezclan:

| Caso | Esperado |
|---|---|
| marca normal (id como número o como texto, código con espacios al final) | insertada |
| `terminal_sn`, `terminal_alias` y `area_externa` vacíos (`""`) | insertada (la cadena vacía es válida) |
| `tipo_verificacion` 0 y `crudo.source` 2 | insertada |
| `subida_ts` y `estado_marca` ausentes | insertada |
| `codigo_empleado` inexistente (`INEXISTENTE-n`) | insertada, cuenta en `sin_empleado` |
| `marca_ts` sin zona horaria | rechazada |
| `marca_ts` 3 días en el futuro | rechazada |
| `codigo_empleado` en blanco | rechazada |
| `id_externo` no numérico | rechazada |
| `crudo` de más de 2 KB | rechazada |
| una marca repetida dentro del mismo envío (último envío) | `duplicadas` |

Con `--sin-anomalias` solo se envían marcas válidas.

## Comportamiento de cliente

Respeta el contrato: envíos secuenciales por orden ascendente de id, espera `Retry-After` en 429, reintenta 5xx y errores de red con espera creciente (5 s, 30 s, 2 min) sin avanzar, y no reintenta 4xx. Al terminar imprime el total de las respuestas, los tiempos por envío (p50, p95, máximo), los reintentos y el estado del cursor.

El límite de 60 envíos por minuto por llave aplica también al simulador: 20 mil marcas son 40 envíos, así que caben en un minuto; cargas mayores o varios trabajadores esperan solos por el 429.

## Ejemplo de comprobación de idempotencia y concurrencia

```bash
node scripts/asistencia/simulador-marcas.js historico --total 5000 --id-inicial 7000000 --silencioso
node scripts/asistencia/simulador-marcas.js historico --total 5000 --id-inicial 7000000 --silencioso   # todo duplicadas
node scripts/asistencia/simulador-marcas.js historico --total 5000 --id-inicial 8000000 --paralelo 5 --silencioso
```

En la tercera, `insertadas` debe ser igual al número de marcas válidas únicas y el resto `duplicadas`, sin errores 5xx.
