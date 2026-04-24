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

- **Auth middleware (nuevo, Fase 2+):** `verificarPermiso(modulo, opcion, tipo)` — un rol por usuario via `usuarios.rol_id`
- **Auth middleware (legado):** `autorizar(['portal.admin'])` — multi-rol via tabla `usuario_rol` (solo en codigo no migrado)
