/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Um bundle só para o painel e todos os widgets (a janela escolhe o que desenhar pelo rótulo).
// Porta fixa 1420: é o devUrl do src-tauri/tauri.conf.json.
export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    // O app importa ../shared (contrato e regras puras) e os tokens visuais de ../src/app.css.
    fs: { allow: ['..'] },
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022', sourcemap: false },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
