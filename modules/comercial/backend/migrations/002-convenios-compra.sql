-- modules/comercial/backend/migrations/002-convenios-compra.sql
-- Fase 1 de "Convenios de compra": modelo de datos + autorización base, sin MBA3 ni carga de CSV.

-- Cabecera del convenio. cliente/vendedor/producto son snapshot capturado a mano en esta fase
-- (Fase 2 los autocompletará desde MBA3): sin FK a catálogos propios, solo texto libre.
CREATE TABLE IF NOT EXISTS comercial_convenios (
  id SERIAL PRIMARY KEY,
  folio_origen TEXT,
  cliente_codigo TEXT,
  cliente_nombre TEXT NOT NULL,
  vendedor_codigo TEXT,
  vendedor_nombre TEXT NOT NULL,
  fecha_inicio DATE NOT NULL,
  vigente_hasta DATE,
  estatus TEXT NOT NULL DEFAULT 'pendiente_autorizacion'
    CHECK (estatus IN ('pendiente_autorizacion', 'autorizado', 'rechazado', 'cancelado')),
  autoriza_id INT REFERENCES usuarios(id),
  autoriza_nombre TEXT,
  fecha_autoriza TIMESTAMPTZ,
  motivo_rechazo TEXT,
  creado_por_id INT NOT NULL REFERENCES usuarios(id),
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT now(),
  observaciones TEXT,
  CONSTRAINT chk_convenio_vigencia CHECK (vigente_hasta IS NULL OR vigente_hasta >= fecha_inicio)
);

CREATE INDEX IF NOT EXISTS idx_comercial_convenios_estatus ON comercial_convenios(estatus);
CREATE INDEX IF NOT EXISTS idx_comercial_convenios_cliente ON comercial_convenios(cliente_codigo);
CREATE INDEX IF NOT EXISTS idx_comercial_convenios_vendedor ON comercial_convenios(vendedor_codigo);
CREATE INDEX IF NOT EXISTS idx_comercial_convenios_creado_por ON comercial_convenios(creado_por_id);

-- Líneas de producto (1 o más por convenio). producto_* también es snapshot (Fase 2 lo
-- autocompletará); empaque/unidad_medida = mínimo de paquete negociado con el proveedor.
CREATE TABLE IF NOT EXISTS comercial_convenio_productos (
  id SERIAL PRIMARY KEY,
  convenio_id INT NOT NULL REFERENCES comercial_convenios(id) ON DELETE CASCADE,
  producto_codigo TEXT,
  producto_descripcion TEXT NOT NULL,
  empaque NUMERIC,
  unidad_medida TEXT,
  cantidad_periodica NUMERIC NOT NULL,
  periodo TEXT NOT NULL,
  precio_compra NUMERIC,
  precio_venta NUMERIC,
  factor NUMERIC
);

CREATE INDEX IF NOT EXISTS idx_comercial_convenio_productos_convenio ON comercial_convenio_productos(convenio_id);

-- Lista administrable de personas que pueden autorizar convenios (no es un rol de RBAC).
CREATE TABLE IF NOT EXISTS comercial_autorizadores (
  usuario_id INT PRIMARY KEY REFERENCES usuarios(id),
  activo BOOLEAN NOT NULL DEFAULT true,
  agregado_por_id INT NOT NULL REFERENCES usuarios(id),
  fecha_agregado TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Opción de módulo "Convenios" dentro de comercial
INSERT INTO modulo_opciones (modulo_id, nombre, descripcion, orden)
SELECT m.id, 'Convenios', 'Convenios de compra a clientes específicos', 2
FROM modulos m
WHERE m.nombre = 'comercial'
ON CONFLICT (modulo_id, nombre) DO NOTHING;

-- Permisos: super_admin, portal_admin y comercial_admin (consulta + edición)
INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT r.id, mo.id, t.tipo
FROM roles r
JOIN modulos m ON m.nombre = 'comercial'
JOIN modulo_opciones mo ON mo.modulo_id = m.id AND mo.nombre = 'Convenios'
CROSS JOIN (VALUES ('consulta'), ('edicion')) AS t(tipo)
WHERE r.nombre IN ('super_admin', 'portal_admin', 'comercial_admin')
ON CONFLICT DO NOTHING;
