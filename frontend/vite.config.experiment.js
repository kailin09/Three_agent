import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'experiment-guard-assets',
    emptyOutDir: true,
    lib: {
      entry: 'src/experiment-guard-upload.jsx',
      formats: ['es'],
      fileName: () => 'experiment-upload.js',
      cssFileName: 'experiment-upload',
    },
    rollupOptions: {
      output: {
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
})
