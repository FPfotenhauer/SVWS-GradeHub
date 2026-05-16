import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string }

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
              '<script type="module" src="./assets/app.js"></script>',
            )
            .replace(
              /<link\s+rel="stylesheet"\s+crossorigin\s+href="\.\/assets\/app\.css">/,
              '<link rel="stylesheet" href="./assets/app.css">',
            )
        },
      },
    },
  ],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  envPrefix: ['VITE_', 'SVWSSERVER_', 'ADMINTOOL_'],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: assetInfo => {
          if (assetInfo.names?.some(n => n.endsWith('.css'))) {
            return 'assets/app.css'
          }
          return 'assets/[name][extname]'
        },
      },
    },
  },
})
