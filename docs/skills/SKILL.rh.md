# SKILL.rh.md
name: rh
description: Módulo de Recursos Humanos para la intranet corporativa (empleados, expedientes, permisos de ausencia, vacaciones, recibos de nómina y gestión de noticias/comunicados).

## Objetivo
Definir el modelo de datos, la lógica de negocio y la estructura de código para el módulo de Recursos Humanos (RH), que se integrará con el resto de la intranet (autenticación, módulos, permisos y auditoría).

## 1. Modelos de base de datos (PostgreSQL)

```sql
-- Empleados
CREATE TABLE empleados (
  id SERIAL PRIMARY KEY,
  usuario_id INT REFERENCES usuarios(id),
  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100) NOT NULL,
  fecha_nacimiento DATE,
  curp VARCHAR(20),
  rfc VARCHAR(20),
  puesto VARCHAR(100),
  departamento VARCHAR(100),
  fecha_ingreso DATE,
  jefe_inmediato_id INT REFERENCES empleados(id),
  estatus VARCHAR(20) NOT NULL DEFAULT 'activo', -- 'activo', 'baja', 'suspendido'
  fecha_baja DATE,
  motivo_baja TEXT,
  fecha_creacion TIMESTAMP DEFAULT NOW(),
  fecha_actualizacion TIMESTAMP
);

-- Expediente: documentos de empleados
CREATE TABLE expediente_documentos (
  id SERIAL PRIMARY KEY,
  empleado_id INT REFERENCES empleados(id),
  tipo_documento VARCHAR(50) NOT NULL, -- 'acta_nacimiento', 'comprobante_domicilio', 'identificacion', 'cef', etc.
  nombre_archivo VARCHAR(255) NOT NULL,
  ruta_archivo VARCHAR(500) NOT NULL, -- ruta relativa al storage (ej. /uploads/expediente/...)
  fecha_carga TIMESTAMP DEFAULT NOW(),
  descripcion TEXT
);

-- Permisos de ausencia y vacaciones
CREATE TABLE permisos_ausencias (
  id SERIAL PRIMARY KEY,
  empleado_id INT REFERENCES empleados(id),
  tipo VARCHAR(30) NOT NULL, -- 'vacaciones', 'incapacidad', 'asunto_personal', 'otro'
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE NOT NULL,
  motivo TEXT,
  estatus VARCHAR(20) NOT NULL DEFAULT 'pendiente', -- 'pendiente', 'aprobado', 'rechazado'
  aprobado_por_id INT REFERENCES empleados(id),
  fecha_aprobacion TIMESTAMP,
  fecha_creacion TIMESTAMP DEFAULT NOW(),
  fecha_actualizacion TIMESTAMP
);

-- Nómina (metadatos/recibos; archivos se guardan en FS)
CREATE TABLE recibos_nomina (
  id SERIAL PRIMARY KEY,
  empleado_id INT REFERENCES empleados(id),
  periodo VARCHAR(20) NOT NULL, -- '03-2026', '04-2026', etc.
  fecha_pago DATE,
  importe_total DECIMAL(10,2),
  ruta_archivo VARCHAR(500), -- PDF o archivo de nómina
  descripcion TEXT,
  fecha_creacion TIMESTAMP DEFAULT NOW(),
  creado_por_id INT REFERENCES usuarios(id)
);
```

## 2. Backend (Node/Express + Sequelize)

1. **Controladores y servicios**

- `EmpleadoController`:
  - `GET /empleados` (listar, con filtros).
  - `GET /empleados/:id` (detalle).
  - `POST /empleados` (crear empleado).
  - `PUT /empleados/:id` (actualizar datos corporativos/personales).
  - `DELETE /empleados/:id` (marcar como baja o eliminar según política).

- `ExpedienteController`:
  - `GET /empleados/:id/expediente` (lista de documentos).
  - `POST /empleados/:id/expediente` (subir documento).
  - `DELETE /expediente/:id` (eliminar/retirar documento).

