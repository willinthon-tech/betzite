import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3045',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://127.0.0.1:3045',
        ws: true
      }
    }
  }
})

