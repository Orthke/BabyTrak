import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev, proxy /api to the Express server. Build output goes to client/dist,
// which the Express server serves in production.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // expose on LAN for phone/iPad testing during dev
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    outDir: 'dist',
  },
});
