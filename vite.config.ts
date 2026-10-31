/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH viene impostato dalla GitHub Action (es. "/tako-maker/").
// In locale resta "/".
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Tako Maker',
        short_name: 'Tako Maker',
        description:
          'Crea e adatta modelli 3D stampabili in base alla tua stampante e ai tuoi filamenti.',
        lang: 'it',
        theme_color: '#6a3fd8',
        background_color: '#fbf7ff',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Il file wasm di manifold supera il limite di default (2 MiB).
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,svg,png,wasm,json}'],
        // Le chiamate all'API Claude non vanno mai in cache.
        navigateFallbackDenylist: [/^\/v1\//],
      },
    }),
  ],
  worker: { format: 'es' },
  optimizeDeps: {
    exclude: ['manifold-3d'],
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
