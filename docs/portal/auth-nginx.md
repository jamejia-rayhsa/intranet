# nginx delante de GoTrue (`/auth/v1/`): lista blanca

Hallazgo I-2 de la revisión de "importar usuarios": nginx exponía GoTrue completo. Una cuenta Microsoft (`auth_tipo = 'ms365'`, sin contraseña)
podía obtener una contraseña por `POST /auth/v1/recover` (+ `/verify`) o por `PUT /auth/v1/user {password}` con su sesión, y luego entrar con
`POST /auth/v1/token?grant_type=password` sin pasar por Microsoft (sin MFA ni acceso condicional). Comprobado contra GoTrue real: sin bloqueo, `PUT /user` -> 200 y el login con la contraseña nueva -> 200.

## Qué se permite (todo lo demás da 403)

Archivo compartido: `config/nginx/auth-v1-allowlist.conf` (un `map` de contexto `http` que decide con método + `?grant_type` + `$uri` normalizado).
Cada `location /auth/v1/` hace `if ($auth_v1_permitido = 0) { return 403; }` y borra `X-HTTP-Method-Override`.

| Método y ruta | Quién lo usa |
|---|---|
| `GET authorize`, `GET callback` | Login con Microsoft (`signInWithOAuth`, flujo PKCE) |
| `POST token?grant_type=pkce` | `exchangeCodeForSession` tras el callback |
| `POST token?grant_type=refresh_token` | Renovación de sesión (`autoRefreshToken`) |
| `POST token?grant_type=password` | **Login con correo y contraseña de las cuentas `local`** (`PortalLogin.jsx` -> `iniciarSesion`) |
| `GET user`, `POST logout` | supabase-js (`signOut`, `getUser`) |
| `GET settings`, `GET health`, `GET .well-known/jwks.json` | Salud y metadatos |

Bloqueado, entre otros: `POST recover`, `PUT/PATCH/POST/DELETE user`, `admin/*`, `signup`, `magiclink`, `otp`, `invite`, `verify`, `resend`, `reauthenticate`,
`factors`, `sso`, `saml`, `token` con cualquier otro `grant_type` (o sin él) y cualquier método no listado (incluido `OPTIONS`). Es lista blanca: un endpoint nuevo de GoTrue queda cerrado hasta añadirlo.

Aplicado en `nginx.conf` (prod, el compose monta el archivo en `/etc/nginx/auth-v1-allowlist.conf`), `nginx.staging.conf` (mismo `include`) y `nginx.spa.conf`
(la imagen del frontend lo copia a `/etc/nginx/conf.d/00-auth-v1-allowlist.conf`, ver `Dockerfile.frontend`; es la ruta de staging detrás de Traefik).
**Hay que reconstruir la imagen del frontend** (y recrear el contenedor nginx de prod) para que surta efecto.

## Qué no se rompe (comprobado, ver "Cómo probarlo")

- El backend NO pasa por nginx: habla con `http://supabase-auth:9999` (admin API, `token?grant_type=password` para validar la contraseña actual, etc.).
- El cambio de contraseña desde la app lo hace el backend (`POST /api/auth/cambiar-password` -> `SupabaseAdmin.actualizarPassword`), no `PUT /auth/v1/user`.
- No hay pantalla de "olvidé mi contraseña": el reseteo lo hace un admin desde el portal.
- Si algún día hay invitaciones o recuperación por correo, habrá que abrir `verify` y `recover` a propósito (y decidir cómo impedirlo para `ms365`).

## Normalización (no se evade)

Se evalúa `$uri` (nginx ya lo decodificó y le quitó `//`, `/./` y `/../`), que es el mismo valor que se reenvía a GoTrue tras el `rewrite`; el ancla es `\z` (con `$` un `%0A`
final evadiría). Probado y bloqueado: `//auth/v1/recover`, `/auth//v1/recover`, `/auth/v1/./recover`, `/auth/v1/x/../recover`, `/auth/v1%2Frecover`, `/%72ecover`,
`RECOVER`, `recover/`, `recover%0A`, `recover%20`, `recover;x`, `PUT /user` en las mismas variantes, `grant_type=pass%77ord`, `grant_type=` vacío, `X-HTTP-Method-Override`.
GoTrue además distingue mayúsculas y no hace caso de `X-HTTP-Method-Override`.

