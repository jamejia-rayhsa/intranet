# Módulo de Auditoría

Módulo transversal que registra todos los cambios (INSERT, UPDATE, DELETE) en las tablas de los demás módulos de la intranet. Cada acción queda registrada con usuario, valores anteriores y nuevos, IP y user agent.

---

## Estado

✅ **Completado** — ~20 archivos

---

## Estructura

```
modules/auditoria/
├── backend/
│   ├── models/
│   │   └── auditoria.model.js            # Modelo de datos
│   ├── services/
│   │   └── auditoria.service.js          # Servicio central registrarAccion()
│   ├── middleware/
│   │   └── auditoria.middleware.js       # Middleware reutilizable para rutas
│   ├── controllers/
│   │   └── auditoria.controller.js       # Controlador de consultas
│   ├── routes/
│   │   └── auditoria.routes.js           # Rutas API
│   ├── migrations/
│   │   └── 001_crear_tabla_auditoria.sql # Migración SQL
│   └── package.json
├── frontend/
│   ├── pages/
│   │   └── AuditoriaPage.jsx             # Vista de logs con filtros
│   └── components/
│       └── AuditoriaFiltros.jsx          # Filtros por módulo, usuario, fecha
├── README.md
└── modules/*/                            # Integrado en cada módulo
    └── backend/controllers/              # Cada controlador llama a AuditoriaService
```

---

## Esquema de Base de Datos

### Tabla `auditoria`

| Campo             | Tipo              | Descripción                                   |
| ----------------- | ----------------- | --------------------------------------------- |
| `id`              | SERIAL PK         | Identificador único                           |
| `usuario_id`      | INT FK → usuarios | Usuario que realizó la acción                 |
| `modulo`          | VARCHAR(100)      | Nombre del módulo (portal, tickets, rh, etc.) |
| `tabla`           | VARCHAR(100)      | Tabla afectada                                |
| `registro_id`     | VARCHAR(100)      | ID del registro modificado                    |
| `accion`          | VARCHAR(20)       | Tipo de acción: INSERT, UPDATE, DELETE        |
| `valores_previos` | JSONB             | Datos antes del cambio (null para INSERT)     |
| `valores_nuevos`  | JSONB             | Datos después del cambio (null para DELETE)   |
| `ip_origen`       | VARCHAR(45)       | IP del cliente                                |
| `user_agent`      | TEXT              | Navegador/cliente del usuario                 |
| `fecha`           | TIMESTAMP         | Fecha y hora de la acción                     |

---

## Endpoints

| Método | Ruta                 | Descripción                  | Permisos       |
| ------ | -------------------- | ---------------------------- | -------------- |
| GET    | `/api/auditoria`     | Listar registros con filtros | auditoria.view |
| GET    | `/api/auditoria/:id` | Detalle de un registro       | auditoria.view |

### Parámetros de consulta

| Parámetro     | Tipo   | Descripción                                         |
| ------------- | ------ | --------------------------------------------------- |
| `modulo`      | string | Filtrar por módulo (portal, tickets, rh)            |
| `tabla`       | string | Filtrar por tabla                                   |
| `accion`      | string | Filtrar por tipo de acción (INSERT, UPDATE, DELETE) |
| `usuario_id`  | number | Filtrar por usuario                                 |
| `fecha_desde` | date   | Filtrar desde fecha                                 |
| `fecha_hasta` | date   | Filtrar hasta fecha                                 |
| `pagina`      | number | Página (default: 1)                                 |
| `limite`      | number | Registros por página (default: 20)                  |

---

## Ejemplo de Registro

```json
{
  "id": 42,
  "usuario_id": 1,
  "modulo": "tickets",
  "tabla": "tickets",
  "registro_id": "5",
  "accion": "UPDATE",
  "valores_previos": {
    "estado": "abierto",
    "tecnico_asignado_id": null
  },
  "valores_nuevos": {
    "estado": "en_progreso",
    "tecnico_asignado_id": 3
  },
  "ip_origen": "192.168.1.100",
  "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
  "fecha": "2026-04-03T10:30:00.000Z"
}
```

---

## Cómo Integrar Auditoría en un Nuevo Módulo

### Paso 1: Importar el servicio

```javascript
const {
  registrarAccion,
} = require("../../auditoria/backend/services/auditoria.service");
```

