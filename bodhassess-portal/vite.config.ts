import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Standalone respondent portal. `@` resolves to ./src (note: unlike the
// admin app, where `@` points at the repo root). On a dedicated subdomain
// VITE_BASE_PATH stays "/"; it only changes if the app is ever sub-mounted.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      // 3002 so it can run next to the admin app (3000) in local dev.
      port: 3002,
      host: true,
    },
    preview: {
      port: 3002,
      host: true,
    },
    build: {
      outDir: 'dist',
      sourcemap: mode !== 'production',
      chunkSizeWarningLimit: 2000,
    },
  };
});
