import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5579,
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api/website': { target: 'http://localhost:8130', changeOrigin: true },
    },
  },
});