- `PermisosController`:
  - `GET /permisos` (lista por empleado o por jefe).
  - `POST /permisos` (solicitud de ausencia/vacaciones).
  - `PUT /permisos/:id` (jefe aprueba/rechaza).

- `ReciboNominaController`:
  - `GET /recibos` (recibos del empleado o por periodo).
  - `GET /recibos/:id/descargar` (descargar archivo).

2. **Validaciones y permisos**

- Validar:
  - Fechas de vacaciones/ausencias (no se traslapen).
  - Jerarquía de aprobación (jefe inmediato aproba permisos).
- Roles recomendados:
  - `rh.admin` → todo sobre empleados, permisos y recibos.
  - `empleado.normal` → ve su perfil, solicita permisos, ve recibos.

## 3. Frontend (React)

1. **Estructura de módulo en frontend**

```bash
./modules/rh/frontend/
├── components/
│   ├── EmpleadoProfileCard.jsx      -- resumen del empleado
│   ├── ExpedienteUpload.jsx         -- carga de documentos
│   ├── PermisosForm.jsx             -- solicitud de ausencia/vacaciones
│   ├── PermisosList.jsx             -- listado de permisos
│   └── RecibosNominaList.jsx        -- listado de recibos
├── pages/
│   ├── EmpleadoPage.jsx             -- panel de un solo empleado
│   ├── RHAdminPage.jsx              -- panel de RH para aprobaciones
│   └── PerfilPage.jsx               -- perfil individual del empleado
└── routes/
    └── rh.routes.js                 -- rutas: /rh/empleados/:id, /rh/permisos, etc.
```

2. **Flujo de usuario típico**

- Empleado:
  - Ve su perfil, documentos del expediente, recibos de nómina.
  - Llena formulario de permiso/vacación.
- RH:
  - Administra todos los empleados y permisos.
  - Gestiona el portal de noticias/comunicados (integración con `portal` y `SKILL.portal`).

## 4. Integración con el módulo de auditoría

- Usar `SKILL.auditoria` para registrar:
  - Cambios en `empleados` (alta, modificación, baja).
  - Carga/eliminación de documentos del expediente.
  - Cambios de estatus en `permisos_ausencias`.
- En el backend, usar `AuditoriaService.registrarAccion(...)` en:
  - `EmpleadoController` (update/delete).
  - `ExpedienteController` (create/delete).
  - `PermisosController` (update estatus).

## 5. Relación con otros módulos

- Autenticación:
  - Cada `empleado` está ligado a un `usuario_id` en `empleados.usuario_id`.
- Portal / noticias:
  - El módulo `portal` administra noticias y comunicados; `rh` los usa para anuncios de RH y ofertas de empleo.
- Permisos:
  - Usar `SKILL.portal` y sus tablas de `roles/permisos` para definir quién puede ver/editar datos de RH.

## 6. Tests recomendados

1. **Unitarios (Jest/Mocha)**

- Validar que un empleado no pueda aprobar sus propios permisos.
- Verificar que `tipo_documento` y `estatus` solo acepten valores permitidos.

2. **Integración**

- Crear un empleado, subir un documento al expediente y verificar que:
  - Se guarda el registro en `expediente_documentos`.
  - Se genera un evento en `auditoria` si está activo.
- Probar flujo de permiso: `pendiente` → `aprobado` o `rechazado`.

## 7. Instrucciones de uso en OpenCode

- Este skill debe usarse junto con:
  - `SKILL.portal` (para autenticación y roles).
  - `SKILL.auditoria` (para registrar cambios en empleados y documentos).
- Cuando el agente active `rh`, debe:
  - Generar `./modules/rh/backend/` y `./modules/rh/frontend/` siguiendo esta estructura.
  - Escribir todo el código en español (nombres de variables, comentarios, mensajes de error).