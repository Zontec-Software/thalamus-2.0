import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// No GitHub Pages o site fica em /thalamus-2.0/. O servidor local continua na raiz.
const pagesBase = process.env.GITHUB_PAGES === 'true' ? '/thalamus-2.0/' : '/'

// https://vite.dev/config/
export default defineConfig({
  base: pagesBase,
  plugins: [vue()],
  server: { host: true, port: 8080, strictPort: true },
})
