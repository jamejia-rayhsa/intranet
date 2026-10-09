import { solicitar } from '../utils/api';

// El login, el registro y la recuperación los gestiona Supabase Auth (lib/supabase.js).
export async function obtenerPerfil() {
  return solicitar('/auth/perfil');
}
