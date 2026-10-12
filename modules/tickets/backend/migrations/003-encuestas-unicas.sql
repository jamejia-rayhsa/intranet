-- Encuestas de satisfaccion: una por ticket, obligatoria la calificacion y borrado en cascada.
-- init.sql las creaba sin UNIQUE ni ON DELETE CASCADE (dos envios simultaneos duplicaban la
-- encuesta y un ticket con encuesta no se podia eliminar). Idempotente.
DELETE FROM ticket_encuestas a
  USING ticket_encuestas b
  WHERE a.ticket_id = b.ticket_id AND a.id > b.id;

DELETE FROM ticket_encuestas WHERE ticket_id IS NULL OR calificacion IS NULL;

ALTER TABLE ticket_encuestas
  ALTER COLUMN ticket_id SET NOT NULL,
  ALTER COLUMN calificacion SET NOT NULL;

ALTER TABLE ticket_encuestas DROP CONSTRAINT IF EXISTS ticket_encuestas_ticket_id_fkey;
ALTER TABLE ticket_encuestas
  ADD CONSTRAINT ticket_encuestas_ticket_id_fkey
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ticket_encuestas_ticket ON ticket_encuestas(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_encuestas_fecha ON ticket_encuestas(fecha_respuesta);
