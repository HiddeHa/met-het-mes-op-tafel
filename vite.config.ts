import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Cloudflare quick tunnels get a random *.trycloudflare.com hostname; without
    // this Vite refuses the proxied request and the guest sees "Blocked request".
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      '/ws': {
        target: 'ws://127.0.0.1:8787',
        ws: true,
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
    testTimeout: 15000,
  },
});
