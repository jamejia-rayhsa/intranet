# SKILL.portal.md
name: portal
description: Implementación del módulo central de la intranet (autenticación, módulos, permisos, portal de noticias).

## Instrucciones

1. **Modelos y tablas PostgreSQL**

```sql
CREATE TABLE usuarios (
  id SERIAL PRIMARY KEY,
  correo VARCHAR(255) UNIQUE NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  apellido VARCHAR(100),
  auth_tipo VARCHAR(20) NOT NULL DEFAULT 'local', -- 'local', 'ms365'
  external_id VARCHAR(100), -- ID de Azure AD
  hash_password TEXT,
  activo BOOLEAN DEFAULT true,
  fecha_creacion TIMESTAMP DEFAULT NOW()
);

CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL
);

CREATE TABLE permisos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL
);

CREATE TABLE rol_permiso (
  rol_id INT REFERENCES roles(id),
  permiso_id INT REFERENCES permisos(id),
  PRIMARY KEY (rol_id, permiso_id)
);

CREATE TABLE usuario_rol (
  usuario_id INT REFERENCES usuarios(id),
  rol_id INT REFERENCES roles(id),
  PRIMARY KEY (usuario_id, rol_id)
);

CREATE TABLE modulos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  path_reactivo VARCHAR(150),
  descripcion TEXT,
  activo BOOLEAN DEFAULT true
);

CREATE TABLE noticias (
  id SERIAL PRIMARY KEY,
  titulo VARCHAR(255) NOT NULL,
  subtitulo TEXT,
  contenido TEXT,
  tipo VARCHAR(30), -- 'noticia', 'comunicado', 'oferta_empleo'
  fecha_publicacion DATE,
  publicada BOOLEAN DEFAULT false,
  autor_id INT REFERENCES usuarios(id),
  fecha_creacion TIMESTAMP DEFAULT NOW(),
  fecha_actualizacion TIMESTAMP
);
```

2. **Autenticación**

- Implementar `AuthController`:
  - `POST /login-local`.  
  - `POST /login-ms365` (redirect a Azure AD y callback).
  - `POST /refresh` para renovar JWT.
- Separar `auth.middleware.js` con:
  - `authenticateJWT`, `authorize(permisos)`.
- Usar `.env` para:
  - `JWT_SECRET`, `JWT_EXPIRES_IN`, `AZURE_AD_CLIENT_ID`, `AZURE_AD_TENANT_ID`, `AZURE_AD_REDIRECT_URI`.

3. **Módulos y permisos**

- Crear `ModuloController`:
  - `GET /modulos`, `GET /modulos/:id`, `POST /modulos`, `PUT /modulos/:id`, `DELETE /modulos/:id`.
  - Solo usuarios con `portal.admin` pueden modificar.
- Crear `PermisoController`:
  - CRUD de roles y permisos, con asignación masiva.

4. **Portal de noticias**

- `NoticiaController`:
  - CRUD de noticias.
  - Validar que solo `portal.admin` o `rh.admin` puedan publicar.
- Frontend:
  - `PortalHome.jsx` con grid de noticias y secciones por tipo.
  - `NewsEditorModal.jsx` para crear/editar noticias.

5. **Auditoría**

- Usar `AuditoriaService` de SKILL.auditoria:
  - Registrar cada cambio en `usuarios`, `roles`, `permisos`, `modulos`, `noticias`.
  - Capturar `valores_previos` y `valores_nuevos` en JSON.

6. **Tests**

- Tests unitarios:
  - Login correcto e incorrecto.
  - Validación de permisos.
- Tests de integración:
  - Crear noticias, cambiar estado de publicación.