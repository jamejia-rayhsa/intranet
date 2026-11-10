// Vite del portal real con supabase simulado (supabase-stub.js) y el API de verificación como proxy. Uso:
//   node node_modules/vite/bin/vite.js --config scripts/cuentas/vite.config.mjs
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, "../..");
export default defineConfig({
  root: path.join(raiz, "modules/portal/frontend"),
  configFile: false,
  cacheDir: path.join(process.env.VERIF_SALIDA || path.join(os.tmpdir(), "cuentas-verif"), "vite-cache"),
  plugins: [react()],
  define: { "import.meta.env.VITE_API_URL": JSON.stringify("/api") },
  server: {
    port: Number(process.env.VERIF_WEB_PORT || 5197), host: "127.0.0.1", strictPort: true, fs: { strict: false },
    proxy: { "/api": { target: `http://127.0.0.1:${process.env.VERIF_API_PORT || 4660}`, changeOrigin: true } },
  },
  resolve: {
    preserveSymlinks: true,
    alias: [
      { find: /^(\.\.\/)+lib\/supabase$/, replacement: path.join(aqui, "supabase-stub.js") },
      { find: "recharts", replacement: path.join(raiz, "node_modules/recharts") },
    ],
  },
});
