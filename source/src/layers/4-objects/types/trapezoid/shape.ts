import Konva from 'konva'
import type { ShapeBuilder } from '../index'
import { paint } from '../style'

// 梯形：上底、下底寬度（相對物件框）與傾斜。傾斜把上底推向一側、下底推向另一側；
// 上下同寬且有傾斜 = 平行四邊形，傾斜 0 = 等腰梯形
const build: ShapeBuilder = (ctx) => {
  const { w, h, props: p } = ctx
  const top = Number(p.top)
  const bottom = Number(p.bottom)
  const s = Number(p.skew)
  const tl = ((1 - top) / 2) * (1 + s)
  const bl = ((1 - bottom) / 2) * (1 - s)
  const x = (u: number) => -w / 2 + u * w
  return [new Konva.Line({ points: [x(tl), -h / 2, x(tl + top), -h / 2, x(bl + bottom), h / 2, x(bl), h / 2], closed: true, ...paint(ctx) })]
}
export default build
