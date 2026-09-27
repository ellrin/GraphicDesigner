import Konva from 'konva'
import { fitImage, type ImageFit, type ImageFraming } from '../../../../core/objects'
import type { ShapeBuilder } from '../index'

// 圖片：依 fit 放進物件框（cover 會裁切超出的部分，裁切由物件群組負責）
const build: ShapeBuilder = (ctx) => {
  const { w, h, image } = ctx
  if (!image) {
    // 圖片尚未載入或遺失：顯示佔位框
    return [
      new Konva.Rect({ x: -w / 2, y: -h / 2, width: w, height: h, fill: '#e9e7e3', stroke: '#b8b3aa', strokeWidth: Math.min(w, h) * 0.01, dash: [8, 6] }),
    ]
  }
  const r = fitImage(image.naturalWidth, image.naturalHeight, w, h, ctx.props.fit as ImageFit, ctx.props as unknown as ImageFraming)
  const shapes: Konva.Shape[] = [new Konva.Image({ image, x: -w / 2 + r.x, y: -h / 2 + r.y, width: r.w, height: r.h })]
  if (ctx.stroke && ctx.strokeWidth > 0) {
    shapes.push(new Konva.Rect({ x: -w / 2, y: -h / 2, width: w, height: h, stroke: ctx.stroke, strokeWidth: ctx.strokeWidth }))
  }
  return shapes
}
export default build
