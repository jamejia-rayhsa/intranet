# Operación de la ingesta de marcas de asistencia

Para quien administra la intranet (RH-admin / TI). El contrato con la interfaz de BioTime está en `contrato-ingesta-marcas.md`; el simulador para pruebas, en `simulador-marcas.md`.

## 1. Cómo funciona (resumen)

- En staging y producción la interfaz llama por la **puerta dedicada** de la red interna (`http://<ip-interna>:4010`, sección 5); en ella y en el puerto principal (cuando está permitido) son las mismas dos rutas. La interfaz con BioTime llama a dos rutas con la cabecera `X-Api-Key`: `POST /api/asistencia/ingesta/marcas` y `GET /api/asistencia/ingesta/estado`. No usa `Authorization` ni inicia sesión: la llave solo sirve para esas dos rutas y para un origen (`biotime`).
- La llave son 32 bytes aleatorios con la forma `rhk_<8 hex>_<43 caracteres>`. La intranet **solo guarda su SHA-256** y el prefijo visible (`rhk_` + 8 hex). Con 256 bits de entropía un hash rápido es suficiente (no hay diccionario que probar; un hash lento solo encarecería cada petición) y la comparación se hace en tiempo constante.
- Se administran en la API de la intranet (con sesión de RH-admin o super_admin). No hay pantalla todavía (Fase 5): se usa la API, por ejemplo con `curl` y un token de sesión.
- Permiso: opción **Ingesta** del módulo RH (`consulta` para ver, `edicion` para crear, rotar, revocar, editar IP y re-vincular). La reciben solo `rh_admin` y `super_admin`; `portal_admin` no.

## 2. Crear una llave

```bash
curl -s -X POST "$URL/api/asistencia/llaves" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"nombre":"Interfaz BioTime planta","ips_permitidas":["192.0.2.10"]}'
```

- La respuesta (201) trae el campo `llave` **una sola vez** (con `Cache-Control: no-store`). Cópiala de inmediato a un gestor de contraseñas y entrégala a la interfaz por ese medio; nunca por chat, correo ni repositorio.
- No se puede volver a ver: si se pierde, se crea otra (o se rota). Tampoco se registra en logs ni en la auditoría.
- **Recomendación para producción: siempre con `ips_permitidas`.** Una llave creada sin IP sirve desde cualquier IP y la respuesta lo avisa en `aviso_ips`. Procedimiento: crearla sin IP en una prueba, comprobar `ultima_ip` en el listado (sección 6) y luego `PUT .../ips`.
- Campos: `nombre` (obligatorio, 1-100), `ips_permitidas` (lista; vacía = sin restricción de IP), `vigente_hasta` (opcional, ISO 8601 con zona y futuro; sin él no vence). `origen` solo admite `biotime`.

## 3. Listar, rotar, revocar, editar IP

| Acción | Petición | Notas |
|---|---|---|
| Listar | `GET /api/asistencia/llaves` | prefijo, nombre, estado (`estado_efectivo`: activa, vencida, revocada, pendiente), vigencia, `ultimo_uso`, `ultima_ip`, IP permitidas. Nunca la llave ni su hash |
| Rotar | `POST /api/asistencia/llaves/:id/rotar` con `{"solape_horas":24}` | crea la llave nueva (mismos datos; opcionalmente `nombre` e `ips_permitidas` nuevos) y **fija la vigencia de la anterior** a ahora + solape. Por omisión 24 h, máximo 720; `0` = la anterior termina ya. Durante el solape valen las dos. La respuesta trae la llave nueva una sola vez y el `vigente_hasta` de la anterior. Solo se rota una llave activa y vigente **sin vencimiento**: una llave ya rotada (está en su solape) o con `vigente_hasta` responde 409 (rota su sucesora o revócala), y dos rotaciones simultáneas se serializan (una 201 y otra 409) |
| Revocar | `POST /api/asistencia/llaves/:id/revocar` | efecto **inmediato** (el middleware lee la fila en cada petición; no hay caché). 409 si ya estaba revocada |
| Editar IP | `PUT /api/asistencia/llaves/:id/ips` con `{"ips_permitidas":[...]}` | efecto inmediato; `[]` quita la restricción. No aplica a una llave revocada |

**Rotación sin cortes (procedimiento):** 1) rotar con un solape suficiente (por ejemplo 24 h); 2) entregar la llave nueva a la interfaz; 3) la interfaz cambia su `INTRANET_API_KEY` y reinicia; 4) comprobar en el listado que la llave nueva tiene `ultimo_uso` reciente; 5) revocar la anterior sin esperar al vencimiento si se sospecha de ella.

