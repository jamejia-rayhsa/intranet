# blockers — unknowns y bloqueos activos

> Formato: cada unknown con quién lo resuelve y en qué fase. Al resolverse,
> márcalo ~~resuelto~~ y mueve el hallazgo a [[research]] o la decisión a [[decisions]].

---

### ~~[2026-10-23] BLOQUEO ACTIVO — Canal de lectura de MBA3 no confirmado (Convenios de compra)~~ RESUELTO el mismo día

**Quién lo resuelve:** el humano (jamejia), probablemente coordinando con quien administra MBA3 (IT/proveedor del ERP) — no se puede resolver desde el código del repo.
**En qué fase:** gatea el inicio de la Fase de catálogos (Cliente, Producto, Inventario/consumo) de "Convenios de compra" del módulo Comercial — ver [[decisions]] (2026-10-23).

**Qué falta saber (de [[research]], entrada 2026-10-22):**
- Si existe un canal de **lectura** hacia MBA3 (vs. el único confirmado hoy, que es un canal de **escritura**: alta/actualización de cliente CODE_s=05 en `solicitudCredito.controller.js:233-313`).
- Si ese canal es un web service (como el de escritura, `${MBA3_URL}/wsAPIS/api_wr`), una tabla intermedia `SIST_API` vía ODBC, o acceso directo a la base MSSQL (variables `MSSQL_*` existen en los compose de staging/prod pero no se usan en código ni hay dependencia `mssql` en package.json).
- Si ese canal expone: ficha de clientes (APIOUT 105), ficha de productos (APIOUT 116), existencias (ajustes de inventario, APIOUT 112) e historial de ventas por cliente — necesarios para que Convenios muestre inventario, última venta y promedio de venta.
- Credenciales, esquema exacto y si el host de MBA3 es alcanzable desde la red donde corre la intranet (dev/staging/prod).
- Documentación de referencia ya en el repo: `docs/comercial/MBA3_API.md` (6681 líneas); cubre las fichas de entrada/salida pero no confirma el canal de lectura real.

**Mientras se resuelve:** sin esto, "Convenios de compra" no puede traer Cliente/Producto/Inventario reales de MBA3. Se le preguntó de vuelta al humano el 2026-10-23 cómo proceder mientras se resuelve.

**RESUELTO [2026-10-23]:** el humano adjuntó `manual-conexion-api.md` — SÍ existe un canal de lectura confirmado: una API REST propia (`https://mba3api.rayhsa.net`, FastAPI/Uvicorn detrás de Cloudflare) **distinta** del web service de escritura (`wsAPIS/api_wr`) que ya usa Solicitudes de Crédito. JWT (access ~15 min + refresh ~7 días), endpoints del catálogo bajo `POST /v1/api/{nombre_endpoint}` con paginación `limit/offset`, descubribles en `GET /openapi.json` o `/docs`. Ejemplo confirmado: `ficha-cliente` (body `{"codigo": "..."}`). Ver detalle completo en [[decisions]] (2026-10-23, "MBA3 lectura: canal confirmado").

**Pendiente, ya no bloqueante (para la Fase de integración MBA3):** ~~confirmar los nombres exactos de endpoint equivalentes para vendedor, producto, existencias/inventario e historial de ventas~~ RESUELTO: el humano confirmó `clientes-vendedor`, `vendedores`, `productos`, `acuvtaprod` (ver [[decisions]], "Fase 2 de Convenios de compra: endpoints de MBA3 confirmados por el humano"). Caché: decidido en Fase 2 (tabla `comercial_cache_mba3` con TTL por tipo).

---

### [2026-10-23] BLOQUEO ACTIVO — `mba3api.rayhsa.net` está detrás de Cloudflare Access (Zero Trust): no se puede verificar en vivo ni con credenciales reales

**Quién lo resuelve:** el humano, coordinando con quien administra Cloudflare Access para `rayhsa.net` (puede ser el mismo que administra MBA3, o un equipo de IT/infraestructura distinto) — no se puede resolver desde el código del repo ni con las credenciales de la API de MBA3 solas.
**En qué fase:** gatea la verificación en vivo de la Fase 2 de "Convenios de compra" (integración de lectura MBA3) y, más importante, gatea que la integración funcione en producción/staging aunque el código esté listo.

**Hallazgo (coder, Fase 2, 2026-10-23):** el sandbox de desarrollo SÍ tiene salida a internet, y `curl https://mba3api.rayhsa.net/openapi.json` (que el manual dice que no requiere login) respondió con un **302 a una pantalla de login SSO de Cloudflare Access**, igual que `POST /v1/login` sin cookie de sesión de Cloudflare — con o sin credenciales de MBA3. Es decir, Cloudflare exige autenticarse con Cloudflare (SSO humano o un Service Token de Cloudflare Access) **antes** de que la petición llegue siquiera a la API/FastAPI de MBA3. Las credenciales de usuario/password de la API (confirmadas por el humano como ya existentes) no alcanzan por sí solas.

