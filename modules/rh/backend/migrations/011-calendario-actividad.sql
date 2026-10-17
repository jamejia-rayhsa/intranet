-- Nuevo tipo de fecha del calendario laboral: 'actividad' (Día Actividad Empresa).
-- Bloquea las vacaciones de todos en esa fecha (si cae en día hábil). Amplía el CHECK de
-- calendario_laboral.tipo a: oficial, otorgado, evento, actividad.
-- Idempotente y sin tocar datos: la restricción actual de tipo (se busca por definición, no por nombre,
-- porque el CHECK en línea de la 009 recibe un nombre automático) se elimina y se vuelve a crear con el
-- nombre fijo calendario_laboral_tipo_check; si ya admite 'actividad' no hace nada.
-- Depende de: 009-calendario-laboral.sql.
-- Replicado en config/database/init.sql y cableado en docker-compose.supabase.yml (supabase-db-init).
DO $$
DECLARE
  restriccion RECORD;
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'calendario_laboral'::regclass
      AND contype = 'c'
      AND conname = 'calendario_laboral_tipo_check'
      AND pg_get_constraintdef(oid) LIKE '%actividad%'
  ) THEN
    RETURN;
  END IF;

  FOR restriccion IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'calendario_laboral'::regclass
      AND contype = 'c'
      AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
                          WHERE attrelid = 'calendario_laboral'::regclass AND attname = 'tipo')]::smallint[]
  LOOP
    EXECUTE format('ALTER TABLE calendario_laboral DROP CONSTRAINT %I', restriccion.conname);
  END LOOP;

  ALTER TABLE calendario_laboral
    ADD CONSTRAINT calendario_laboral_tipo_check
    CHECK (tipo IN ('oficial', 'otorgado', 'evento', 'actividad'));
END $$;
