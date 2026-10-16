-- Un usuario, un empleado: UNIQUE (usuario_id) en empleados.
-- La identidad de quien aprueba o rechaza vacaciones (y el "empleado propio" de cada acceso) se resuelve
-- por empleados.usuario_id; con filas duplicadas el empleado "propio" sería arbitrario.
-- Idempotente y SIN romper datos existentes: si ya hay una restricción única sobre usuario_id no hace
-- nada; si hay usuarios con más de un empleado NO falla ni borra nada: avisa (WARNING con los ids) y la
-- restricción queda sin crear hasta que RH corrija los duplicados y se vuelva a ejecutar el db-init.
-- Replicado en config/database/init.sql y cableado en docker-compose.supabase.yml (supabase-db-init).
DO $$
DECLARE
  duplicados TEXT;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
    WHERE i.indrelid = 'empleados'::regclass
      AND i.indisunique
      AND i.indnatts = 1
      AND i.indpred IS NULL
      AND a.attname = 'usuario_id'
  ) THEN
    RETURN;
  END IF;

  SELECT string_agg(usuario_id::text || ' (empleados ' || ids || ')', ', ' ORDER BY usuario_id)
    INTO duplicados
  FROM (
    SELECT usuario_id, string_agg(id::text, ',' ORDER BY id) AS ids
    FROM empleados
    WHERE usuario_id IS NOT NULL
    GROUP BY usuario_id
    HAVING COUNT(*) > 1
  ) d;

  IF duplicados IS NOT NULL THEN
    RAISE WARNING 'empleados.usuario_id NO es unico todavia: hay usuarios con mas de un empleado: %. Corrige los duplicados y vuelve a ejecutar esta migracion.', duplicados;
  ELSE
    ALTER TABLE empleados ADD CONSTRAINT empleados_usuario_id_unique UNIQUE (usuario_id);
  END IF;
END $$;
