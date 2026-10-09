-- Passwords de los roles internos de Supabase que usa este stack.
-- Basado en docker/volumes/db/roles.sql oficial, sin supabase_functions_admin
-- (lo crea webhooks.sql, que no usamos; si falta, el script oficial se detiene
-- y supabase_storage_admin se queda sin password).
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER pgbouncer WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';

-- La imagen crea auth.uid()/role()/email() como `postgres`; GoTrue (supabase_auth_admin)
-- las reemplaza en su primera migración y falla con "must be owner of function uid".
DO $$
DECLARE f regprocedure;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname IN ('uid', 'role', 'email')
  LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO supabase_auth_admin', f);
  END LOOP;
END $$;
