import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    watch: {
      // Cargo writes and locks DLLs here while `tauri dev` runs.
      ignored: ['**/src-tauri/target/**'],
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
