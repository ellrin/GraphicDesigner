import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { viteSingleFile } from 'vite-plugin-singlefile'

// 打包成單一 index.html：不需要伺服器，雙擊就能在瀏覽器開啟
export default defineConfig({
  base: './',
  plugins: [svelte(), viteSingleFile()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
