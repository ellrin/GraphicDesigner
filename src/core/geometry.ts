// 幾何基本型別與工具。所有版型只輸出這裡定義的圖元，不直接碰渲染。

export interface Pt {
  x: number
  y: number
}

/** 版型生成時拿到的畫框（單位與畫布一致，原點在左上）。 */
export interface Frame {
  w: number
  h: number
}

/** main = 主線；sub = 輔助線（較細、較淡）。 */
export type Weight = 'main' | 'sub'

interface Styled {
  weight?: Weight
  dashed?: boolean
}

export type Primitive =
  | ({ kind: 'line'; a: Pt; b: Pt } & Styled)
  | ({ kind: 'polyline'; points: Pt[]; closed?: boolean } & Styled)
  | ({ kind: 'circle'; c: Pt; r: number } & Styled)

/** 錨點：後續圖層（區塊、物件）可吸附的位置。 */
export interface Anchor extends Pt {
  label?: string
}

export interface GuideOutput {
  primitives: Primitive[]
  anchors: Anchor[]
}

export const PHI = (1 + Math.sqrt(5)) / 2

export const pt = (x: number, y: number): Pt => ({ x, y })

export const line = (a: Pt, b: Pt, style: Styled = {}): Primitive => ({ kind: 'line', a, b, ...style })

export const rect = (x: number, y: number, w: number, h: number, style: Styled = {}): Primitive => ({
  kind: 'polyline',
  points: [pt(x, y), pt(x + w, y), pt(x + w, y + h), pt(x, y + h)],
  closed: true,
  ...style,
})

export const polygon = (points: Pt[], style: Styled = {}): Primitive => ({
  kind: 'polyline',
  points,
  closed: true,
  ...style,
})

export const circle = (c: Pt, r: number, style: Styled = {}): Primitive => ({ kind: 'circle', c, r, ...style })

/** 圓弧以折線取樣（螢幕座標，y 向下；角度以弧度計）。 */
export function arcPoints(c: Pt, r: number, from: number, to: number, segments = 48): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i <= segments; i++) {
    const a = from + ((to - from) * i) / segments
    out.push(pt(c.x + r * Math.cos(a), c.y + r * Math.sin(a)))
  }
  return out
}

/** 兩條無限延伸直線的交點；平行時回傳 null。 */
export function intersectLines(a1: Pt, a2: Pt, b1: Pt, b2: Pt): Pt | null {
  const d = (a1.x - a2.x) * (b1.y - b2.y) - (a1.y - a2.y) * (b1.x - b2.x)
  if (Math.abs(d) < 1e-9) return null
  const t = ((a1.x - b1.x) * (b1.y - b2.y) - (a1.y - b1.y) * (b1.x - b2.x)) / d
  return pt(a1.x + t * (a2.x - a1.x), a1.y + t * (a2.y - a1.y))
}

/** 從 origin 沿 angle 方向射出，回傳與畫框邊界的交點。 */
export function rayToFrame(origin: Pt, angle: number, f: Frame): Pt {
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  let t = Infinity
  if (dx > 1e-9) t = Math.min(t, (f.w - origin.x) / dx)
  if (dx < -1e-9) t = Math.min(t, -origin.x / dx)
  if (dy > 1e-9) t = Math.min(t, (f.h - origin.y) / dy)
  if (dy < -1e-9) t = Math.min(t, -origin.y / dy)
  return pt(origin.x + dx * t, origin.y + dy * t)
}

export function inFrame(p: Pt, f: Frame, eps = 1e-6): boolean {
  return p.x >= -eps && p.y >= -eps && p.x <= f.w + eps && p.y <= f.h + eps
}
