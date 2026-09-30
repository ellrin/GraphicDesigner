// 圖表配色與墨色（文字、格線）。
//
// 系列顏色有四種模式（params.json 的 colorMode）：
// - palette  配色：以物件的填色為第一色，其餘從專案配色中挑「彼此差最多」的顏色依序使用
// - standard 標準：固定順序的八色，已驗證色盲可分辨（dataviz 參考色盤）
// - mono     單色：物件填色的深淺階
// - focus    強調：只有強調的那一項用填色，其他為灰色（由繪圖程式處理）

import { contrast, hexToOklch, oklchToHex } from '../../../../core/color'
import { paletteCycle } from '../style'
import type { ShapeContext } from '../index'

/** 標準八色（淺色底／深色底各一組，同色相、依底色調整明度） */
export const STANDARD_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948']
export const STANDARD_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']

export interface Ink {
  primary: string
  secondary: string
  muted: string
  grid: string
  baseline: string
  /** 資料點外圈（與底色相同的細環） */
  surface: string
  /** 強調模式中未強調的項目 */
  rest: string
  good: string
  bad: string
  dark: boolean
}

export function inkOf(ctx: ShapeContext): Ink {
  const dark = ctx.props.ink === 'light'
  return dark
    ? {
        primary: '#ffffff',
        secondary: '#c3c2b7',
        muted: '#a3a19a',
        grid: 'rgba(255,255,255,0.14)',
        baseline: 'rgba(255,255,255,0.38)',
        surface: '#1a1a19',
        rest: 'rgba(255,255,255,0.28)',
        good: '#0ca30c',
        bad: '#e66767',
        dark,
      }
    : {
        primary: '#0b0b0b',
        secondary: '#52514e',
        muted: '#898781',
        grid: 'rgba(11,11,11,0.10)',
        baseline: 'rgba(11,11,11,0.28)',
        surface: '#ffffff',
        rest: '#cfcdc6',
        good: '#006300',
        bad: '#d03b3b',
        dark,
      }
}

/** OKLab 距離 ×100（ΔE，15 以下一般人就不易分辨） */
export function deltaE(a: string, b: string): number {
  const p = hexToOklch(a)
  const q = hexToOklch(b)
  const ab = (o: { c: number; h: number }) => [o.c * Math.cos((o.h * Math.PI) / 180), o.c * Math.sin((o.h * Math.PI) / 180)]
  const [pa, pb] = ab(p)
  const [qa, qb] = ab(q)
  return Math.hypot(p.l - q.l, pa - qa, pb - qb) * 100
}

const norm = (c: string) => c.trim().toLowerCase()

/** 由候選色中依序挑出與已選顏色「最小距離最大」的顏色（讓相鄰系列盡量不同） */
function spread(first: string[], pool: string[], n: number): string[] {
  const out = [...first]
  const rest = pool.filter((c) => !out.some((o) => norm(o) === norm(c)))
  while (out.length < n && rest.length) {
    let best = 0
    let bestD = -1
    rest.forEach((c, i) => {
      const d = out.length ? Math.min(...out.map((o) => deltaE(o, c))) : 100
      if (d > bestD) [best, bestD] = [i, d]
    })
    out.push(rest.splice(best, 1)[0])
  }
  return out
}

/** 物件的主色：填色 → 配色第一個鮮豔色 → 標準色第一色 */
export function mainColor(ctx: ShapeContext): string {
  return ctx.fill || paletteCycle(ctx)[0] || (ctx.props.ink === 'light' ? STANDARD_DARK : STANDARD_LIGHT)[0]
}

/** n 個系列（或圓餅的 n 個類別）的顏色 */
export function seriesColors(ctx: ShapeContext, n: number): string[] {
  const standard = ctx.props.ink === 'light' ? STANDARD_DARK : STANDARD_LIGHT
  const mode = ctx.props.colorMode
  if (mode === 'standard') return Array.from({ length: n }, (_, i) => standard[i % standard.length])
  if (mode === 'mono' || mode === 'focus') return monoRamp(mainColor(ctx), n)
  // 配色：先用專案配色（排除與底色對比太低、畫成細線或小色塊會看不清楚的顏色），
  // 不夠再補標準色（跳過和已選顏色太接近的）
  const main = mainColor(ctx)
  const surface = ctx.props.ink === 'light' ? '#1a1a19' : '#ffffff'
  const usable = paletteCycle(ctx).filter((c) => contrast(c, surface) >= 1.9)
  const fromPalette = spread([main], usable, n)
  const colors = fromPalette.length >= n ? fromPalette : spread(fromPalette, standard.filter((c) => fromPalette.every((o) => deltaE(o, c) >= 15)), n)
  return Array.from({ length: n }, (_, i) => colors[i % colors.length])
}

/** 同一色相由深到淺的 n 階（單色模式；第一階為主色本身） */
export function monoRamp(base: string, n: number): string[] {
  if (n <= 1) return [base]
  const o = hexToOklch(base)
  const lo = Math.min(o.l, 0.5)
  const hi = Math.min(0.9, Math.max(o.l + 0.3, 0.82))
  return Array.from({ length: n }, (_, i) => (i === 0 ? base : oklchToHex({ l: lo + ((hi - lo) * i) / (n - 1), c: o.c * (1 - (0.45 * i) / (n - 1)), h: o.h })))
}

/**
 * 檢查相鄰顏色是否太接近（一般視覺 ΔE < 15）。回傳給使用者看的提示，沒有問題時回傳空字串。
 * 編輯面板用；色盲模擬請用 dataviz 的 validate_palette.js。
 */
export function paletteWarning(colors: string[]): string {
  for (let i = 1; i < colors.length; i++) {
    if (deltaE(colors[i - 1], colors[i]) < 15) return `第 ${i} 與第 ${i + 1} 個系列的顏色太接近，建議改用「標準」配色或換一組配色`
  }
  return ''
}
