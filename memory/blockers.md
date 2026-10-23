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
