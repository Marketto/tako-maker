import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

/* Pacchetto del Worker del connettore MCP: un solo file ESM in connector/dist.
   Niente manifold: la geometria la calcola l'app. */

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
      output: { codeSplitting: false },
    },
  },
});
