import { luminance } from '../../../core/color'
import type { ShapeContext } from './index'

/** 各形狀共用的填色與框線設定（空字串 = 不填色／無框線）。 */
export function paint(ctx: ShapeContext) {
  return {
    fill: ctx.fill || undefined,
    fillEnabled: !!ctx.fill,
    stroke: ctx.stroke || undefined,
    strokeEnabled: !!ctx.stroke && ctx.strokeWidth > 0,
    strokeWidth: ctx.strokeWidth,
    lineJoin: 'round' as const,
  }
}

/** 內接於物件框的正多邊形頂點（可指定內外半徑交錯，用於星形）。 */
export function radialPoints(w: number, h: number, count: number, inner = 1, rotation = -Math.PI / 2): number[] {
  const pts: number[] = []
  const n = inner === 1 ? count : count * 2
  for (let i = 0; i < n; i++) {
    const a = rotation + (2 * Math.PI * i) / n
    const r = inner !== 1 && i % 2 === 1 ? inner : 1
    pts.push((Math.cos(a) * r * w) / 2, (Math.sin(a) * r * h) / 2)
  }
  return pts
}

/** 固定種子的亂數（同一個種子每次畫出來都一樣，換種子就換一個樣子） */
export function rng(seed: number): () => number {
  let a = Math.floor(seed) * 2654435761 + 1
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 多色裝飾使用的顏色：配色中去掉接近純白、純黑的顏色 */
export function paletteCycle(ctx: ShapeContext): string[] {
  const cs = ctx.palette.filter((c) => {
    const l = luminance(c)
    return l > 0.02 && l < 0.88
  })
  return cs.length ? cs : ctx.palette
}

/** 第 i 個部件的顏色：勾選多色且有配色時輪流使用配色，否則用物件的填色／框線色 */
export function partColors(ctx: ShapeContext, i: number): { fill: string; stroke: string } {
  const cs = ctx.props.multicolor ? paletteCycle(ctx) : []
  if (!cs.length) return { fill: ctx.fill, stroke: ctx.stroke }
  const c = cs[i % cs.length]
  return { fill: ctx.fill ? c : '', stroke: ctx.stroke ? c : '' }
}
