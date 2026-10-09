---
paths: modules/*/backend/**
---

# Patrones de backend obligatorios

## Conexion a base de datos

- **DB pool:** `const { grupo } = require('../config/database')` — `pg.Pool`

## Formato de respuestas API

- **Respuestas exitosas:** `{ exito: true, datos: {...} }`
- **Respuestas de error:** `{ exito: false, mensaje: '...' }`

## Autenticacion y permisos

- **Identidad:** `authenticateJWT` verifica tokens de Supabase Auth (GoTrue, HS256 con `SUPABASE_JWT_SECRET`) y resuelve al usuario local por `usuarios.auth_uid`. No hay login/registro propios; las altas las hace un admin via `supabaseAdmin.service.js`.
- **Archivos:** siempre via `storage.service.js` (Supabase Storage); nunca escribir en disco ni servir `/uploads`.
- **Permisos:** `verificarPermiso(modulo, opcion, tipo)` — un rol por usuario via `usuarios.rol_id`; para decidir en código usar `tienePermiso(user, modulo, opcion, tipo)`
- **Propiedad:** recibos, expedientes, permisos de ausencia, vacaciones y tickets además exigen ser el dueño del recurso o RH/administrador (`acceso-empleado.middleware.js`, `acceso-ticket.middleware.js`)
