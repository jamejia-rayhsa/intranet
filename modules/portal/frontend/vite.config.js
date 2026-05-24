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
