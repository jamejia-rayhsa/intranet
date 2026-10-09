import { createClient } from '@supabase/supabase-js';

import { config } from './config';

if (!config.supabaseAnonKey) {
  console.error('Falta la anon key de Supabase (SUPABASE_ANON_KEY en el contenedor o VITE_SUPABASE_ANON_KEY en dev): el inicio de sesión no funcionará.');
}

export const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey || 'sin-anon-key', {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
