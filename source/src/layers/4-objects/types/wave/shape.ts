import Konva from 'konva'
import type { ShapeBuilder } from '../index'
import { partColors } from '../style'

// 波浪：正弦曲線。有框線時畫線；有填色時把波浪下方填滿（多條時層層疊起）
const build: ShapeBuilder = (ctx) => {
  const { w, h, props: p } = ctx
  const n = Math.max(1, p.lines as number)
  const band = h / n
  const amp = ((p.amplitude as number) * band) / 2
  const out: Konva.Shape[] = []
  for (let k = 0; k < n; k++) {
    const y0 = -h / 2 + band * (k + 0.5)
    const pts: number[] = []
    for (let i = 0; i <= 200; i++) {
      const t = i / 200
      pts.push(-w / 2 + w * t, y0 + amp * Math.sin(2 * Math.PI * ((p.periods as number) * t + (p.phase as number) + k * (p.shift as number))))
    }
    const c = partColors(ctx, k)
    if (c.fill) out.push(new Konva.Line({ points: [...pts, w / 2, h / 2, -w / 2, h / 2], closed: true, fill: c.fill }))
    if (c.stroke && ctx.strokeWidth > 0) out.push(new Konva.Line({ points: pts, stroke: c.stroke, strokeWidth: ctx.strokeWidth, lineCap: 'round', lineJoin: 'round' }))
  }
  return out
}
export default build
