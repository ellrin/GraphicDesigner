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
  /** 線段／折線終點加上箭頭，用於表示視線方向。 */
  arrow?: boolean
}

export type TextAlign = 'left' | 'center' | 'right'

export type Primitive =
  | ({ kind: 'line'; a: Pt; b: Pt } & Styled)
  | ({ kind: 'polyline'; points: Pt[]; closed?: boolean } & Styled)
  | ({ kind: 'circle'; c: Pt; r: number } & Styled)
  /** 標籤文字：以螢幕固定大小顯示，不隨畫布縮放。 */
  | ({ kind: 'text'; at: Pt; text: string; align?: TextAlign } & Styled)

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

export const text = (at: Pt, content: string, align: TextAlign = 'center', style: Styled = {}): Primitive => ({
  kind: 'text',
  at,
  text: content,
  align,
  ...style,
})

/** Catmull-Rom 曲線：平滑通過所有控制點，回傳取樣後的折線點。 */
export function smoothPath(points: Pt[], segments = 24): Pt[] {
  if (points.length < 3) return points
  const out: Pt[] = []
  const at = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))]
  for (let i = 0; i < points.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)]
    for (let s = 0; s < segments; s++) {
      const t = s / segments
      const t2 = t * t
      const t3 = t2 * t
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
      out.push(pt(f(p0.x, p1.x, p2.x, p3.x), f(p0.y, p1.y, p2.y, p3.y)))
    }
  }
  out.push(points[points.length - 1])
  return out
}

/** 可重現的偽隨機數（同樣的 seed 永遠得到同樣結果），用於需要「看起來隨機」的版型。 */
export function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

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

export const lerp = (a: Pt, b: Pt, t: number): Pt => pt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)

/** 沿畫框周長平均取 n 個點（從左上角順時針）。 */
export function perimeterPoints(f: Frame, n: number): Pt[] {
  const total = 2 * (f.w + f.h)
  return Array.from({ length: n }, (_, i) => {
    let d = (total * i) / n
    if (d < f.w) return pt(d, 0)
    d -= f.w
    if (d < f.h) return pt(f.w, d)
    d -= f.h
    if (d < f.w) return pt(f.w - d, f.h)
    return pt(0, f.h - (d - f.w))
  })
}

export function inFrame(p: Pt, f: Frame, eps = 1e-6): boolean {
  return p.x >= -eps && p.y >= -eps && p.x <= f.w + eps && p.y <= f.h + eps
}
