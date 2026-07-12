import { defineConfig } from 'vite';
import { builtinModules } from 'node:module';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';

// https://vite.dev/config/
export default defineConfig({
  // Rutas relativas para que dist/index.html cargue sus assets al abrirse por
  // file:// dentro de la app empaquetada de Electron (loadFile).
  base: './',
  plugins: [
    react(),
    // Proceso principal de Electron.
    //
    // Se compila explícitamente a CommonJS con extensión .cjs (main.cjs). Aunque
    // el paquete usa "type": "module", el main DEBE ser CommonJS: bajo el loader
    // ESM, Electron no intercepta `import ... from 'electron'` (lo resuelve al
    // paquete npm, que solo exporta la ruta del binario) y la API queda undefined.
    // Con CJS, `require('electron')` sí devuelve la API real. La extensión .cjs
    // evita que Node interprete el archivo como ESM por culpa de "type": "module".
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            lib: false,
            outDir: 'dist-electron',
            emptyOutDir: false,
            rollupOptions: {
              input: 'electron/main.ts',
              // No empaquetar electron ni los módulos nativos de Node.
              external: [
                'electron',
                ...builtinModules,
                ...builtinModules.map((m) => `node:${m}`),
              ],
              output: {
                format: 'cjs',
                entryFileNames: 'main.cjs',
              },
            },
          },
        },
      },
    ]),
  ],
});
