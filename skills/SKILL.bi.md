# SKILL.bi.md
name: bi
description: Implementación del módulo de BI con dashboards en Streamlit conectados a MSSQL.

## Instrucciones

1. **Modelos PostgreSQL**

```sql
CREATE TABLE dashboards (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  url_relativa VARCHAR(200), -- ruta relativa a Streamlit (ej. /dashboards/ventas)
  activo BOOLEAN DEFAULT true
);

CREATE TABLE grupos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL
);

CREATE TABLE dashboard_grupos (
  dashboard_id INT REFERENCES dashboards(id),
  grupo_id INT REFERENCES grupos(id),
  PRIMARY KEY (dashboard_id, grupo_id)
);

CREATE TABLE grupo_usuarios (
  grupo_id INT REFERENCES grupos(id),
  usuario_id INT REFERENCES usuarios(id),
  PRIMARY KEY (grupo_id, usuario_id)
);
```

2. **Backend (PERN)**

- `DashboardController`:
  - `GET /dashboards` (filtrados por grupos del usuario).
  - `GET /dashboards/:id` (detalles de un dashboard).
- `GroupController`:
  - CRUD de grupos y asignación de usuarios/dashboards.

3. **Streamlit (Python)**

- Ejemplo de `app.py`:

```python
import streamlit as st
import pymssql

conn = pymssql.connect(
    server=os.getenv("MSSQL_HOST"),
    port=os.getenv("MSSQL_PORT"),
    user=os.getenv("MSSQL_USER"),
    password=os.getenv("MSSQL_PASSWORD"),
    database=os.getenv("MSSQL_DB")
)

st.title("Dashboard de Ventas")
df = pd.read_sql("SELECT * FROM ventas", conn)
st.dataframe(df)
```

- Cada dashboard en `./bi-streamlit/<nombre>/app.py` con su propia lógica de consulta.

4. **Frontend (React)**

- `BiDashboardList.jsx`:
  - Lista de dashboards filtrados por permisos.
  - Botón “Abrir” que redirige al usuario a la URL de Streamlit.
- Validar con una llamada a `/api/bi/dashboards` los dashboards accesibles.

5. **Auditoría**

- Registrar cada acceso a un dashboard usando `AuditoriaService`:
  - `modulo = "bi"`, `tabla = "dashboards"`, `accion = "VIEW"`.