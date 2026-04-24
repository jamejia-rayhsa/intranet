# uliweb — Reglas globales

## Stack tecnico

- **DB:** PostgreSQL
- **Backend:** Node.js + Express
- **Frontend:** React 18 + Vite (unico frontend, sirve todos los modulos)
- **Infraestructura:** Docker + WSL2 (Linux 6.6)
- **Auth:** JWT + Azure AD

## Estructura de modulos

| Modulo | Puerto | Directorio |
|---|---|---|
| Portal (API principal) | 4000 | `modules/portal/backend/` |
| Tickets | 4001 | `modules/tickets/backend/` |
| RH | 4002 | `modules/rh/backend/` |
| Auditoria | 4003 | `modules/auditoria/backend/` |
| Frontend (unico) | — | `modules/portal/frontend/` |

## Flujo de trabajo

- Usar **subagent-driven-development** para ejecutar planes multi-paso
- Crear worktrees en `~/.config/superpowers/worktrees/uliweb/<nombre-branch>`
- Hacer commits frecuentes — el equipo se apaga entre sesiones
- Mantener el plan actualizado con checkboxes para poder retomar

## Estado del proyecto

El plan de revision integral de 3 fases esta **COMPLETO** y mergeado a `main`.

- Fase 1 (Auditoria): `963d572`
- Fase 2 (Portal): `acbd6de`
- Fase 3 (Tickets + RH): `15a15bb`

Spec en: `docs/superpowers/specs/2026-04-11-revision-integral-intranet-design.md`
