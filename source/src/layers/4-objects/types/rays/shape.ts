import Konva from 'konva'
import type { ShapeBuilder } from '../index'
import { partColors } from '../style'

// 放射線：由中心向外的線；有填色時畫成交錯的扇形（放射光芒）
const build: ShapeBuilder = (ctx) => {
  const { w, h, props: p } = ctx
  const n = Math.max(2, p.count as number)
  const inner = p.inner as number
  const out: Konva.Shape[] = []
  const at = (a: number, k: number) => [(Math.cos(a) * w * k) / 2, (Math.sin(a) * h * k) / 2]
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + (Math.PI * 2 * i) / n
    const c = partColors(ctx, Math.floor(i / 2))
    if (ctx.fill && i % 2 === 0) {
      const a1 = a0 + (Math.PI * 2) / n
      out.push(new Konva.Line({ points: [...at(a0, inner), ...at(a0, 1), ...at(a1, 1), ...at(a1, inner)], closed: true, fill: c.fill }))
    }
    if (c.stroke && ctx.strokeWidth > 0) out.push(new Konva.Line({ points: [...at(a0, inner), ...at(a0, 1)], stroke: c.stroke, strokeWidth: ctx.strokeWidth, lineCap: 'round' }))
  }
  return out
}
export default build
