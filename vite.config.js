import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: './',
  publicDir: 'public',
  assetsInclude: ['**/*.fbx'],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        simulator: resolve(__dirname, 'simulator.html')
      }
    }
  },
  server: {
    port: 5173,
    host: true
  }
});
