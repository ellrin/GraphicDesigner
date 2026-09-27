import { line, pt, type Anchor, type Primitive, type Pt } from '../../../../core/geometry'
import { defineGenerator } from '../../../../core/registry'

interface P {
  a: Pt
  b: Pt
  extend: boolean
  copies: number
  spacing: number
}

/** 延長線段到畫框邊緣 */
function extendToFrame(a: Pt, b: Pt, w: number, h: number): [Pt, Pt] {
  const d = pt(b.x - a.x, b.y - a.y)
  const ts: number[] = []
  if (Math.abs(d.x) > 1e-9) ts.push(-a.x / d.x, (w - a.x) / d.x)
  if (Math.abs(d.y) > 1e-9) ts.push(-a.y / d.y, (h - a.y) / d.y)
  const pts = ts
    .map((t) => pt(a.x + d.x * t, a.y + d.y * t))
    .filter((p) => p.x >= -1e-6 && p.x <= w + 1e-6 && p.y >= -1e-6 && p.y <= h + 1e-6)
  if (pts.length < 2) return [a, b]
  pts.sort((p, q) => p.x - q.x || p.y - q.y)
  return [pts[0], pts[pts.length - 1]]
}

// 自訂引導線：拖曳兩個端點畫出任意引導線，可延伸到畫面邊緣、並複製出等距平行線
export default defineGenerator<P>(({ w, h }, p) => {
  const len = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y) || 1
  const n = pt(-(p.b.y - p.a.y) / len, (p.b.x - p.a.x) / len)
  const gap = Math.min(w, h) * p.spacing
  const primitives: Primitive[] = []
  const anchors: Anchor[] = [
    { ...p.a, label: '端點 A' },
    { ...p.b, label: '端點 B' },
    { ...pt((p.a.x + p.b.x) / 2, (p.a.y + p.b.y) / 2), label: '中點' },
  ]
  for (let k = 0; k <= p.copies; k++) {
    const off = k * gap
    const a = pt(p.a.x + n.x * off, p.a.y + n.y * off)
    const b = pt(p.b.x + n.x * off, p.b.y + n.y * off)
    const [s, e] = p.extend ? extendToFrame(a, b, w, h) : [a, b]
    primitives.push(line(s, e, { weight: k === 0 ? 'main' : 'sub' }))
  }
  return { primitives, anchors }
})
