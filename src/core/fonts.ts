// 字型庫。字型檔不放進 repo：執行時才從 Google Fonts 載入（皆為 OFL 授權、可商用）。
// 中文字型由 Google 切成 unicode-range 小檔，瀏覽器只下載用到的字。

import zhTc from '../config/fonts/zh-tc.json'
import en from '../config/fonts/en.json'

export interface FontDef {
  family: string
  label: string
  category: string
  weights: number[]
  designer: string
  license: string
}

export interface FontGroup {
  id: 'zh-tc' | 'en'
  label: string
  sample: string
  fonts: FontDef[]
}

export const FONT_GROUPS: FontGroup[] = [
  { id: 'zh-tc', label: '中文', sample: '永遠的構圖 Design 2026', fonts: zhTc },
  { id: 'en', label: 'English', sample: 'The quick brown fox 2026', fonts: en },
]

const CSS_API = 'https://fonts.googleapis.com/css2'

function cssUrl(f: FontDef, weights: number[], text?: string): string {
  const fam = `family=${encodeURIComponent(f.family).replace(/%20/g, '+')}:wght@${weights.join(';')}`
  return `${CSS_API}?${fam}&display=swap${text ? `&text=${encodeURIComponent(text)}` : ''}`
}

const fullyLoaded = new Map<string, Promise<void>>()

/** 載入字型的所有字重，供實際排版使用。 */
export function loadFont(f: FontDef): Promise<void> {
  let p = fullyLoaded.get(f.family)
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = cssUrl(f, f.weights)
      link.onload = () => resolve()
      link.onerror = () => reject(new Error(`無法載入字型 ${f.family}`))
      document.head.appendChild(link)
    }).then(() => document.fonts.load(`400 16px "${f.family}"`).then(() => undefined))
    p.catch(() => fullyLoaded.delete(f.family))
    fullyLoaded.set(f.family, p)
  }
  return p
}

/** 預覽用字型名稱：只含預覽文字的極小子集，改名避免和完整字型互相遮蔽。 */
export const previewFamily = (f: FontDef) => `${f.family} __preview`

const previews = new Map<string, Promise<boolean>>()

/** 只下載預覽文字需要的字形（幾 KB），用於字型清單。離線時回傳 false。 */
export function loadPreview(f: FontDef, text: string): Promise<boolean> {
  const key = `${f.family}\u0000${text}`
  let p = previews.get(key)
  if (!p) {
    const weight = f.weights.includes(400) ? 400 : f.weights[0]
    p = fetch(cssUrl(f, [weight], text))
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((css) => {
        const style = document.createElement('style')
        style.textContent = css.replaceAll(`'${f.family}'`, `'${previewFamily(f)}'`)
        document.head.appendChild(style)
        return document.fonts.load(`${weight} 16px "${previewFamily(f)}"`, text).then(() => true)
      })
      .catch(() => false)
    previews.set(key, p)
  }
  return p
}
