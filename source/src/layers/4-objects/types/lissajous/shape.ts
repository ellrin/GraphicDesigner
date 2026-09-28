import Konva from 'konva'
import type { ShapeBuilder } from '../index'
import { paint } from '../style'

// 利薩如曲線：x = sin(a·t + δ)、y = sin(b·t)
const build: ShapeBuilder = (ctx) => {
  const { w, h, props: p } = ctx
  const pts: number[] = []
  const d = (p.delta as number) * Math.PI
  for (let i = 0; i <= 720; i++) {
    const t = (i / 720) * Math.PI * 2
    pts.push((Math.sin((p.a as number) * t + d) * w) / 2, (Math.sin((p.b as number) * t) * h) / 2)
  }
  return [new Konva.Line({ points: pts, closed: true, lineCap: 'round', ...paint(ctx) })]
}
export default build
