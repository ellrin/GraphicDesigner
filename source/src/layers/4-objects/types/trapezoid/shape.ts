import Konva from 'konva'
import type { Pt } from '../../../../core/geometry'
import type { ParamValues } from '../../../../core/params'
import type { ShapeBuilder } from '../index'
import { paint } from '../style'

// 梯形：上底貼齊物件框上緣、下底貼齊下緣，兩底永遠平行；
// 四個端點的左右位置（物件框內 0–1）可以各自調整，兩底同寬就是平行四邊形

/** 四個角（左上、右上、右下、左下），物件框內 0–1 */
export function trapezoidVertices(p: ParamValues): Pt[] {
  return [
    { x: Number(p.topLeft), y: 0 },
    { x: Number(p.topRight), y: 0 },
    { x: Number(p.bottomRight), y: 1 },
    { x: Number(p.bottomLeft), y: 1 },
  ]
}

/** 拖曳後的四個角 → 參數（上下底對調、左右端對調時自動整理） */
export function trapezoidFromVertices(rel: Pt[]): ParamValues {
  const [a, b, c, d] = rel
  const [top, bottom] = a.y + b.y <= c.y + d.y ? [[a, b], [c, d]] : [[c, d], [a, b]]
  const r = (n: number) => Math.round(n * 1000) / 1000
  return {
    topLeft: r(Math.min(top[0].x, top[1].x)),
    topRight: r(Math.max(top[0].x, top[1].x)),
    bottomLeft: r(Math.min(bottom[0].x, bottom[1].x)),
    bottomRight: r(Math.max(bottom[0].x, bottom[1].x)),
  }
}

/** 舊版存檔：上底、下底、傾斜，或短暫出現過的四個自由角 */
export function trapezoidFromLegacy(p: ParamValues): ParamValues {
  if (typeof p.tl === 'object') return trapezoidFromVertices(['tl', 'tr', 'br', 'bl'].map((k) => p[k] as Pt))
  const top = Number(p.top ?? 0.6)
  const bottom = Number(p.bottom ?? 1)
  const s = Number(p.skew ?? 0)
  const tl = ((1 - top) / 2) * (1 + s)
  const bl = ((1 - bottom) / 2) * (1 - s)
  return { topLeft: tl, topRight: tl + top, bottomLeft: bl, bottomRight: bl + bottom }
}

const build: ShapeBuilder = (ctx) => {
  const { w, h } = ctx
  const points = trapezoidVertices(ctx.props).flatMap((p) => [-w / 2 + w * p.x, -h / 2 + h * p.y])
  return [new Konva.Line({ points, closed: true, ...paint(ctx) })]
}
export default build
