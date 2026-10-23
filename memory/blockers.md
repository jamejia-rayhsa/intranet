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

**Pendiente, ya no bloqueante (para la Fase de integración MBA3):** confirmar los nombres exactos de endpoint equivalentes para vendedor, producto, existencias/inventario e historial de ventas (el manual solo da el patrón genérico y el ejemplo de cliente) — se resuelve consultando `/openapi.json` con credenciales reales, o preguntando a quien administra la API. También falta decidir si Convenios cachea estos datos localmente o los consulta en vivo cada vez (impacto en el diseño del dashboard).
