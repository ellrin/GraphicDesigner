import Konva from 'konva'
import type { Pt } from '../../../../core/geometry'
import type { ShapeBuilder } from '../index'
import { paint } from '../style'

/** 三角形的三個頂點（物件框內 0–1 相對位置），可在畫布上拖曳調整 */
export const TRIANGLE_VERTICES = ['a', 'b', 'c'] as const

const build: ShapeBuilder = (ctx) => {
  const { w, h } = ctx
  const points = TRIANGLE_VERTICES.flatMap((k) => {
    const p = ctx.props[k] as Pt
    return [-w / 2 + w * p.x, -h / 2 + h * p.y]
  })
  return [new Konva.Line({ points, closed: true, ...paint(ctx) })]
}
export default build
