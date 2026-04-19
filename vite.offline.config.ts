import { fileURLToPath, URL } from 'node:url'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// Offline-Build mit dist/index.html + dist/assets.
// Erzeugt ein klassisches IIFE-Script, damit file:// ohne ES-Module lauffaehig bleibt.
export default defineConfig({
  base: './',
  plugins: [
    vue(),
    {
      name: 'offline-classic-script-html',
      async writeBundle() {
        const indexPath = resolve(process.cwd(), 'dist/index.html')
        const html = await readFile(indexPath, 'utf8')
        const rewritten = html
          .replace(/<script[^>]*type="module"[^>]*src="\.\/assets\/app\.js"[^>]*><\/script>/, '<script defer src="./assets/app.js"></script>')
          .replace(
            /<link\s+rel="stylesheet"\s+crossorigin\s+href="\.\/assets\/app\.css">/,
            '<link rel="stylesheet" href="./assets/app.css">',
          )

        if (rewritten !== html) {
          await writeFile(indexPath, rewritten, 'utf8')
        }
      },
    },
  ],
  envPrefix: ['VITE_', 'SVWSSERVER_'],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    modulePreload: false,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        format: 'iife',
        name: 'SVWSGradeHubApp',
        entryFileNames: 'assets/app.js',
        assetFileNames: assetInfo => {
          if (assetInfo.name?.endsWith('.css')) {
            return 'assets/app.css'
          }
          return 'assets/[name][extname]'
        },
        inlineDynamicImports: true,
      },
    },
  },
})
