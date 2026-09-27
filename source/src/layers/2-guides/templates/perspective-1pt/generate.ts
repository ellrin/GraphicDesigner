import { lerp, line, perimeterPoints, polygon, pt, type Primitive, type Pt } from '../../../../core/geometry'
import { defineGenerator } from '../../../../core/registry'

interface P {
  vp: Pt
  rays: number
  frames: number
  horizon: boolean
}

// 一點透視：所有深度方向的線都收束到同一個消失點
export default defineGenerator<P>((f, p) => {
  const { w, h } = f
  const corners = [pt(0, 0), pt(w, 0), pt(w, h), pt(0, h)]
  const primitives: Primitive[] = []

  for (const q of perimeterPoints(f, p.rays)) primitives.push(line(p.vp, q, { weight: 'sub' }))
  for (const c of corners) primitives.push(line(p.vp, c))
  // 往消失點縮小的一層層框，表現空間深度
  for (let k = 1; k <= p.frames; k++) {
    const t = 1 - Math.pow(0.62, k)
    primitives.push(polygon(corners.map((c) => lerp(c, p.vp, t)), { weight: 'sub' }))
  }
  if (p.horizon) primitives.push(line(pt(0, p.vp.y), pt(w, p.vp.y), { dashed: true }))

  return { primitives, anchors: [{ ...p.vp, label: '消失點' }] }
})
