import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// BASE_PATH is set for GitHub Pages (/staysuite/); native builds and local dev use '/'.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'StaySuite — Property Manager',
        short_name: 'StaySuite',
        description: 'Run your cabins, homestays and boutique stays from one place.',
        theme_color: '#0b1210',
        background_color: '#0b1210',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ['recharts'],
          pdf: ['jspdf', 'jspdf-autotable'],
          xlsx: ['xlsx'],
        },
      },
    },
  },
});
