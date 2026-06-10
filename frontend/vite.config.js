import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// During development, requests to /api are proxied to the Express backend on
// port 3001. In production the frontend is built to static files and the API
// base URL is read from VITE_API_URL (see src/api/client.js).
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Split large libraries into their own chunks for faster initial load.
        manualChunks: {
          charts: ['recharts'],
          sheets: ['xlsx'],
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
