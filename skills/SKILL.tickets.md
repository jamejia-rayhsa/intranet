# SKILL.tickets.md
name: tickets
description: Implementación del módulo de tickets de soporte TI.

## Instrucciones

1. **Modelos PostgreSQL**

```sql
CREATE TABLE tickets (
  id SERIAL PRIMARY KEY,
  usuario_id INT REFERENCES usuarios(id),
  titulo VARCHAR(255) NOT NULL,
  descripcion TEXT,
  nivel_atencion VARCHAR(20) NOT NULL, -- 'bajo', 'medio', 'alto', 'critico'
  estado VARCHAR(20) NOT NULL DEFAULT 'abierto', -- 'abierto', 'en_progreso', 'resuelto', 'cerrado'
  categoria VARCHAR(50),
  fecha_creacion TIMESTAMP DEFAULT NOW(),
  fecha_cierre TIMESTAMP,
  tecnico_asignado_id INT REFERENCES usuarios(id)
);

CREATE TABLE ticket_adjuntos (
  id SERIAL PRIMARY KEY,
  ticket_id INT REFERENCES tickets(id),
  nombre_archivo VARCHAR(255),
  tipo_mime VARCHAR(100),
  ruta_archivo VARCHAR(500)
);

CREATE TABLE ticket_encuestas (
  id SERIAL PRIMARY KEY,
  ticket_id INT REFERENCES tickets(id),
  calificacion INT NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
  comentarios TEXT,
  fecha TIMESTAMP DEFAULT NOW()
);
```

2. **Backend (Express)**

- Crear:
  - `TicketController` con rutas: `GET /tickets`, `POST /tickets`, `PUT /tickets/:id`, `GET /tickets/:id`.
  - `AdjuntoController` con `POST /tickets/:id/adjuntos` y `GET /tickets/:id/adjuntos`.
  - `EncuestaController` con `POST /tickets/:id/encuesta`.
- Validar:
  - Niveles y estados permitidos.
  - Solo técnicos pueden cambiar estado a `resuelto`/`cerrado`.
- Servicio de notificaciones:
  - `NotificacionService` que envíe email en cada cambio importante de estado.

3. **Frontend (React)**

- `TicketForm`:
  - Seleccionar nivel, categoría.
  - Upload de adjuntos.
- `TicketList`:
  - Filtrar por estado y nivel.
- `TicketDetail`:
  - Mostrar historial de estados y comentarios.
- `SatisfactionSurvey`:
  - Formulario de 1 a 5 y comentarios.

4. **Auditoría**

- Usar SKILL.auditoria para registrar:
  - `INSERT` en `tickets`.
  - `UPDATE` en estados o técnico asignado.
  - `INSERT/DELETE` en `ticket_adjuntos`.

5. **Tests**

- Tests unitarios:
  - Validar permisos de cambio de estado.
- Tests de integración:
  - Subir un adjunto y verificar que se guarda correctamente.