import Konva from 'konva'
import type { Pt } from '../../../../core/geometry'
import type { ShapeBuilder } from '../index'
import { paint } from '../style'

// 色塊：版型範本切出來的填色區域（矩形、橢圓或任意多邊形；頂點為物件框內 0–1 的位置）
const build: ShapeBuilder = (ctx) => {
  const { w, h, props: p } = ctx
  if (p.shape === 'ellipse') return [new Konva.Ellipse({ radiusX: w / 2, radiusY: h / 2, ...paint(ctx) })]
  const pts = p.points as unknown as Pt[] | undefined
  if (p.shape === 'polygon' && pts && pts.length >= 3) {
    return [new Konva.Line({ points: pts.flatMap((q) => [-w / 2 + q.x * w, -h / 2 + q.y * h]), closed: true, ...paint(ctx) })]
  }
  return [new Konva.Rect({ x: -w / 2, y: -h / 2, width: w, height: h, cornerRadius: Math.min(w, h) * Number(p.radius ?? 0), ...paint(ctx) })]
}
export default build
