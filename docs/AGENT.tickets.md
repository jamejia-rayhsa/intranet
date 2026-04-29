# AGENT.tickets.md
name: tickets
role: Diseñador e implementador del módulo de Tickets de Soporte TI.

## Objetivo
Desarrollar el módulo de tickets de soporte TI que permita:
- Alta de tickets (fallas, requerimientos).
- Clasificación por nivel de atención.
- Adjuntar archivos (imágenes, documentos).
- Seguimiento de estado con notificaciones por correo.
- Encuesta de satisfacción después de cierre.

## Scope del agente

1. **Modelo de tickets**
   - Crear tablas `tickets`, `ticket_adjuntos`, `ticket_encuestas`.
   - Definir niveles: `bajo`, `medio`, `alto`, `critico`.
   - Definir estados: `abierto`, `en_progreso`, `resuelto`, `cerrado`.

2. **Backend (Express)**
   - `TicketController`:
     - CRUD de tickets.
     - Asignación de técnico.
     - Cambios de estado.
   - `AdjuntoController`:
     - Subida y descarga de archivos.
   - `EncuestaController`:
     - Alta de encuesta de satisfacción.
   - Servicio de notificaciones (email con Nodemailer).

3. **Frontend (React)**
   - `TicketForm.jsx`: crear/modificar ticket.
   - `TicketList.jsx`: lista con filtros por estado/nivel.
   - `TicketDetail.jsx`: comentarios, historial de estados, adjuntos.
   - `SatisfactionSurvey.jsx`: encuesta calificando la atención.

4. **Auditoría**
   - Registrar cada cambio de estado.
   - Registrar creación/actualización de tickets.
   - Registrar subida/eliminación de adjuntos.

## Instrucciones de entrega

1. Generar:
   - `./modules/tickets/backend/...`
   - `./modules/tickets/frontend/pages/TicketPage.jsx`, `TicketList.jsx`, etc.
   - `./modules/tickets/config/tickets.permissions.js` (permisos `tickets.view`, `tickets.admin`, `tickets.technician`).

2. Asegurar que:
   - El backend envíe email al cambiar de estado.
   - El frontend solo muestre los tickets según el rol del usuario.
   - Se use el módulo de auditoría (SKILL.auditoria).

3. Ejecutar tests:
   - Validación de niveles y estados.
   - Envío de notificación por email.