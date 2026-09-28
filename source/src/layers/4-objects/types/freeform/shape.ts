import Konva from 'konva'
import type { Pt } from '../../../../core/geometry'
import type { ShapeBuilder } from '../index'
import { paint } from '../style'

// 自由多邊形：在畫布上逐點點出的閉合形狀；頂點存成物件框內 0–1 的位置，可以直接拖曳調整
const build: ShapeBuilder = (ctx) => {
  const { w, h } = ctx
  const pts = (ctx.props.points as unknown as Pt[] | undefined) ?? []
  if (pts.length < 2) return []
  return [new Konva.Line({ points: pts.flatMap((q) => [-w / 2 + q.x * w, -h / 2 + q.y * h]), closed: pts.length >= 3, ...paint(ctx) })]
}
export default build
