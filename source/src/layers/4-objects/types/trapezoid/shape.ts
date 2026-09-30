import Konva from 'konva'
import type { Pt } from '../../../../core/geometry'
import type { ParamValues } from '../../../../core/params'
import type { ShapeBuilder } from '../index'
import { paint } from '../style'

/** 梯形的四個角（物件框內 0–1 相對位置），可在畫布上拖曳調整 */
export const TRAPEZOID_CORNERS = ['tl', 'tr', 'br', 'bl'] as const

/** 舊版存檔用上底、下底、傾斜描述梯形，換算成四個角 */
export function trapezoidCorners(p: ParamValues): Record<(typeof TRAPEZOID_CORNERS)[number], Pt> {
  const top = Number(p.top ?? 0.6)
  const bottom = Number(p.bottom ?? 1)
  const s = Number(p.skew ?? 0)
  const tl = ((1 - top) / 2) * (1 + s)
  const bl = ((1 - bottom) / 2) * (1 - s)
  return { tl: { x: tl, y: 0 }, tr: { x: tl + top, y: 0 }, br: { x: bl + bottom, y: 1 }, bl: { x: bl, y: 1 } }
}

const build: ShapeBuilder = (ctx) => {
  const { w, h } = ctx
  const points = TRAPEZOID_CORNERS.flatMap((k) => {
    const p = ctx.props[k] as Pt
    return [-w / 2 + w * p.x, -h / 2 + h * p.y]
  })
  return [new Konva.Line({ points, closed: true, ...paint(ctx) })]
}
export default build
