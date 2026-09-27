import { pt, region, text, type Anchor, type Primitive, type Pt, type Region } from '../../../../core/geometry'
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
  // 建議區塊：每個轉折點一塊，靠在邊距內側；首尾依 Z 型慣例放 Logo 與行動呼籲
  const bw = (w - 2 * mx) * 0.3
  const bh = Math.min((h - 2 * my) / (p.rows + 1), h * 0.25)
  const roleAt = (i: number) =>
    i === 0 ? ['Logo', 'logo'] : i === points.length - 1 ? ['行動呼籲', 'cta'] : i === 1 ? ['輔助資訊', 'other'] : ['內容', 'image']
  const regions: Region[] = points.map((q, i) => {
    const x = i % 2 === 0 ? mx : w - mx - bw
    const y = Math.min(Math.max(0, q.y - bh / 2), h - bh)
    const [label, role] = roleAt(i)
    return region(x, y, bw, bh, `${i + 1}. ${label}`, role)
  })
  return { primitives, anchors, regions }
})
