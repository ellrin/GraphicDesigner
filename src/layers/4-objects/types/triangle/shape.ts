import Konva from 'konva'
import type { ShapeBuilder } from '../index'
import { paint } from '../style'

const build: ShapeBuilder = (ctx) => {
  const { w, h } = ctx
  const apex = -w / 2 + w * (ctx.props.apex as number)
  return [new Konva.Line({ points: [apex, -h / 2, w / 2, h / 2, -w / 2, h / 2], closed: true, ...paint(ctx) })]
}
export default build
