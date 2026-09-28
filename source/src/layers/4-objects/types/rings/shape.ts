import Konva from 'konva'
import type { ShapeBuilder } from '../index'
import { partColors } from '../style'

// 同心圓：由外到內等距；有填色時由外往內疊（多色時像標靶）
const build: ShapeBuilder = (ctx) => {
  const { w, h, props: p } = ctx
  const n = Math.max(1, p.count as number)
  const inner = p.inner as number
  const out: Konva.Shape[] = []
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 1 : 1 - ((1 - inner) * i) / (n - 1)
    const c = partColors(ctx, i)
    out.push(
      new Konva.Ellipse({
        radiusX: (w / 2) * k,
        radiusY: (h / 2) * k,
        fill: c.fill || undefined,
        fillEnabled: !!c.fill,
        stroke: c.stroke || undefined,
        strokeEnabled: !!c.stroke && ctx.strokeWidth > 0,
        strokeWidth: ctx.strokeWidth,
      }),
    )
  }
  return out
}
export default build
