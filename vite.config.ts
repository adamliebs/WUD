import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Inject the app version from package.json so Settings → About stays in sync
// with the released build automatically.
const pkg = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), 'package.json'), 'utf8'),
) as { version: string };

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
