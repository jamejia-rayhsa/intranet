import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL || window.location.origin;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!anonKey) {
  console.error('Falta VITE_SUPABASE_ANON_KEY: el inicio de sesión no funcionará.');
}

export const supabase = createClient(url, anonKey || 'sin-anon-key', {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
