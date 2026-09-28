import Konva from 'konva'
import type { ShapeBuilder } from '../index'
import { partColors } from '../style'

// 鋸齒：鋸齒、鋸刀、方波。有框線時畫線；有填色時把下方填滿
const build: ShapeBuilder = (ctx) => {
  const { w, h, props: p } = ctx
  const n = Math.max(1, p.lines as number)
  const teeth = Math.max(1, p.teeth as number)
  const band = h / n
  const amp = ((p.amplitude as number) * band) / 2
  const step = w / teeth
  const out: Konva.Shape[] = []
  for (let k = 0; k < n; k++) {
    const y0 = -h / 2 + band * (k + 0.5)
    const pts: number[] = []
    for (let i = 0; i < teeth; i++) {
      const x = -w / 2 + i * step
      if (p.style === 'saw') pts.push(x, y0 + amp, x + step, y0 - amp, x + step, y0 + amp)
      else if (p.style === 'square') pts.push(x, y0 + amp, x, y0 - amp, x + step / 2, y0 - amp, x + step / 2, y0 + amp, x + step, y0 + amp)
      else pts.push(x, y0 + amp, x + step / 2, y0 - amp, x + step, y0 + amp)
    }
    const c = partColors(ctx, k)
    if (c.fill) out.push(new Konva.Line({ points: [...pts, w / 2, h / 2, -w / 2, h / 2], closed: true, fill: c.fill }))
    if (c.stroke && ctx.strokeWidth > 0) out.push(new Konva.Line({ points: pts, stroke: c.stroke, strokeWidth: ctx.strokeWidth, lineCap: 'round', lineJoin: 'miter' }))
  }
  return out
}
export default build
