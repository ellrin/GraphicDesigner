import Konva from 'konva'
import type { ShapeBuilder } from '../index'
import { paint } from '../style'

// 玫瑰線：r = cos(n/d · θ)，n、d 決定花瓣的數量與交疊
const build: ShapeBuilder = (ctx) => {
  const { w, h, props: p } = ctx
  const n = p.n as number
  const d = p.d as number
  const k = n / d
  const turns = Math.PI * 2 * d
  const pts: number[] = []
  for (let i = 0; i <= 1440; i++) {
    const t = (i / 1440) * turns
    const r = Math.cos(k * t)
    pts.push((r * Math.cos(t) * w) / 2, (r * Math.sin(t) * h) / 2)
  }
  return [new Konva.Line({ points: pts, closed: true, lineCap: 'round', ...paint(ctx) })]
}
export default build
