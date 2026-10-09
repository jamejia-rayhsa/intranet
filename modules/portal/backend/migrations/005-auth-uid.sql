-- Vincula usuarios de la intranet con auth.users de Supabase Auth (GoTrue).
-- auth_uid = auth.users.id (claim "sub" del JWT). Idempotente.
-- Sin FK a auth.users: el esquema auth no existe al cargar init.sql en instalaciones previas.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS auth_uid UUID UNIQUE;