**Qué hace falta:** que quien administra Cloudflare Access para ese dominio dé de alta una de estas dos cosas para el backend de la intranet (que corre como servidor, sin navegador ni SSO interactivo):
1. Un **Service Token de Cloudflare Access** (`CF-Access-Client-Id` + `CF-Access-Client-Secret` como headers en cada petición), o
2. Una **política de bypass** para el rango de IP del servidor de la intranet (dev/staging/prod).

**Mientras se resuelve:** el código de la Fase 2 ya está construido y probado contra un MBA3 falso local (login/refresh/caché/fallback), pero los 4 endpoints sin `ficha-cliente` siguen con el body sin verificar (ver [[decisions]]) y **nada de esto se puede confirmar en vivo** hasta tener el Service Token o el bypass. No bloquea cerrar la Fase 2 con revisión/pruebas de código; sí bloquea cualquier promesa de "ya funciona con MBA3 real".

**[2026-10-23] [coder] — el código YA soporta mandar el Service Token si se configura.** `mba3Lectura.service.js` manda `CF-Access-Client-Id`/`CF-Access-Client-Secret` en las 4 llamadas HTTP reales (login, refresh, logout, catálogo) leyendo `MBA3_LECTURA_CF_ACCESS_CLIENT_ID`/`MBA3_LECTURA_CF_ACCESS_CLIENT_SECRET`; si cualquiera de las 2 falta, no manda ninguna (sin romper entornos sin Cloudflare Access delante) y avisa por log si `MBA3_LECTURA_URL` está configurado pero faltan. Variables agregadas a `.env.staging.example`, `.env.prod.example` y `docker-compose.{dev,staging,prod}.yml` (default vacío). Probado con mocks (`npx jest modules/comercial` 189/189); **no probado contra Cloudflare/MBA3 real** (el coder no tiene ni puede tener el Service Token real). Ver code-notes.md, "Soporte de Service Token de Cloudflare Access".

**Lo que queda bloqueado (humano, no código):** poner los 2 valores reales del Service Token en el `.env` del entorno donde se quiera probar en vivo (dev/staging/prod, según dónde el humano quiera verificar primero). Con eso puesto, el siguiente paso natural es repetir el Paso 0 (`GET /openapi.json` con el Service Token) para por fin confirmar los bodies de los 4 endpoints que siguen siendo suposición (ver [[decisions]]).

**[2026-10-29] [orquestador] — el Service Token real (ya puesto por el humano en `.env.dev.local`) NO resuelve el bloqueo; probado en vivo con el stack aislado `convenios-test`.**

Con las 4 variables reales puestas (`MBA3_LECTURA_USUARIO`/`PASSWORD`/`CF_ACCESS_CLIENT_ID`/`CF_ACCESS_CLIENT_SECRET`, longitudes 17/12/39/54 caracteres, sin espacios ni saltos de línea de sobra — verificado), **`POST /v1/login` y `GET /openapi.json` siguen devolviendo 200 con la página HTML "Sign in · Cloudflare Access"**, exactamente igual con los 2 headers del Service Token que sin ellos (probado ambos casos). Es decir: Cloudflare Access sigue interceptando el dominio completo y el Service Token, tal como está configurado hoy, no tiene ningún efecto — ni lo acepta ni lo rechaza con un error distinto, lo ignora igual que si no se mandara nada.

**Además, se agregó `docs/manual-conexion-api.md`** (manual oficial de la API para equipos externos) y **no menciona Cloudflare Access ni Service Tokens en ningún lado** — solo dice que Cloudflare termina el TLS y hace proxy, y que "alcanza con usar siempre `https://mba3api.rayhsa.net`". Esto contradice lo observado (el dominio completo, incluido `/openapi.json` que el manual dice que no requiere login, está gateado por Access). Dos lecturas posibles, ninguna resoluble desde aquí: (a) Access se agregó **después** de escribirse el manual y el documento quedó desactualizado, o (b) Access tiene una política de **bypass por rango de IP** (no por Service Token) para quien prueba desde la red interna/oficina, y el manual nunca mencionó el Service Token porque nadie necesitó uno probando desde ahí — en ese caso el Service Token puede ni ser el mecanismo correcto, o estar mal dado de alta en la política de la Access Application de ese dominio.

**Para decidir/resolver (solo el humano, coordinando con quien administra Cloudflare Access):** confirmar con el responsable de Cloudflare (1) si Access sigue puesto a propósito sobre `mba3api.rayhsa.net` hoy, (2) si la vía correcta para un backend-servidor (sin navegador) es Service Token o bypass por IP, y (3) si es Service Token, regenerarlo y confirmar que se agregó como regla "Service Auth" dentro de la política de la Access Application de ese dominio específico (no solo creado en la cuenta). Hasta entonces, la verificación en vivo de Fase 2/3 contra MBA3 real sigue bloqueada igual que antes del 2026-10-23.

**[2026-11-10] [orquestador] — CONFIRMADO: el mecanismo (2 headers de Service Token) es el correcto; el problema es específico de NUESTRO token, no del enfoque.**

