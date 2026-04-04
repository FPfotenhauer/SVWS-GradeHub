import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Offline-Build: Alle Assets werden inline in die index.html eingebettet.
// Dieser Build läuft korrekt über das file://-Protokoll (ohne lokalen Server).
export default defineConfig({
  plugins: [vue(), viteSingleFile()],
  envPrefix: ['VITE_', 'SVWSSERVER_'],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    // Alle Assets inlinen, keine externen Chunk-Dateien
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        // Alles in einen einzigen Bundle – kein dynamisches Splitting
        inlineDynamicImports: true,
      },
    },
  },
})
