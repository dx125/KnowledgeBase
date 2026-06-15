import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  // Load environment variables from the single project-root .env (one level up).
  // Only VITE_-prefixed vars are exposed to the client bundle.
  envDir: resolve(here, '..'),
});
