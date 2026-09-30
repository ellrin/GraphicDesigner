import Konva from 'konva'
import type { Pt } from '../../../../core/geometry'
import type { ShapeBuilder } from '../index'
import { paint } from '../style'

/** 矩形的四個角（物件框內 0–1 相對位置），可在畫布上拖曳調整，拉成任意四邊形 */
export const RECT_CORNERS = ['tl', 'tr', 'br', 'bl'] as const
const DEFAULT_CORNERS: Record<(typeof RECT_CORNERS)[number], Pt> = { tl: { x: 0, y: 0 }, tr: { x: 1, y: 0 }, br: { x: 1, y: 1 }, bl: { x: 0, y: 1 } }

const build: ShapeBuilder = (ctx) => {
  const { w, h } = ctx
  const pts = RECT_CORNERS.map((k) => {
    const p = (ctx.props[k] as Pt | undefined) ?? DEFAULT_CORNERS[k]
    return { x: -w / 2 + w * p.x, y: -h / 2 + h * p.y }
  })
  const r = (Math.min(w, h) / 2) * Number(ctx.props.radius ?? 0)
  return [
    new Konva.Shape({
      ...paint(ctx),
      sceneFunc: (c, shape) => {
        c.beginPath()
        pts.forEach((p, i) => {
          const prev = pts[(i + 3) % 4]
          const next = pts[(i + 1) % 4]
          // 圓角不超過相鄰兩邊較短者的一半
          const rr = Math.min(r, Math.hypot(p.x - prev.x, p.y - prev.y) / 2, Math.hypot(next.x - p.x, next.y - p.y) / 2)
          const start = { x: (prev.x + p.x) / 2, y: (prev.y + p.y) / 2 }
          if (i === 0) c.moveTo(start.x, start.y)
          c.arcTo(p.x, p.y, next.x, next.y, rr)
        })
        c.closePath()
        c.fillStrokeShape(shape)
      },
    }),
  ]
}
export default build