El humano consiguió `guia-consumo-mba3api-para-tableros.md`, escrita por la sesión que mantiene el portal Streamlit de BI (consumidor real y funcionando de `mba3api.rayhsa.net`). Confirma, sin ambigüedad, exactamente lo que ya hacíamos:

- **Sí hace falta `CF-Access-Client-Id` + `CF-Access-Client-Secret` en TODA petición** (incluido el login) — la guía incluso dice textualmente que `docs/manual-conexion-api.md` tiene un "gap real" al no mencionarlo. Esto resuelve la duda de lectura (a)/(b) de la entrada anterior: Access sí es a propósito y Service Token sí es el mecanismo correcto — **no es bypass por IP**.
- Su `cliente.py` manda los mismos 2 headers + `Authorization: Bearer` en cada request a `POST /v1/api/{endpoint}`, con timeout de 30 s (dice que Cloudflare corta conexiones a los ~100 s).
- Variables de entorno equivalentes a las nuestras pero con otro nombre: `MBA3API_USERNAME`/`MBA3API_PASSWORD`/`CF_ACCESS_CLIENT_ID`/`CF_ACCESS_CLIENT_SECRET` (+ `REDIS_PASSWORD`, no aplica aquí) — su código asume que SIEMPRE existen (usa `os.environ[...]` directo, sin default) y falla con `KeyError` crudo si falta una.
- Rate limit real del lado de MBA3: 5 intentos de login/minuto por IP, bloqueo de cuenta 15 min tras 5 fallos — **ya causó un incidente real en el portal de BI**. No nos afecta a nosotros todavía porque nuestras peticiones nunca llegan a pasar de Cloudflare (siempre 200 HTML, nunca tocan el login real de MBA3), pero hay que recordarlo una vez que el token sí pase.

**Conclusión:** como un consumidor real (BI) usa el mismo mecanismo con éxito hoy, el bloqueo no es "Service Token vs. IP" ni un gap de nuestro código — es que **el par Client-Id/Client-Secret que tenemos puesto específicamente no está siendo aceptado** por la Access Application de `mba3api.rayhsa.net` (inválido, revocado, o nunca agregado a esa política). BI casi seguro usa un Service Token DISTINTO al nuestro (emitido para su propia cuenta de servicio). **Siguiente paso (humano):** pedir a quien administra Cloudflare Access un Service Token nuevo, emitido y agregado específicamente para el backend de Convenios de compra (o confirmar que el que ya se nos dio sí quedó agregado a esa política) — no asumir que cualquier Service Token de la cuenta sirve para cualquier Access Application.

---

### [2026-11-10] RESUELTO — bloqueo de Cloudflare Access y de credenciales MBA3, ambos cerrados; login y catálogos reales confirmados

**Cloudflare Access ya pasa.** Tras que el humano revisara/regenerara el Service Token del lado de Cloudflare, `GET /openapi.json` y `POST /v1/login` dejaron de devolver la pantalla SSO — responden JSON real. El bloqueo de Cloudflare descrito arriba (desde el 2026-10-23) queda cerrado.

**Las credenciales de MBA3 (usuario/password) seguían fallando con `401 Credenciales inválidas` incluso probando directo contra el servidor interno (`http://10.10.11.12:8000/v1/login`, sin Cloudflare de por medio) — la causa real era que `.env.dev.local` del worktree y el del checkout principal (`/home/jamejia/intranet/.env.dev.local`) son archivos DISTINTOS sin ninguna sincronización automática** (worktrees no comparten archivos sin versionar). El humano llevaba varias rondas editando solo el del checkout principal sin que llegara aquí. Diagnosticado comparando `sha256sum` de cada línea entre ambos archivos (sin imprimir valores) — 3 de las 4 variables eran distintas. Lección para toda sesión futura en este worktree: **antes de cualquier prueba con `.env.dev.local`, comparar hashes contra `/home/jamejia/intranet/.env.dev.local` y resincronizar si difieren.**

**Login real confirmado (`LOGIN_OK`) y 2 endpoints de catálogo verificados con datos reales de producción** (ver [[decisions]] para el detalle de los 3 nombres de parámetro corregidos en `mba3Lectura.service.js`: `clientes-vendedor` usa `vendedor` no `codigo_vendedor`; `acuvtaprod` usa `Producto` no `codigo_producto`; el endpoint `productos` que asumíamos **no existe** — queda como pregunta abierta de producto, ver decisions.md).

**INCIDENTE DE SEGURIDAD (orquestador, auto-reportado):** al depurar un 500 de `ficha-producto`, imprimí por error el objeto de error de axios completo, que incluye los headers de la petición — esto expuso en el chat, en texto plano, el **Bearer access_token** real (vida corta, ~15 min) Y el **`CF-Access-Client-Id`/`CF-Access-Client-Secret`** reales del Service Token de Cloudflare (estos NO son de vida corta). Se avisó al humano de inmediato recomendando regenerar el Service Token. **Para cualquier sesión futura: NUNCA imprimir un objeto de error de axios completo (`console.log(error)` o similar) — siempre extraer solo `error.message`/`error.response?.data`, nunca `error.config`/`error.request` (ahí viven los headers con credenciales).**
