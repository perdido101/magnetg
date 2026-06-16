import { defineConfig } from 'vite';

// MAGNET — Canvas2D, no framework. Keep the bundle lean.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    sourcemap: true,
  },
  server: {
    host: true,
    port: 5173,
  },
});
