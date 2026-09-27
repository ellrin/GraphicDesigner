import { pt, text, type Anchor, type Primitive, type Pt } from '../../../../core/geometry'
import { defineGenerator } from '../../../../core/registry'

interface P {
  rows: number
  margin: number
  numbers: boolean
}

// Z 型動線：視線由左上 → 右上 → 左下 → 右下，適合文字少、以圖為主的版面
export default defineGenerator<P>(({ w, h }, p) => {
  const mx = w * p.margin
  const my = h * p.margin
  const points: Pt[] = []
  for (let r = 0; r <= p.rows; r++) {
    const y = my + ((h - 2 * my) * r) / p.rows
    points.push(pt(mx, y), pt(w - mx, y))
  }
  const primitives: Primitive[] = [{ kind: 'polyline', points, arrow: true }]
  const anchors: Anchor[] = points.map((q, i) => ({ ...q, label: `視線 ${i + 1}` }))
  if (p.numbers) {
    const off = Math.min(w, h) * 0.035
    points.forEach((q, i) => primitives.push(text(pt(q.x, q.y - off), String(i + 1))))
  }
  return { primitives, anchors }
})
