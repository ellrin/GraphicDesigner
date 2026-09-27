import Konva from 'konva'
import type { ShapeBuilder } from '../index'
import { paint } from '../style'

const build: ShapeBuilder = (ctx) => [new Konva.Ellipse({ radiusX: ctx.w / 2, radiusY: ctx.h / 2, ...paint(ctx) })]
export default build
