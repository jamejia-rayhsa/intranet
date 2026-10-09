// Configuración del cliente. Prioridad: config.js de arranque (contenedor) > variables VITE_* (desarrollo).
// Así UNA imagen sirve para todos los entornos: la anon key (pública, distinta por entorno) ya no se hornea.
const enEjecucion = (typeof window !== 'undefined' && window.__APP_CONFIG__) || {};

export const config = {
  // Vacío = mismo origen (nginx/Vite enrutan /auth/v1 y /storage/v1)
  supabaseUrl: enEjecucion.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || window.location.origin,
  supabaseAnonKey: enEjecucion.SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '',
  ms365Login: String(enEjecucion.MS365_LOGIN ?? import.meta.env.VITE_MS365_LOGIN ?? 'false') === 'true',
};
