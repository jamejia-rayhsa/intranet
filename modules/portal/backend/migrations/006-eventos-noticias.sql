-- Eventos en noticias (tipo = 'evento'): fecha y hora de inicio y lugar propios. Idempotente.
-- fecha_evento es TIMESTAMPTZ: guarda el instante absoluto. El navegador envía ISO con offset
-- (datetime-local -> new Date(valor).toISOString()), pg lo devuelve como Date (UTC) y el cliente
-- lo formatea en su zona; un TIMESTAMP sin zona dependería de la zona de la sesión.
-- Solo se usan para tipo = 'evento'; para el resto de tipos quedan en NULL (lo garantiza el controlador).
ALTER TABLE noticias
  ADD COLUMN IF NOT EXISTS fecha_evento TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lugar VARCHAR(255);
