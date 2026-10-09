// Configuración en tiempo de ejecución. En el contenedor de producción se REGENERA al arrancar
// (config/nginx/40-config-js.sh) con SUPABASE_ANON_KEY, SUPABASE_URL y MS365_LOGIN; en
// desarrollo queda vacía y se usan las variables VITE_* (ver lib/config.js).
window.__APP_CONFIG__ = window.__APP_CONFIG__ || {};
