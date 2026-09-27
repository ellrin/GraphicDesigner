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
