import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    {
      name: 'offline-classic-script-html',
      transformIndexHtml: {
        order: 'post',
        handler(html) {
          return html
            .replace(
              /<script[^>]*src="\.\/assets\/app\.js"[^>]*><\/script>/,
              '<script defer src="./assets/app.js"></script>',
            )
            .replace(
              /<link\s+rel="stylesheet"\s+crossorigin\s+href="\.\/assets\/app\.css">/,
              '<link rel="stylesheet" href="./assets/app.css">',
            )
        },
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
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: assetInfo => {
          if (assetInfo.name?.endsWith('.css')) {
            return 'assets/app.css'
          }
          return 'assets/[name][extname]'
        },
      },
    },
  },
})
