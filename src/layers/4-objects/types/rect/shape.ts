import Konva from 'konva'
import type { ShapeBuilder } from '../index'
import { paint } from '../style'

const build: ShapeBuilder = (ctx) => [
  new Konva.Rect({
    x: -ctx.w / 2,
    y: -ctx.h / 2,
    width: ctx.w,
    height: ctx.h,
    cornerRadius: (Math.min(ctx.w, ctx.h) / 2) * (ctx.props.radius as number),
    ...paint(ctx),
  }),
]
export default build
