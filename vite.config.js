import { defineConfig } from 'vite';

export default defineConfig({
  root: 'www',
  server: {
    port: 3100,
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
