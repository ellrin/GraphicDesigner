import { copyFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
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

/**
 * 收集實際被打包進程式的第三方套件授權：
 * 寫成 docs/THIRD_PARTY_LICENSES.md，並以註解附在 HTML 開頭（單獨下載 HTML 時也帶著授權聲明）
 */
function thirdPartyLicenses(): Plugin {
  const packages = new Map<string, string>()
  return {
    name: 'third-party-licenses',
    apply: 'build',
    moduleParsed({ id }) {
      const m = id.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//)
      if (m) packages.set(m[1], id.slice(0, id.indexOf(m[0]) + m[0].length))
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const entries = [...packages].sort(([a], [b]) => a.localeCompare(b)).map(([name, dir]) => {
          const pkg = JSON.parse(readFileSync(dir + 'package.json', 'utf8'))
          const file = readdirSync(dir).find((f) => /^(licen[sc]e|copying)/i.test(f))
          const text = file ? readFileSync(dir + file, 'utf8').trim() : `License: ${pkg.license ?? 'unknown'}`
          return { name, version: pkg.version as string, license: pkg.license as string, text }
        })
        const md = [
          '# 第三方授權聲明',
          '',
          'GraphicDesigner.html 內含以下開源套件（打包時自動產生，請勿手動編輯）。',
          '',
          ...entries.flatMap((e) => [`## ${e.name} ${e.version}（${e.license}）`, '', '```', e.text, '```', '']),
        ].join('\n')
        writeFileSync(here('../docs/THIRD_PARTY_LICENSES.md'), md)
        const notice = [
          'GraphicDesigner — Copyright (c) 2026 Ellrin — MIT License',
          'https://github.com/ellrin/GraphicDesigner',
          '',
          'Third-party software included in this file:',
          '',
          ...entries.flatMap((e) => [`=== ${e.name} ${e.version} (${e.license}) ===`, e.text, '']),
        ]
          .join('\n')
          .replaceAll('--', '- -')
        return html.replace('<!doctype html>', `<!doctype html>\n<!--\n${notice}\n-->`)
      },
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
  plugins: [svelte(), viteSingleFile(), inlineFavicon(), thirdPartyLicenses(), publishApp()],
  resolve: {
    // jsPDF 用不到的選用功能，以空模組取代
    alias: { html2canvas: empty, dompurify: empty, canvg: empty },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
