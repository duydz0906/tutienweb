import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  envDir: new URL('../../', import.meta.url).pathname,
  build: {
    // The reusable Three.js vendor chunk is ~743 KB minified / ~193 KB gzip.
    chunkSizeWarningLimit: 800,
    rollupOptions: { output: { manualChunks(id) {
      if (id.includes('/node_modules/three/')) return 'three';
      if (id.includes('/node_modules/@react-three/fiber/')) return 'react-three';
      if (id.includes('/node_modules/@react-three/postprocessing/') || id.includes('/node_modules/postprocessing/')) return 'postprocessing';
      if (id.includes('/node_modules/@firebase/') || id.includes('/node_modules/firebase/')) return 'firebase-auth';
    } } },
  },
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3001', changeOrigin: true },
      '/socket.io': { target: 'http://127.0.0.1:3001', ws: true, changeOrigin: true },
    },
  },
});
