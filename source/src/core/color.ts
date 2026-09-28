// 色彩計算：亮度、對比、OKLCH（感知均勻的色彩空間，用來產生深淺均勻的色階）。

export interface Rgb {
  r: number
  g: number
  b: number
}

export function hexToRgb(hex: string): Rgb {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16)
  return Number.isFinite(n) ? { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 } : { r: 0, g: 0, b: 0 }
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

const toLinear = (v: number) => {
  const s = v / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
const fromLinear = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055)

/** WCAG 相對亮度 0–1 */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/** WCAG 對比度 1–21（一般文字建議 ≥ 4.5，大標題 ≥ 3） */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

/** 在底色上最容易閱讀的文字色：從候選色（預設黑、白）中挑對比最高的 */
export function readableOn(bg: string, candidates: string[] = ['#111111', '#ffffff']): string {
  return candidates.reduce((best, c) => (contrast(bg, c) > contrast(bg, best) ? c : best), candidates[0])
}

// ── OKLab／OKLCH ────────────────────────────────────────

export interface Oklch {
  l: number
  c: number
  h: number
}

export function hexToOklch(hex: string): Oklch {
  const { r, g, b } = hexToRgb(hex)
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)]
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { l: L, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 }
}

function oklchToLinear({ l: L, c, h }: Oklch): [number, number, number] {
  const A = c * Math.cos((h * Math.PI) / 180)
  const B = c * Math.sin((h * Math.PI) / 180)
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

/** OKLCH → hex；超出 sRGB 色域時降低彩度直到能顯示 */
export function oklchToHex(color: Oklch): string {
  let c = color.c
  for (let i = 0; i < 24; i++) {
    const rgb = oklchToLinear({ ...color, c })
    if (rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4)) break
    c *= 0.9
  }
  const [r, g, b] = oklchToLinear({ ...color, c })
  return rgbToHex({ r: fromLinear(Math.max(0, r)), g: fromLinear(Math.max(0, g)), b: fromLinear(Math.max(0, b)) })
}
