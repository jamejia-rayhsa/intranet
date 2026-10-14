# Notificaciones de la intranet (correo + Teams)

La intranet no envía correo por SMTP: pide a **n8n** (event-proxy, workflow `WF-INTRA-01 Notificaciones`) que lo haga con Microsoft Graph. Sin configuración, cae a SMTP (o se omite si tampoco hay SMTP).

```
backend ──POST /webhook/intranet-notificar (X-Intranet-Secret)──► n8n ──► Graph: correo desde intranet@ y/o DM de Teams
```

## Variables del backend
| Variable | Valor |
|---|---|
| `N8N_NOTIFICAR_URL` | `http://n8n_app:5678/webhook/intranet-notificar` (red docker `proxy`) |
| `N8N_NOTIFICAR_SECRETO` | el de la credencial de n8n «Intranet — X-Intranet-Secret» (en el `.env.<entorno>` del servidor, nunca en el repo) |
| `FRONTEND_URL` | URL pública de la intranet; se usa en los enlaces de los correos (p. ej. la encuesta) |

## Qué manda cada módulo
- **Tickets:** nuevo ticket y cambios de estado (correo); al resolver y al asignar, correo + Teams.
- **RH:** permiso aprobado o rechazado (correo + Teams); nuevo permiso al jefe (correo).

## Checklist para producción
1. En el host de producción debe existir la red docker `proxy` (la de n8n). Levantar con el override: `docker compose -f docker-compose.prod.yml -f docker-compose.prod.n8n.yml --env-file .env.prod up -d`.
2. Rellenar `.env.prod`: `FRONTEND_URL`, `N8N_NOTIFICAR_URL` y `N8N_NOTIFICAR_SECRETO` (leerlo de la credencial en n8n o generar uno nuevo y actualizar ambos lados).
3. Probar desde el contenedor: `docker exec intranet_backend_prod node -e "fetch(process.env.N8N_NOTIFICAR_URL,{method:'POST',body:'{}'}).then(r=>console.log(r.status))"` debe dar **403** (alcanza n8n; sin secreto no entra).
4. Enviar un aviso real (cambiar un ticket de prueba a «resuelto») y comprobar que la ejecución de WF-INTRA-01 termina en `success` con `Send Mail` y `Send DM`.

## Límites y comportamiento (WF-INTRA-01)
Destinatarios solo `@rayhsa.com.mx`; origen `tickets` o `rh`; 10 envíos/hora por destinatario y 60/hora en total; un fallo del correo no detiene el DM de Teams (`On Error: Continue`).

## Trampas
- En n8n 2.x, guardar un workflow activo no cambia lo que corre: hay que **Publish**.
- Si el correo falla con `Blocked by tenant configured AppOnly AccessPolicy`, el buzón no está en la Application Access Policy de Exchange (o falta propagar, hasta unas 17 h).
- Un secreto distinto en n8n y en el `.env` produce 403 en cada aviso (el backend solo lo registra en el log).