**Formato de las IP permitidas:** IPv4 (`192.0.2.10`), IPv6 (`2001:db8::1`) o CIDR (`192.0.2.0/24`, `2001:db8::/32`); máximo 20 entradas; el prefijo `/0` no se admite (para "cualquiera" usa la lista vacía). Una IPv4 mapeada (`::ffff:a.b.c.d`) se trata como la IPv4.

Toda acción (crear, rotar, revocar, editar IP) queda en la bitácora de auditoría (`modulo = rh`, `tabla = asistencia_llaves`, acciones `CREAR_LLAVE`, `ROTAR_LLAVE`, `REVOCAR_LLAVE`, `EDITAR_IPS_LLAVE`) con el usuario y la IP, **sin la llave ni el hash**.

## 4. Respuestas de la ingesta y qué significan

| Código | Causa | Qué ve la interfaz |
|---|---|---|
| 401 | falta `X-Api-Key`, formato incorrecto, prefijo desconocido o hash que no coincide | `Llave de acceso no válida` (idéntico en todos los casos) |
| 403 | llave revocada, fuera de vigencia (vencida o aún no vigente) o IP no permitida | `Acceso denegado` (idéntico en todos los casos) |
| 429 | más de 60 envíos por minuto con la misma llave (también 60 consultas de `/estado`), **o** más de 30 fallos de autenticación por minuto desde la misma IP | cabecera `Retry-After` |
| 415 | `Content-Type` con charset distinto de UTF-8 | |
| 413 | cuerpo mayor de 1 MB | |
| 400 | JSON inválido, `marcas` ausente/vacía, más de 500, origen distinto al de la llave | |
| 500 | falla interna | `Error interno ...` genérico, nunca texto de SQL |

Los mensajes no dicen cuál fue el motivo: la llave 403 solo se evalúa si la llave es auténtica (quien no la tiene no puede saber si existió, si está revocada ni qué IP se espera). El motivo real queda en la tabla `asistencia_llaves_rechazos` (sección 8).

## 5. Puerta de ingesta dedicada por la red interna (staging y producción)

**Por qué:** staging solo es alcanzable por Cloudflare Tunnel -> Traefik -> nginx del frontend -> backend. Una interfaz que llamara por el dominio público saldría a Internet y volvería por el túnel, y su IP interna nunca llegaría al backend (la lista de IP permitidas no serviría). Por eso la ingesta tiene su **propia puerta**: un segundo servidor del mismo backend, en otro puerto, publicado solo en la IP interna del servidor.

```
                    RUTA PÚBLICA (portal, usuarios)                      RUTA INTERNA (interfaz BioTime)
  Internet --> Cloudflare --> cloudflared --> Traefik --> nginx --> backend:4000      PC de la interfaz (IP fija)
                                                                       |                    |  http://<ip-interna>:4010
                  /api/asistencia/ingesta/*  --> 404 (cerrada) <-------+                    v
                                                          host <ip-interna>:4010  --(Docker publica INGESTA_BIND:4010)--> backend:4010
                                                          [DOCKER-USER: solo <ip-interfaz>]    solo POST /marcas y GET /estado,
                                                                                                trust proxy desactivado: req.ip = IP del socket
```

- **Puerto 4010 (`INGESTA_PORT`):** sirve SOLO `POST /api/asistencia/ingesta/marcas` y `GET /api/asistencia/ingesta/estado`; cualquier otra ruta es 404. Usa el mismo middleware de llave, el mismo parser de 1 MB, los mismos contadores de tasa (60 envíos/min por llave) y de fallos por IP, el mismo pool y la misma lógica que cualquier otro camino (es el mismo proceso).
- **Sin proxy y sin `TRUST_PROXY`:** esa puerta ignora `TRUST_PROXY` y `X-Forwarded-For`/`CF-Connecting-IP`: `req.ip` es la dirección del socket TCP, o sea la IP real de la interfaz, y la lista de IP permitidas de la llave funciona con ella. Por eso `TRUST_PROXY` se deja **vacío** (sección 6): no hay ningún proxy entre la interfaz y el backend en esta ruta, y ninguna cabecera falsificable decide la IP.
- **Puerto público cerrado (`INGESTA_SOLO_PUERTO_DEDICADO`):** con `INGESTA_PORT` definido, por defecto `true` (seguro por defecto): en el puerto 4000 (y por tanto por el túnel) `/api/asistencia/ingesta/*` responde 404 con la forma de cualquier ruta inexistente, sin pasar por la llave. Nada de la ingesta se alcanza desde Internet. En dev el compose lo pone en `false` (la ingesta sigue en ambos puertos) para probar con el simulador en `localhost:4000`.
- **Fallo rápido:** si `INGESTA_PORT` es inválido, igual al principal o no se puede abrir (puerto ocupado...), el backend registra el motivo y termina con código 1; no arranca a medias. `SIGTERM`/`SIGINT` cierran ordenadamente los dos servidores.

