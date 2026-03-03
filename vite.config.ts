import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { viteSingleFile } from 'vite-plugin-singlefile'
import path from 'path'

const singleFile = process.env.VITE_SINGLEFILE === 'true'

// https://vite.dev/config/
export default defineConfig({
  plugins: [preact(), ...(singleFile ? [viteSingleFile()] : [])],
  server: {
    proxy: {
      '/command': 'http://localhost:8080',
      '/config': 'http://localhost:8080',
      '/files': 'http://localhost:8080',
      '/upload': 'http://localhost:8080',
      '/updatefw': 'http://localhost:8080',
      '/preferences.json': 'http://localhost:8080',
      '/sd': 'http://localhost:8080',
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        loadPaths: [path.resolve(__dirname, '.')],
        silenceDeprecations: ['import', 'global-builtin', 'color-functions'],
      },
    },
  },
})
