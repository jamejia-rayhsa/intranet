---
name: context
description: Misión, alcance y stakeholders del proyecto intranet corporativa Rayhsa
type: project
---

# Contexto del proyecto

**Empresa:** RAYHSA (Regresa Sano a Casa)
**Misión:** Intranet corporativa modular PERN (PostgreSQL, Express, React 18 + Vite, Node.js)
**Stack:** Docker + WSL2, JWT + Azure AD, GitHub Actions CI/CD
**Puerto único:** 4000 (backend unificado en `modules/portal/backend/app.js`)

## Módulos
- Portal (auth, roles, permisos, noticias) — `/`
- RH (empleados, expediente, vacaciones) — `/rh`
- Tickets (soporte TI) — `/tickets`
- Auditoría (log transversal) — `/auditoria`
- BI — pendiente
- Comercial — pendiente

## Arquitectura clave
- Todas las rutas backend se registran en `modules/portal/backend/app.js`
- Un solo frontend React en `modules/portal/frontend/`
- El sidebar se controla en `MenuDinamico.jsx` vía `SUB_RUTAS`
- Auditoría se registra llamando `registrarAccion` de `modules/auditoria/backend/services/auditoria.service.js`
- Patron de respuesta: `{ exito: true, datos: ... }` / `{ exito: false, mensaje: ... }`
- Auth middleware: `verificarPermiso(modulo, opcion, tipo)` en rutas protegidas