### Configurar la publicación (`INGESTA_BIND`)

Los compose de dev, staging y prod publican `${INGESTA_BIND:-127.0.0.1}:${INGESTA_PORT:-4010}:${INGESTA_PORT:-4010}`. Por omisión solo escucha en loopback del servidor. En el servidor se fija en el `.env.<entorno>` (no versionado; no escribas la IP en el repositorio):

```
INGESTA_BIND=<ip-interna>      # la IP interna del servidor, la misma con la que se entra por SSH
INGESTA_PORT=4010
# INGESTA_SOLO_PUERTO_DEDICADO=true   (ya es el valor por omisión en staging/prod)
# TRUST_PROXY=                        (vacío)
```

Luego `docker compose ... up -d backend`. La URL base de la ingesta pasa a ser `http://<ip-interna>:4010` (las rutas son las mismas del contrato).

### Comprobar desde el PC de la interfaz (PowerShell)

```powershell
# 1) ¿llega el puerto?
Test-NetConnection -ComputerName <ip-interna> -Port 4010

# 2) petición real con la llave (no la pegues en historiales compartidos; léela de una variable segura)
$llave = Read-Host "Llave" -MaskInput
Invoke-RestMethod -Uri "http://<ip-interna>:4010/api/asistencia/ingesta/estado" -Headers @{ "X-Api-Key" = $llave }
```

Resultados: `TcpTestSucceeded : True` y un JSON con `ultimo_id_externo` = todo bien. 401 = llave incorrecta; 403 = llave revocada/vencida o **IP no permitida** (compara `ultima_ip` en `GET /api/asistencia/llaves` con la IP de la interfaz); 429 = demasiados intentos fallidos (espera `Retry-After`); sin respuesta = firewall o `INGESTA_BIND` incorrecto. Misma prueba contra el puerto público debe dar 404: `Invoke-RestMethod https://<dominio>/api/asistencia/ingesta/estado`.

### Regla de firewall del host (la aplica el administrador del servidor)

Docker publica los puertos saltándose `INPUT`/`ufw`: **`ufw` por sí solo no filtra los puertos publicados por Docker**. La defensa en profundidad correcta va en la cadena `DOCKER-USER`, que Docker consulta antes de sus propias reglas (en el ejemplo, `<ip-interfaz>` es la IP fija del PC de la interfaz):

```bash
# Permitir solo a la interfaz hacia el puerto de ingesta (el puerto es el del contenedor, antes del DNAT: --dport 4010)
sudo iptables -I DOCKER-USER -p tcp --dport 4010 -s <ip-interfaz> -j ACCEPT
sudo iptables -I DOCKER-USER 2 -p tcp --dport 4010 -j DROP
sudo iptables -L DOCKER-USER -n --line-numbers      # verificar el orden: ACCEPT primero, DROP después
```

- Las reglas `iptables` no sobreviven a un reinicio: persístelas (por ejemplo con `iptables-persistent`/`netfilter-persistent save`, o una unidad systemd que las reaplique **después** de que arranque Docker, porque Docker recrea la cadena).
- Si la regla es incorrecta puede cortar la ingesta (o, con `-j DROP` mal puesto, otros servicios): pruébala primero con `Test-NetConnection` desde la interfaz y desde otro equipo (este debe fallar).
- Esta regla es opcional pero recomendada; la aplica el administrador del servidor, no el despliegue de la aplicación. La lista de IP permitidas de la llave sigue siendo la segunda barrera.

**Riesgo aceptado:** la red interna usa **HTTP sin TLS**: la llave y las marcas viajan sin cifrar dentro de la LAN (la llave se puede revocar y rotar al instante, y la IP permitida limita su uso). Si algún día se necesita cifrado, se pone un proxy TLS interno delante de ese puerto (y entonces habría que declarar `TRUST_PROXY`, que esta puerta no admite a propósito).

## 6. IP del cliente y `TRUST_PROXY` (puerto principal)

> Esta sección aplica a la ruta que pasa por proxies (puerto 4000 / dev). Para la ingesta de staging y producción usa la puerta dedicada de la sección 5: allí `TRUST_PROXY` no interviene.

