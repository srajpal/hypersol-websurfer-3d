import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          // Bridge for the 3D shell.
          shell: resolve(__dirname, 'src/preload/shell.ts'),
          // Trusted preload for every web page (a stub until milestone 5).
          page: resolve(__dirname, 'src/preload/page.ts'),
        },
      },
    },
  },
  renderer: {},
});
