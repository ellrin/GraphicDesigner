// 把圖元畫到 Konva 上。線寬以螢幕像素計（不隨畫布縮放），
// 所以無論畫布是 90mm 名片或 1920px 橫幅，引導線看起來都一樣粗。

import Konva from 'konva'
import type { Anchor, Primitive } from '../core/geometry'

export interface GuideStyle {
  mainColor: string
  subColor: string
  main: number
  sub: number
  subOpacity: number
  /** 一般引導線的虛線樣式；空陣列 = 實線。 */
  dash: number[]
  /** 圖元標記 dashed 時使用的細虛線。 */
  fineDash: number[]
}

function shapeOf(p: Primitive, style: GuideStyle): Konva.Shape {
  const sub = p.weight === 'sub'
  const dash = p.dashed ? style.fineDash : style.dash
  const common = {
    stroke: sub ? style.subColor : style.mainColor,
    strokeWidth: sub ? style.sub : style.main,
    opacity: sub ? style.subOpacity : 1,
    dash: dash.length ? dash : undefined,
    strokeScaleEnabled: false,
    listening: false,
    lineJoin: 'round' as const,
    lineCap: 'round' as const,
  }
  switch (p.kind) {
    case 'line':
      return new Konva.Line({ ...common, points: [p.a.x, p.a.y, p.b.x, p.b.y] })
    case 'polyline':
      return new Konva.Line({ ...common, points: p.points.flatMap((q) => [q.x, q.y]), closed: p.closed })
    case 'circle':
      return new Konva.Circle({ ...common, x: p.c.x, y: p.c.y, radius: p.r })
  }
}

export function drawPrimitives(group: Konva.Group, primitives: Primitive[], style: GuideStyle) {
  group.destroyChildren()
  for (const p of primitives) group.add(shapeOf(p, style))
}

/** 錨點以固定螢幕大小的圓點表示（需傳入目前縮放倍率以抵銷）。 */
export function drawAnchors(group: Konva.Group, anchors: Anchor[], color: string, radius: number, scale: number) {
  group.destroyChildren()
  for (const a of anchors) {
    group.add(
      new Konva.Circle({
        x: a.x,
        y: a.y,
        radius: radius / scale,
        fill: color,
        stroke: '#fff',
        strokeWidth: 1.5,
        strokeScaleEnabled: false,
        listening: false,
      }),
    )
  }
}
