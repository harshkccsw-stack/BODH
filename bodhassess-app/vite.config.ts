import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '');
  return {
    base: env.VITE_BASE_PATH ?? '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': __dirname,
      },
    },
    server: {
      port: 3000,
      host: true,
    },
    preview: {
      port: 3000,
      host: true,
    },
    build: {
      outDir: 'dist',
      sourcemap: mode !== 'production',
      chunkSizeWarningLimit: 2000,
    },
  };
});
