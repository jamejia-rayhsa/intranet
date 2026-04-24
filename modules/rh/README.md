# Módulo de Recursos Humanos

Módulo para la gestión de empleados, expedientes digitales, permisos/ausencias, vacaciones y recibos de nómina.

## Estructura

```
modules/rh/
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

### Empleados

| Método | Ruta                       | Descripción                  | Permisos |
| ------ | -------------------------- | ---------------------------- | -------- |
| GET    | `/api/empleados`           | Listar empleados con filtros | rh.admin |
| GET    | `/api/empleados/mi-perfil` | Perfil del usuario actual    | Todos    |
| GET    | `/api/empleados/:id`       | Detalle de empleado          | rh.admin |
| POST   | `/api/empleados`           | Crear empleado               | rh.admin |
| PUT    | `/api/empleados/:id`       | Actualizar datos             | rh.admin |
| PUT    | `/api/empleados/:id/baja`  | Dar de baja                  | rh.admin |

### Expediente

| Método | Ruta                          | Descripción             | Permisos |
| ------ | ----------------------------- | ----------------------- | -------- |
| GET    | `/api/expediente/:empleadoId` | Documentos del empleado | rh.admin |
| POST   | `/api/expediente/:empleadoId` | Subir documento         | rh.admin |
| DELETE | `/api/expediente/:id`         | Eliminar documento      | rh.admin |

### Permisos/Ausencias

| Método | Ruta                          | Descripción          | Permisos |
| ------ | ----------------------------- | -------------------- | -------- |
| GET    | `/api/permisos`               | Listar solicitudes   | rh.view  |
| GET    | `/api/permisos/:id`           | Detalle de solicitud | rh.view  |
| POST   | `/api/permisos`               | Solicitar permiso    | rh.view  |
| PUT    | `/api/permisos/:id/responder` | Aprobar/rechazar     | rh.admin |

### Recibos de Nómina

| Método | Ruta                                | Descripción          | Permisos |
| ------ | ----------------------------------- | -------------------- | -------- |
| GET    | `/api/recibos/empleado/:empleadoId` | Recibos del empleado | rh.view  |
| GET    | `/api/recibos/periodo/:periodo`     | Recibos por periodo  | rh.admin |
| POST   | `/api/recibos`                      | Crear recibo con PDF | rh.admin |
| DELETE | `/api/recibos/:id`                  | Eliminar recibo      | rh.admin |

## Ejecutar

```bash
cd modules/rh/backend && npm install && npm run dev
```

## Dependencias

- **portal**: Autenticación JWT, tabla `usuarios`, middleware de permisos
- **auditoria**: Registro de cambios en empleados, documentos, permisos y recibos
