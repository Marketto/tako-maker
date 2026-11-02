import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/* Pacchetto del Worker del connettore MCP: un solo file ESM in connector/dist,
   più manifold.wasm accanto (wrangler lo carica come modulo compilato). */

const root = fileURLToPath(new URL('..', import.meta.url));
const stub = resolve(root, 'src/connector/i18n-stub.ts');

export default defineConfig({
  root,
  logLevel: 'warn',
  publicDir: false,
  resolve: {
    alias: [{ find: /^(\.\.\/)+i18n$/, replacement: stub }],
  },
  build: {
    outDir: resolve(root, 'connector/dist'),
    emptyOutDir: true,
    target: 'es2022',
    minify: true,
    assetsInlineLimit: 0,
    lib: { entry: resolve(root, 'src/connector/worker.ts'), formats: ['es'], fileName: () => 'worker.js' },
    rollupOptions: {
      external: ['./manifold.wasm'],
      output: { codeSplitting: false },
    },
  },
  plugins: [
    {
      name: 'copia-wasm',
      closeBundle() {
        mkdirSync(resolve(root, 'connector/dist'), { recursive: true });
        copyFileSync(resolve(root, 'node_modules/manifold-3d/manifold.wasm'), resolve(root, 'connector/dist/manifold.wasm'));
      },
    },
  ],
});