La lista de IP permitidas compara contra `req.ip`. Qué IP es esa depende de la variable de entorno **`TRUST_PROXY`** del backend:

- **Vacía (por omisión):** no se confía en ningún proxy; `req.ip` es la dirección del socket y la cabecera `X-Forwarded-For` **se ignora**. Si el backend está detrás de nginx/Traefik, esa IP será la del proxy (todas las llaves "verían" la misma IP). Es seguro, pero inútil para una lista de IP.
- **Número de proxies (`TRUST_PROXY=1`, `2`…):** Express toma la IP en esa posición contando desde la derecha de `X-Forwarded-For`. Solo es seguro si el backend **no es alcanzable sin pasar por esos proxies** (en dev el puerto 4000 está publicado: allí un cliente podría escribir la cabecera). Staging pasa por Traefik y por nginx del frontend: `2`; si el cliente llega directo al nginx, `1`.
- **Lista de IP/CIDR de los proxies (recomendada):** `TRUST_PROXY=203.0.113.0/24` (el ejemplo usa un rango de documentación: pon la subred real de la red Docker donde está nginx, que se ve con `docker network inspect`). Solo se confía en la cabecera que añadió un proxy de esa lista: lo que escriba el cliente a la izquierda no cuenta.
- **No se admiten** `true`, `all`, `*`, `loopback`, `uniquelocal` ni `linklocal`: confiar en toda la red privada incluye a la propia interfaz de BioTime (que llama desde una IP interna) y permitiría que falseara su IP con `X-Forwarded-For`. Un valor inválido se ignora con un aviso en el log y no se confía en nadie.

La variable llega al backend desde los compose de dev, staging y prod (`TRUST_PROXY: ${TRUST_PROXY:-}`): se define en el `.env` del entorno. Reiniciar el backend tras cambiarla.

**nginx:** `config/nginx/nginx.conf` y `nginx.staging.conf` ya envían `X-Forwarded-For $proxy_add_x_forwarded_for` (añade la IP del cliente al final). Con `TRUST_PROXY` apuntando al proxy, eso es suficiente. Para endurecer más, en el `location /api/asistencia/ingesta/` puede usarse `proxy_set_header X-Forwarded-For $remote_addr;` (sobrescribe en lugar de añadir). El límite de cuerpo de nginx (`client_max_body_size 50m`) es mayor que el de la aplicación (1 MB), que es el que manda.

**Cómo comprobar qué IP ve el backend:** tras una llamada de la interfaz, el listado de llaves muestra `ultima_ip`. Si muestra la del proxy en lugar de la de la interfaz, `TRUST_PROXY` no está bien configurada. Ajusta primero con la lista de IP **vacía**, verifica `ultima_ip` y solo entonces rellena las IP permitidas (si no, la interfaz recibiría 403).

## 7. Límites

- 500 marcas y 1 MB por envío (vale el que se alcance primero: 500 marcas con `crudo` de 2 KB pesan unos 1,07 MB y dan 413; un lote real pesa unos 300 KB); el parser global de la app (100 kb) no aplica a la ingesta: ella monta su propio parser **antes** de `express.json()` en `app.js`.
- 60 envíos por minuto por llave (ventana deslizante en memoria, por proceso: exacto con una sola réplica del backend, como hoy; con varias réplicas cada una contaría por separado). Las consultas de `/estado` tienen su propio contador de 60/min.
- **Fallos por IP:** más de 30 peticiones rechazadas (sin cabecera, llave mala, revocada o IP no permitida) por minuto desde la misma IP reciben 429 **antes de consultar la base de datos**, para que una ráfaga de llaves inválidas no sature el pool compartido con el resto de la intranet. Se configura con `INGESTA_LIMITE_FALLOS_IP_POR_MINUTO` (por omisión 30; un valor inválido usa el defecto) y se aplica a todas las peticiones de esa IP mientras dure el bloqueo (hasta un minuto), también a las que traigan una llave válida: si la interfaz falla repetidamente (por ejemplo con una llave ya revocada) quedará bloqueada un minuto tras corregir. Como la IP depende de `TRUST_PROXY` (sección 6), mal configurado todas las peticiones compartirían IP.
- `ultimo_uso` se actualiza como mucho cada 30 s por llave y sin bloquear la petición.

## 8. Ver lotes, estado y rechazos

Sin acceso a la base de datos:

- `GET /api/asistencia/lotes?limite=50` (permiso Ingesta:consulta): últimos lotes con estatus, conteos, IP, prefijo de la llave y error genérico.

