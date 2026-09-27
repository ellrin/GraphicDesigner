import { line, pt, rayToFrame } from '../../../../core/geometry'
import { defineGenerator } from '../../../../core/registry'

interface P {
  cx: number
  cy: number
  rays: number
  offset: number
}

// 放射構圖：線條由一點向外發散，視線被拉向中心
export default defineGenerator<P>((f, p) => {
  const c = pt(f.w * p.cx, f.h * p.cy)
  const start = (p.offset * Math.PI) / 180
  const primitives = Array.from({ length: p.rays }, (_, i) =>
    line(c, rayToFrame(c, start + (2 * Math.PI * i) / p.rays, f)),
  )
  return { primitives, anchors: [{ ...c, label: '放射中心' }] }
})
