import { defineConfig } from 'vite';
// A static site: every calculation runs in the browser (src/calculator), so there is no API to proxy.
export default defineConfig({
  server: { port: 4176, strictPort: true },
  preview: { port: 4176, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 900, rollupOptions: { input: { main: 'index.html', dial: 'dial.html', studio: 'studio.html' } } },
});