Con acceso a la base (psql):

```sql
-- Últimos envíos
SELECT l.id, l.estatus, l.recibidas, l.insertadas, l.duplicadas, l.rechazadas, l.sin_empleado,
       l.error, l.ip, k.prefijo, l.fecha_recepcion
FROM asistencia_sync_lotes l LEFT JOIN asistencia_llaves k ON k.id = l.llave_id
ORDER BY l.id DESC LIMIT 20;

-- Cursor y último error del origen
SELECT * FROM asistencia_sync_estado WHERE origen = 'biotime';

-- Accesos rechazados (una fila por hora, IP y motivo; "intentos" cuenta los repetidos)
SELECT hora, ip, motivo, prefijo, intentos, ultima
FROM asistencia_llaves_rechazos ORDER BY ultima DESC LIMIT 50;
```

- `asistencia_sync_lotes.estatus`: `ok` (procesado), `error` (falló y se revirtió: la interfaz recibió 500 y reintenta; `error` lleva un texto genérico) y `en_curso` (solo existe dentro de la transacción: no debería verse).
- `asistencia_llaves_rechazos` está acotada: una fila por (hora, IP, motivo) con contador, como máximo 200 claves nuevas por hora y poda de filas de más de 30 días. El backend nunca guarda la llave recibida (solo su prefijo si tenía el formato).
- Los motivos son: `sin_llave`, `llave_malformada`, `llave_desconocida`, `llave_incorrecta`, `llave_revocada`, `llave_fuera_de_vigencia`, `ip_no_permitida`. Muchos `ip_no_permitida` de una llave válida suelen ser un `TRUST_PROXY` mal puesto o una IP que cambió.

## 9. Si la interfaz se queda atrás o falla

- **No hay nada que arreglar en la intranet para "ponerse al día":** la interfaz consulta `GET /estado`, lee `ultimo_id_externo` y envía lo posterior (retrocediendo unos cientos de ids). Reenviar es seguro: lo repetido se cuenta como `duplicadas`.
- **429 repetidos:** la interfaz envía más de 60 por minuto; debe respetar `Retry-After`. Una carga histórica de unas 134 mil marcas son unos 268 envíos: unos 4 o 5 minutos al ritmo permitido.
- **403 de golpe:** revisar si se revocó o venció la llave (listado) o si cambió la IP de la interfaz (`ultima_ip` y `asistencia_llaves_rechazos`); editar las IP permitidas o rotar.
- **Los lotes salen en `error`:** es una falla de la intranet (BD, red). Los envíos se revirtieron completos, así que no hay datos a medias; el log del backend tiene el detalle (`[Ingesta] Error al procesar el envío`) y la interfaz reintenta sola.
- **El cursor no avanza pero hay lotes `ok`:** todo lo enviado ya estaba guardado (duplicadas) o fue rechazado; revisar `rechazadas` y los motivos en la respuesta que ve la interfaz.
- **Marcas sin empleado (`sin_empleado`):** se guardan igual (`empleado_id` vacío). La vinculación compara `codigo_empleado` (recortado de espacios) con `empleados.numero_nomina` **como texto exacto, solo si hay UNA coincidencia cuyo periodo de empleo contiene la fecha de la marca** (`fecha_ingreso <= fecha de la marca en America/Mexico_City <= fecha_baja`; una fecha vacía es abierta). Así un `numero_nomina` reutilizado por otra persona no atribuye marcas viejas al empleado nuevo; si los periodos de dos empleados con el mismo número se traslapan en esa fecha, no se vincula a ninguno. La re-vinculación usa exactamente la misma regla. `007` no coincide con `7`: los ceros a la izquierda no se normalizan (decisión pendiente; hoy los códigos observados no los llevan). Si dos empleados comparten el número de nómina no se vincula a ninguno.
- **Re-vincular marcas huérfanas** (por ejemplo después de dar de alta empleados): `POST /api/asistencia/marcas/revincular` con `{"limite":5000}` (permiso Ingesta:edicion); responde `{vinculadas, pendientes}`. La función `Ingesta.vincularHuerfanas` (`modules/rh/backend/models/ingesta.model.js`) es la que ejecutará periódicamente el motor de la Fase 4 (todavía no hay job).

## 10. Qué NO hace la ingesta

No calcula retardos ni faltas (Fase 4), no tiene pantallas (Fase 5), no modifica ni borra marcas (un trigger de la base lo impide: solo se puede vincular `empleado_id`) y no acepta marcas por ninguna otra ruta.
