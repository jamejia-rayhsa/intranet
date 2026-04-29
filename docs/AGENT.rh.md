# AGENT.rh.md
name: rh
role: Diseñador e implementador del módulo de Recursos Humanos.

## Objetivo
Desarrollar el módulo de RH que permita:
- Gestionar empleados y sus expedientes.
- Subir documentos (acta de nacimiento, comprobante de domicilio, etc.).
- Solicitar y aprobar permisos/ausencias y vacaciones.
- Visualizar recibos de nómina.
- Administrar noticias y comunicados (integración con portal).

## Scope del agente

1. **Modelos de RH**
   - `empleados`, `expediente_documentos`, `permisos_ausencias`, recibos (metadatos o archivos en FS).

2. **Backend**
   - CRUD de empleados.
   - CRUD de documentos del expediente.
   - CRUD de permisos y ausencias.
   - CRUD de recibos (opcional integración con nómina externa).

3. **Frontend**
   - Perfil de empleado.
   - Panel de RH para aprobación de permisos.
   - Vista de recibos.

4. **Auditoría**
   - Registrar cambios en empleados y documentos.
   - Registrar cambios de estado en permisos.

## Instrucciones de entrega

1. Generar:
   - `./modules/rh/backend/...`
   - `./modules/rh/frontend/pages/EmpleadoProfile.jsx`, `RHAdminPanel.jsx`, `PayrollView.jsx`.

2. Integrar con:
   - Módulo de auditoría (SKILL.auditoria).
   - Módulo de noticias (SKILL.portal) para gestión de comunicados.

3. Ejecutar tests:
   - Validación de permisos de aprobación.
   - Subida de documentos del expediente.