### Paso 2: Llamar en cada operación CRUD

#### En un CREATE (INSERT):

```javascript
async crear(req, res) {
  try {
    const registro = await Modelo.crear(req.body);

    // Registrar en auditoría
    await registrarAccion(
      req,
      'nombre_modulo',      // nombre de tu módulo
      'nombre_tabla',       // tabla afectada
      registro.id.toString(),
      'INSERT',
      null,                 // no hay valores previos en un INSERT
      registro              // valores nuevos
    );

    res.status(201).json({ exito: true, datos: registro });
  } catch (error) {
    res.status(400).json({ exito: false, mensaje: error.message });
  }
}
```

#### En un UPDATE:

```javascript
async actualizar(req, res) {
  try {
    // 1. Obtener el registro actual (valores previos)
    const anterior = await Modelo.obtenerPorId(req.params.id);

    // 2. Actualizar
    const registro = await Modelo.actualizar(req.params.id, req.body);

    // 3. Registrar en auditoría
    await registrarAccion(
      req,
      'nombre_modulo',
      'nombre_tabla',
      registro.id.toString(),
      'UPDATE',
      anterior,             // valores antes del cambio
      registro              // valores después del cambio
    );

    res.json({ exito: true, datos: registro });
  } catch (error) {
    res.status(400).json({ exito: false, mensaje: error.message });
  }
}
```

#### En un DELETE:

```javascript
async eliminar(req, res) {
  try {
    // 1. Obtener el registro antes de eliminar
    const anterior = await Modelo.obtenerPorId(req.params.id);

    // 2. Eliminar
    await Modelo.eliminar(req.params.id);

    // 3. Registrar en auditoría
    await registrarAccion(
      req,
      'nombre_modulo',
      'nombre_tabla',
      anterior.id.toString(),
      'DELETE',
      anterior,             // valores eliminados
      null                  // no hay valores nuevos en un DELETE
    );

    res.json({ exito: true, mensaje: 'Eliminado exitosamente' });
  } catch (error) {
    res.status(500).json({ exito: false, mensaje: error.message });
  }
}
```

### Paso 3: Envolver en try/catch

Siempre envuelve la llamada a `registrarAccion` en su propio try/catch para que un fallo de auditoría no bloquee la operación principal:

```javascript
try {
  await registrarAccion(req, "modulo", "tabla", id, "INSERT", null, datos);
} catch (error) {
  console.error("Error al registrar auditoría:", error.message);
}
```

---

## Módulos Integrados

| Módulo      | Tablas Auditadas                                                             | Acciones               |
| ----------- | ---------------------------------------------------------------------------- | ---------------------- |
| **Portal**  | `roles`, `permisos`, `modulos`, `noticias`                                   | INSERT, UPDATE, DELETE |
| **Tickets** | `tickets`, `ticket_adjuntos`, `ticket_encuestas`                             | INSERT, UPDATE, DELETE |
| **RH**      | `empleados`, `expediente_documentos`, `permisos_ausencias`, `recibos_nomina` | INSERT, UPDATE, DELETE |

---

## Vista Frontend

La página de auditoría (`AuditoriaPage.jsx`) permite:

- **Filtrar por módulo**: portal, tickets, rh, etc.
- **Filtrar por tabla**: usuarios, noticias, tickets, etc.
- **Filtrar por acción**: INSERT, UPDATE, DELETE
- **Filtrar por fecha**: rango desde/hasta
- **Paginación**: 20 registros por página

Cada registro muestra:

- Usuario que realizó la acción
- Módulo y tabla afectada
- Tipo de acción con badge de color
- Valores previos y nuevos en formato JSON expandible
- Fecha y hora

---

## Ejecutar

```bash
# La auditoría se ejecuta como parte del backend del portal
cd modules/portal/backend && npm install && npm run dev

# Ver logs de auditoría en la base de datos
docker exec -it intranet_postgres_dev psql -U postgres -d intranet_dev \
  -c "SELECT modulo, tabla, accion, fecha FROM auditoria ORDER BY fecha DESC LIMIT 10;"
```

---

## Dependencias

- **portal**: Tabla `usuarios` para la FK `usuario_id`
- **Todos los módulos**: Cada módulo importa el servicio de auditoría
