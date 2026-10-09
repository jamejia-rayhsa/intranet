-- Comentarios de tickets (modelo ticketComentario.model.js).
-- La tabla se usaba en código pero no existía en ninguna migración ni en init.sql.
CREATE TABLE IF NOT EXISTS ticket_comentarios (
  id SERIAL PRIMARY KEY,
  ticket_id INT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  usuario_id INT REFERENCES usuarios(id),
  comentario TEXT NOT NULL,
  fecha_creacion TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_comentarios_ticket ON ticket_comentarios(ticket_id);
