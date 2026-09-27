import Konva from 'konva'
import type { ShapeBuilder } from '../index'

// 分隔線：沿物件框中線畫一條線，顏色與粗細使用「框線」設定
const build: ShapeBuilder = (ctx) => {
  const width = ctx.strokeWidth || 1
  return [
    new Konva.Line({
      points: [-ctx.w / 2, 0, ctx.w / 2, 0],
      stroke: ctx.stroke || '#000',
      strokeWidth: width,
      dash: ctx.props.dashed ? [width * 3, width * 2] : undefined,
      lineCap: ctx.props.round ? 'round' : 'butt',
      // 線很細時仍容易點選
      hitStrokeWidth: Math.max(width, ctx.h),
    }),
  ]
}
export default build
