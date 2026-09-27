import Konva from 'konva'
import type { ShapeBuilder } from '../index'
import { paint, radialPoints } from '../style'

const build: ShapeBuilder = (ctx) => [
  new Konva.Line({ points: radialPoints(ctx.w, ctx.h, ctx.props.sides as number), closed: true, ...paint(ctx) }),
]
export default build
