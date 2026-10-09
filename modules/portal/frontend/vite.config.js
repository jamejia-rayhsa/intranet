import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://backend:4000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://backend:4000',
        changeOrigin: true,
      },
      // Supabase (mismo origen). Prefijo exacto '/auth/v1/' para no capturar la ruta SPA '/auth/callback'.
      // changeOrigin:false preserva Host (GoTrue arma redirects con API_EXTERNAL_URL).
      '^/auth/v1(/|$)': {
        target: 'http://supabase-auth:9999',
        changeOrigin: false,
        xfwd: true,
        rewrite: (p) => p.replace(/^\/auth\/v1/, '') || '/',
      },
      // Storage valida URLs firmadas con la ruta original: X-Forwarded-Prefix.
      '^/storage/v1(/|$)': {
        target: 'http://supabase-storage:5000',
        changeOrigin: false,
        xfwd: true,
        headers: { 'X-Forwarded-Prefix': '/storage/v1' },
        rewrite: (p) => p.replace(/^\/storage\/v1/, '') || '/',
      },
    },
  },
  root: '.',
  build: {
    outDir: 'dist',
  },
  resolve: {
    preserveSymlinks: true,
    alias: {
      recharts: path.resolve(__dirname, '../../../node_modules/recharts'),
    },
  },
  optimizeDeps: {
    include: ['recharts'],
  },
});
