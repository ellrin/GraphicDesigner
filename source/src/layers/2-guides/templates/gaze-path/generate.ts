import { pt, smoothPath, text, type Primitive, type Pt } from '../../../../core/geometry'
import { defineGenerator } from '../../../../core/registry'

interface P {
  p1: Pt
  p2: Pt
  p3: Pt
  p4: Pt
  count: number
  smooth: boolean
  numbers: boolean
}

// 自訂視線路徑：在畫布上拖曳控制點，規劃讀者依序看到的元素
export default defineGenerator<P>(({ w, h }, p) => {
  const pts = [p.p1, p.p2, p.p3, p.p4].slice(0, p.count)
  const primitives: Primitive[] = [{ kind: 'polyline', points: p.smooth ? smoothPath(pts) : pts, arrow: true }]
  if (p.numbers) {
    const off = Math.min(w, h) * 0.035
    pts.forEach((q, i) => primitives.push(text(pt(q.x, q.y - off), String(i + 1))))
  }
  return { primitives, anchors: pts.map((q, i) => ({ ...q, label: `第 ${i + 1} 眼` })) }
})
