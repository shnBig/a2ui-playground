import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // playground → @a2ui/playground-server
      '/agent': {
        target: 'http://localhost:3100',
        changeOrigin: true,
      },
    },
  },
});
