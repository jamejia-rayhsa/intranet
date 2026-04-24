# Módulo de Tickets de Soporte TI

Módulo para la gestión de tickets de soporte técnico con clasificación por nivel, adjuntos, encuestas de satisfacción y notificaciones por correo.

## Estructura

```
modules/tickets/
├── backend/          # Express API
│   ├── models/       # Modelos de datos
│   ├── controllers/  # Controladores
│   ├── services/     # Servicios (notificación, archivos)
│   ├── middleware/   # Middleware (upload)
│   ├── routes/       # Rutas API
│   ├── config/       # Configuración de BD
│   └── migrations/   # Migraciones SQL
├── frontend/         # React
│   ├── pages/        # Páginas principales
│   ├── components/   # Componentes reutilizables
│   ├── services/     # Servicios de API
│   └── routes/       # Rutas frontend
├── config/           # Configuración de permisos
├── tests/            # Pruebas
└── README.md
```

## Endpoints

| Método | Ruta                       | Descripción       | Permisos                          |
| ------ | -------------------------- | ----------------- | --------------------------------- |
| GET    | `/api/tickets`             | Listar tickets    | tickets.view                      |
| GET    | `/api/tickets/:id`         | Detalle de ticket | tickets.view                      |
| POST   | `/api/tickets`             | Crear ticket      | tickets.create                    |
| PUT    | `/api/tickets/:id/estado`  | Cambiar estado    | tickets.admin, tickets.technician |
| PUT    | `/api/tickets/:id/asignar` | Asignar técnico   | tickets.admin                     |
| DELETE | `/api/tickets/:id`         | Eliminar ticket   | tickets.admin                     |
| GET    | `/api/adjuntos/:ticketId`  | Listar adjuntos   | tickets.view                      |
| POST   | `/api/adjuntos/:ticketId`  | Subir adjunto     | tickets.create                    |
| DELETE | `/api/adjuntos/:id`        | Eliminar adjunto  | tickets.admin                     |

## Ejecutar

```bash
cd modules/tickets/backend && npm install && npm run dev
```

## Dependencias

- **portal**: Autenticación JWT, tabla `usuarios`, middleware de permisos
- **auditoria**: Registro de cambios en tickets, adjuntos y encuestas