## Riesgo residual (no se puede cerrar en nginx)

- **`grant_type=password` sigue abierto** porque las cuentas `local` entran así desde el frontend. nginx no sabe el `auth_tipo` de quien llama. Una cuenta `ms365` no
  tiene contraseña conocida (GoTrue guarda un hash aleatorio) y ya no tiene forma de ponerse una desde fuera; pero si un admin le fija una contraseña por otra vía (el portal ya lo impide
  para `auth_tipo != 'local'`) o `cambiar-password` (sin mirar `auth_tipo`; exige la contraseña actual, que no existe) se abusara, el login por contraseña funcionaría.
  **Defensa en profundidad (hecha en código):** `auth.middleware.js` rechaza con 401 (misma respuesta que un token inválido) el token de una cuenta
  `auth_tipo = 'ms365'` cuyo claim `amr` no traiga un método `oauth`. Se decide con `amr[].method`, NO con `app_metadata.provider`: comprobado con GoTrue
  v2.196.0 real y un IdP Azure simulado, `provider` vale `email` también en el token OAuth de una cuenta creada por la API admin (`providers: [email, azure]`
  en ambos), así que no distingue. `amr` sí: `oauth` en la sesión Microsoft, `password` en la de contraseña; se conserva en los refresh (y tras un `PUT /user`
  con sesión OAuth). Sin `amr` o con otro método (`password`, `otp`) la cuenta ms365 no entra (fail-closed). Cuentas `local`: sin cambio. Sin consultas extra
  (`auth_tipo` va en el SELECT que ya se hacía). Límite: `oauth` no nombra al proveedor; es seguro mientras `azure` sea el único OAuth habilitado en GoTrue.
  Una sesión Microsoft abierta antes de poner contraseña sigue siendo una sesión Microsoft legítima (válida hasta que se revoque/expire).
- Fuerza bruta contra `token?grant_type=password` de cuentas `local`: solo el rate limit de GoTrue. Sin `limit_req` en nginx.
- Desarrollo (`docker-compose.dev.yml`) usa el proxy de Vite, sin este bloqueo.
- Cualquiera que ya tenga acceso a la red interna (contenedores del stack) llega a GoTrue sin pasar por nginx.

## Cómo probarlo

```bash
docker exec <nginx> nginx -t          # en cada config (spa: conf.d/00-auth-v1-allowlist.conf debe existir)
B=https://<host>                       # sin llaves ni IPs reales en el repo
curl -s -o /dev/null -w '%{http_code}\n' -X POST $B/auth/v1/recover -H 'Content-Type: application/json' -d '{"email":"x@example.com"}'   # 403
curl -s -o /dev/null -w '%{http_code}\n' -X PUT  $B/auth/v1/user -H "Authorization: Bearer <access_token>" -H 'Content-Type: application/json' -d '{"password":"x"}'   # 403
curl -s -o /dev/null -w '%{http_code}\n' --path-as-is -X POST "$B/auth/v1%2Frecover"   # 403
curl -s -o /dev/null -w '%{http_code}\n' $B/auth/v1/health        # 200
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$B/auth/v1/token?grant_type=refresh_token" -H 'Content-Type: application/json' -d '{"refresh_token":"<rt>"}'   # 200
```

Usa `--path-as-is` en las variantes con `//`, `./`, `..` o `%2F` (curl las normaliza si no). Para una prueba completa se levantó nginx:alpine + `supabase/gotrue:v2.196.0` + postgres:16 en una red
desechable (192+ comprobaciones por config: refresh, GET user, logout, authorize a Microsoft, callback, y ~60 variantes bloqueadas); contenedores borrados al terminar.
