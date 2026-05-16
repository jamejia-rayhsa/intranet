-- Activar módulo comercial
UPDATE modulos SET activo = true WHERE nombre = 'comercial';

-- Crear tabla solicitudes_credito
CREATE TABLE IF NOT EXISTS solicitudes_credito (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_solicitud VARCHAR(20) UNIQUE,
  razon_social VARCHAR(255) NOT NULL,
  rfc VARCHAR(20) NOT NULL,
  tipo_cliente VARCHAR(20) NOT NULL CHECK (tipo_cliente IN ('INDUSTRIA', 'DISTRIBUCION')),
  sucursal VARCHAR(100),
  regimen_fiscal VARCHAR(50),
  moneda VARCHAR(5) DEFAULT 'MN',
  giro_negocio VARCHAR(100),
  metodo_pago VARCHAR(50),
  uso_cfdi VARCHAR(20),
  forma_pago JSONB DEFAULT '[]',
  domicilio_fiscal JSONB DEFAULT '{}',
  domicilio_entrega JSONB DEFAULT '{}',
  datos_bancarios_nacionales JSONB DEFAULT '[]',
  datos_bancarios_extranjeros JSONB DEFAULT '[]',
  condiciones_comerciales JSONB DEFAULT '{}',
  contactos JSONB DEFAULT '[]',
  referencias_comerciales JSONB DEFAULT '[]',
  datos_proporcionados_nombre VARCHAR(255),
  datos_proporcionados_puesto VARCHAR(255),
  estado VARCHAR(30) DEFAULT 'borrador' CHECK (estado IN ('borrador','guardada','enviada_mba3','aprobada','rechazada')),
  sincronizado_mba3 BOOLEAN DEFAULT false,
  referencia_mba3 VARCHAR(100),
  usuario_creador_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_ultimo_cambio_id INT REFERENCES usuarios(id) ON DELETE SET NULL,
  fecha_creacion TIMESTAMP DEFAULT NOW(),
  fecha_ultimo_cambio TIMESTAMP DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_solicitudes_credito_rfc ON solicitudes_credito(rfc);
CREATE INDEX IF NOT EXISTS idx_solicitudes_credito_estado ON solicitudes_credito(estado);
CREATE INDEX IF NOT EXISTS idx_solicitudes_credito_usuario ON solicitudes_credito(usuario_creador_id);

-- Función para auto-generar numero_solicitud
CREATE OR REPLACE FUNCTION generar_numero_solicitud()
RETURNS TRIGGER AS $$
DECLARE
  año INT := EXTRACT(YEAR FROM NOW());
  secuencia INT;
BEGIN
  SELECT COUNT(*) + 1 INTO secuencia
  FROM solicitudes_credito
  WHERE EXTRACT(YEAR FROM fecha_creacion) = año;
  NEW.numero_solicitud := 'SC-' || año || '-' || LPAD(secuencia::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_numero_solicitud
BEFORE INSERT ON solicitudes_credito
FOR EACH ROW
WHEN (NEW.numero_solicitud IS NULL)
EXECUTE FUNCTION generar_numero_solicitud();

-- Opciones de módulo comercial
INSERT INTO modulo_opciones (modulo_id, nombre, descripcion, orden)
SELECT m.id, 'Solicitudes de Crédito', 'Captura y gestión de solicitudes de crédito a clientes', 1
FROM modulos m
WHERE m.nombre = 'comercial'
ON CONFLICT (modulo_id, nombre) DO NOTHING;

-- Permisos para super_admin y portal_admin
INSERT INTO rol_opcion_permisos (rol_id, opcion_id, tipo)
SELECT r.id, mo.id, t.tipo
FROM roles r
JOIN modulos m ON m.nombre = 'comercial'
JOIN modulo_opciones mo ON mo.modulo_id = m.id AND mo.nombre = 'Solicitudes de Crédito'
CROSS JOIN (VALUES ('consulta'), ('edicion')) AS t(tipo)
WHERE r.nombre IN ('super_admin', 'portal_admin')
ON CONFLICT DO NOTHING;
