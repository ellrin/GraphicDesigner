import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { viteSingleFile } from 'vite-plugin-singlefile'

const empty = fileURLToPath(new URL('./src/stubs/empty.ts', import.meta.url))

// 打包成單一 index.html：不需要伺服器，雙擊就能在瀏覽器開啟
export default defineConfig({
  base: './',
  plugins: [svelte(), viteSingleFile()],
  resolve: {
    // jsPDF 用不到的選用功能，以空模組取代
    alias: { html2canvas: empty, dompurify: empty, canvg: empty },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
