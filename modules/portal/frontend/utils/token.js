import { supabase } from '../lib/supabase';

export async function obtenerToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
