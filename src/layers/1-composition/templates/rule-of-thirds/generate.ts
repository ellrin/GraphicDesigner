import { bandRegions, circle, line, pt, type Anchor, type Primitive } from '../../../../core/geometry'
import { defineGenerator } from '../../../../core/registry'

interface P {
  cols: number
  rows: number
  markPoints: boolean
}

export default defineGenerator<P>(({ w, h }, p) => {
  const primitives: Primitive[] = []
  const anchors: Anchor[] = []
  const xs = Array.from({ length: p.cols - 1 }, (_, i) => (w * (i + 1)) / p.cols)
  const ys = Array.from({ length: p.rows - 1 }, (_, i) => (h * (i + 1)) / p.rows)

  for (const x of xs) primitives.push(line(pt(x, 0), pt(x, h)))
  for (const y of ys) primitives.push(line(pt(0, y), pt(w, y)))
  for (const [i, x] of xs.entries()) {
    for (const [j, y] of ys.entries()) {
      // 交點依位置命名：「交點 欄-列」，例如三分法左上為 交點 1-1
      anchors.push({ x, y, label: `交點 ${i + 1}-${j + 1}` })
      if (p.markPoints) primitives.push(circle(pt(x, y), Math.min(w, h) * 0.02, { weight: 'sub' }))
    }
  }
  return { primitives, anchors, regions: [...bandRegions([0, ...xs, w], 'x', h), ...bandRegions([0, ...ys, h], 'y', w)] }
})
