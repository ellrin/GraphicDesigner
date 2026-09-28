// 色彩庫：精選主題配色（config/palettes/*.json）＋演算法產生的色系與配色法。
// 新增主題配色：在 config/palettes/ 的檔案裡加一筆，或新增一個類別檔案。

import { contrast, hexToOklch, oklchToHex, readableOn } from './color'

export interface Palette {
  id: string
  name: string
  category: string
  colors: string[]
}

interface PaletteFile {
  category: string
  order?: number
  palettes: { id: string; name: string; colors: string[] }[]
}

const files = Object.values(import.meta.glob<PaletteFile>('../config/palettes/*.json', { eager: true, import: 'default' })).sort(
  (a, b) => (a.order ?? 99) - (b.order ?? 99),
)

const curated: Palette[] = files.flatMap((f) => f.palettes.map((p) => ({ ...p, category: f.category })))

// ── 演算法產生 ─────────────────────────────────────────

const HUES: { id: string; name: string; h: number; c: number }[] = [
  { id: 'red', name: '紅', h: 27, c: 0.2 },
  { id: 'orange', name: '橘', h: 50, c: 0.18 },
  { id: 'amber', name: '琥珀', h: 72, c: 0.16 },
  { id: 'yellow', name: '黃', h: 95, c: 0.17 },
  { id: 'lime', name: '萊姆', h: 125, c: 0.18 },
  { id: 'green', name: '綠', h: 148, c: 0.17 },
  { id: 'teal', name: '青綠', h: 180, c: 0.12 },
  { id: 'cyan', name: '青', h: 205, c: 0.13 },
  { id: 'sky', name: '天藍', h: 235, c: 0.14 },
  { id: 'blue', name: '藍', h: 262, c: 0.2 },
  { id: 'indigo', name: '靛', h: 280, c: 0.19 },
  { id: 'violet', name: '紫羅蘭', h: 298, c: 0.2 },
  { id: 'purple', name: '紫', h: 318, c: 0.2 },
  { id: 'pink', name: '粉紅', h: 350, c: 0.18 },
  { id: 'brown', name: '棕', h: 55, c: 0.07 },
  { id: 'gray', name: '灰', h: 260, c: 0.012 },
]

/** 彩度在中間亮度最高、兩端收斂，深淺看起來比較均勻 */
const chromaAt = (l: number, max: number) => Math.max(0.01, max * (1 - ((l - 0.62) / 0.5) ** 2))
const shade = (h: number, max: number, l: number) => oklchToHex({ l, c: chromaAt(l, max), h })

const RAMP = [0.24, 0.32, 0.42, 0.52, 0.62, 0.71, 0.8, 0.88, 0.94, 0.975]

const ramps: Palette[] = HUES.map(({ id, name, h, c }) => ({
  id: `ramp-${id}`,
  name,
  category: '色系',
  colors: ['#111111', ...RAMP.map((l) => shade(h, c, l)), '#ffffff'],
}))

const HARMONY_HUES = ['red', 'orange', 'yellow', 'lime', 'green', 'teal', 'cyan', 'blue', 'indigo', 'violet', 'purple', 'pink']

const harmonies: Palette[] = HUES.filter((x) => HARMONY_HUES.includes(x.id)).flatMap(({ id, name, h, c }) => {
    const comp = (h + 180) % 360
    return [
      {
        id: `comp-${id}`,
        name: `${name}＋互補`,
        category: '配色法',
        colors: ['#141414', ...[0.35, 0.55, 0.75, 0.92].map((l) => shade(h, c, l)), ...[0.4, 0.6, 0.8, 0.93].map((l) => shade(comp, c, l)), '#fafafa'],
      },
      {
        id: `analog-${id}`,
        name: `${name}＋類比`,
        category: '配色法',
        colors: [
          '#141414',
          ...[0.45, 0.75].map((l) => shade(h - 30, c, l)),
          ...[0.35, 0.6, 0.88].map((l) => shade(h, c, l)),
          ...[0.5, 0.8].map((l) => shade(h + 30, c, l)),
          '#fafafa',
        ],
      },
    ]
  })

export const PALETTES: Palette[] = [...curated, ...ramps, ...harmonies]

export const PALETTE_CATEGORIES = [...new Set(PALETTES.map((p) => p.category))]

export const paletteOf = (id: string | null | undefined) => PALETTES.find((p) => p.id === id)

// ── 角色 ───────────────────────────────────────────────

export interface PaletteRoles {
  /** 最深色（深色底、深色文字） */
  dark: string
  /** 最淺色（淺色底、淺色文字） */
  light: string
  /** 主色：最鮮豔的顏色 */
  primary: string
  /** 強調色：與主色色相差最多的鮮豔顏色 */
  accent: string
  /** 有彩度的顏色，由鮮豔到平淡 */
  chromatic: string[]
}

export function rolesOf(p: Palette): PaletteRoles {
  const info = p.colors.map((hex) => ({ hex, ...hexToOklch(hex) }))
  const byL = [...info].sort((a, b) => a.l - b.l)
  const dark = byL[0].hex
  const light = byL[byL.length - 1].hex
  const chromatic = info
    .filter((x) => x.c > 0.04 && x.hex !== dark && x.hex !== light)
    .sort((a, b) => b.c - a.c)
  const primary = chromatic[0]
  const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))
  const accent = primary ? [...chromatic.slice(1)].sort((a, b) => hueGap(b.h, primary.h) - hueGap(a.h, primary.h))[0] : undefined
  return {
    dark,
    light,
    primary: primary?.hex ?? dark,
    accent: accent?.hex ?? primary?.hex ?? dark,
    chromatic: chromatic.map((x) => x.hex),
  }
}

/** 在底色上閱讀用的文字色：優先用配色裡最深／最淺的顏色，對比不足時改用黑白 */
export function textOn(bg: string, roles?: PaletteRoles): string {
  if (!roles) return readableOn(bg)
  const pick = readableOn(bg, [roles.dark, roles.light])
  return contrast(bg, pick) >= 4.5 ? pick : readableOn(bg)
}
