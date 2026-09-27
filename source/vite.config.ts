import { copyFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { viteSingleFile } from 'vite-plugin-singlefile'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))
const empty = here('./src/stubs/empty.ts')

/** 把網頁圖示（favicon）直接嵌進 HTML，單一檔案離線打開時分頁也有圖示 */
function inlineFavicon(): Plugin {
  return {
    name: 'inline-favicon',
    apply: 'build',
    transformIndexHtml(html) {
      const svg = readFileSync(here('./public/icon.svg'), 'utf8')
      const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
      return html.replace(/href="\.?\/icon\.svg"/, `href="${uri}"`)
    },
  }
}

/** 打包完成後，把成品複製到專案最上層的 GraphicDesigner.html（使用者雙擊的主程式） */
function publishApp(): Plugin {
  return {
    name: 'publish-app',
    apply: 'build',
    closeBundle() {
      copyFileSync(here('./dist/index.html'), here('../GraphicDesigner.html'))
    },
  }
}

// 打包成單一 HTML：不需要伺服器，雙擊就能在瀏覽器開啟。
// dist/ 另外包含 PWA 用的圖示、manifest 與 service worker，供 GitHub Pages 部署。
export default defineConfig({
  base: './',
  plugins: [svelte(), viteSingleFile(), inlineFavicon(), publishApp()],
  resolve: {
    // jsPDF 用不到的選用功能，以空模組取代
    alias: { html2canvas: empty, dompurify: empty, canvg: empty },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
