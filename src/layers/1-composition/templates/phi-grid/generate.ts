import { bandRegions, circle, line, PHI, pt, type Anchor, type Primitive } from '../../../../core/geometry'
import { defineGenerator } from '../../../../core/registry'

interface P {
  markPoints: boolean
}

// 黃金分割線：分割點落在 1/φ² ≈ 0.382 與 1/φ ≈ 0.618
export default defineGenerator<P>(({ w, h }, p) => {
  const ratios = [1 / (PHI * PHI), 1 / PHI]
  const primitives: Primitive[] = []
  const anchors: Anchor[] = []

  for (const r of ratios) {
    primitives.push(line(pt(w * r, 0), pt(w * r, h)))
    primitives.push(line(pt(0, h * r), pt(w, h * r)))
  }
  for (const rx of ratios) {
    for (const ry of ratios) {
      anchors.push({ x: w * rx, y: h * ry, label: '黃金交點' })
      if (p.markPoints) primitives.push(circle(pt(w * rx, h * ry), Math.min(w, h) * 0.02, { weight: 'sub' }))
    }
  }
  const xs = [0, ...ratios.map((r) => w * r), w]
  const ys = [0, ...ratios.map((r) => h * r), h]
  return { primitives, anchors, regions: [...bandRegions(xs, 'x', h), ...bandRegions(ys, 'y', w)] }
})
