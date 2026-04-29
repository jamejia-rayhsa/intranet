# SKILL.comercial.md
name: comercial
description: Módulo comercial para gestión de cotizaciones y listas de precios de proveedores.

## Instrucciones

1. **Modelos PostgreSQL**

```sql
CREATE TABLE proveedores (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(150) NOT NULL,
  contacto VARCHAR(100),
  telefono VARCHAR(50)
);

CREATE TABLE productos (
  id SERIAL PRIMARY KEY,
  proveedor_id INT REFERENCES proveedores(id),
  codigo_proveedor VARCHAR(100),
  descripcion VARCHAR(255),
  categoria VARCHAR(50)
);

CREATE TABLE listas_precios (
  id SERIAL PRIMARY KEY,
  proveedor_id INT REFERENCES proveedores(id),
  fecha_inicio DATE,
  fecha_fin DATE,
  activa BOOLEAN DEFAULT false
);

CREATE TABLE lista_precios_detalle (
  id SERIAL PRIMARY KEY,
  lista_id INT REFERENCES listas_precios(id),
  producto_id INT REFERENCES productos(id),
  precio_unitario DECIMAL(10,2),
  moneda VARCHAR(3) -- 'MXN', 'USD'
);

CREATE TABLE cotizaciones (
  id SERIAL PRIMARY KEY,
  numero_cotizacion VARCHAR(50),
  cliente_nombre VARCHAR(255),
  fecha DATE,
  vendedor_id INT REFERENCES usuarios(id),
  estatus VARCHAR(20) -- 'borrador', 'enviada', 'aceptada', 'rechazada'
);

CREATE TABLE cotizacion_detalle (
  id SERIAL PRIMARY KEY,
  cotizacion_id INT REFERENCES cotizaciones(id),
  producto_id INT REFERENCES productos(id),
  cantidad INT,
  precio_unitario DECIMAL(10,2),
  importe DECIMAL(12,2)
);
```

2. **Backend (Express)**

- `PrecioService`:
  - `actualizarDesdeExcel(listaId, csv/Excel)`.
  - `obtenerPrecioActual(productoId)`.
- `CotizacionController`:
  - `POST /cotizaciones` (generar cotización).
  - `GET /cotizaciones/:id/export-pdf` (exportación a PDF).

3. **Frontend (React)**

- `ListaPreciosUploader.jsx`:
  - Subir archivo CSV/Excel.
- `CotizacionForm.jsx`:
  - Seleccionar lista de precios, productos y cantidades.

4. **Auditoría**

- Registrar:
  - `INSERT/UPDATE` en `listas_precios` y `lista_precios_detalle`.
  - `INSERT/UPDATE` en `cotizaciones` y `cotizacion_detalle`.

5. **Tests**

- Test unitarios:
  - Validación de precios por producto.
- Test de integración:
  - Carga de CSV y generación de cotización.