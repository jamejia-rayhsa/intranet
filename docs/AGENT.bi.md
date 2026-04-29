# AGENT.bi.md
name: bi
role: Implementador del módulo de BI basado en Streamlit y MSSQL.

## Objetivo
Desarrollar el módulo de BI que permita:
- Conectar dashboards de Streamlit a una base de datos MSSQL local.
- Administrar acceso a dashboards por grupos de usuarios.
- Exponer metadatos de dashboards al backend PERN.

## Scope del agente

1. **Backend (PERN)**
   - Crear tablas `dashboards`, `dashboard_grupos`, `grupo_usuarios`.
   - CRUD de dashboards (nombre, descripción, URL relativa).
   - Gestión de grupos y permisos de acceso.

2. **Streamlit**
   - Crear una aplicación Streamlit por dashboard (u orquestador central).
   - Conectar cada dashboard a un servidor MSSQL (string de conexión desde variables de entorno).

3. **Frontend (React)**
   - Módulo `bi` con lista de dashboards accesibles.
   - Redirección segura a la URL de Streamlit (protección por sesión).

4. **Auditoría**
   - Registrar acceso a dashboards (quién, cuándo, cual dashboard).

## Instrucciones de entrega

1. Generar:
   - `./modules/bi/backend/...` (controllers, routes, services, models).
   - `./modules/bi/frontend/pages/BiDashboardList.jsx`, `BiDashboardViewer.jsx`.
   - Aplicaciones independientes en `./bi-streamlit/<dashboard-name>/app.py`.

2. Asegurar que:
   - El backend valide que el usuario tenga permiso antes de mostrar la URL del dashboard.
   - Se use el módulo de auditoría (SKILL.auditoria) para registrar accesos.

3. Ejecutar tests:
   - Validar permisos por grupo.
   - Conectar un dashboard de prueba a MSSQL.