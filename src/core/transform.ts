// 方向變換（旋轉 0/90/180/270 + 水平/垂直翻轉）由核心統一處理，版型不需要自己實作。
//
// 做法：旋轉 90/270 度時，版型在「長寬對調」的畫框中生成，再轉回畫布，
// 所以圖形永遠剛好貼合畫布，不會轉出界。

import type { Frame, GuideOutput, Primitive, Pt } from './geometry'

export type Rotation = 0 | 90 | 180 | 270

export interface Orientation {
  rotate: Rotation
  flipH: boolean
  flipV: boolean
}

export const IDENTITY: Orientation = { rotate: 0, flipH: false, flipV: false }

/** 版型實際生成時使用的畫框。 */
export function generationFrame(canvas: Frame, o: Orientation): Frame {
  return o.rotate % 180 === 0 ? canvas : { w: canvas.h, h: canvas.w }
}

/** 先在生成畫框中翻轉，再順時針旋轉到畫布座標。 */
export function mapPoint(p: Pt, gen: Frame, o: Orientation): Pt {
  const x = o.flipH ? gen.w - p.x : p.x
  const y = o.flipV ? gen.h - p.y : p.y
  switch (o.rotate) {
    case 0:
      return { x, y }
    case 90:
      return { x: gen.h - y, y: x }
    case 180:
      return { x: gen.w - x, y: gen.h - y }
    case 270:
      return { x: y, y: gen.w - x }
  }
}

function mapPrimitive(p: Primitive, gen: Frame, o: Orientation): Primitive {
  const m = (q: Pt) => mapPoint(q, gen, o)
  switch (p.kind) {
    case 'line':
      return { ...p, a: m(p.a), b: m(p.b) }
    case 'polyline':
      return { ...p, points: p.points.map(m) }
    case 'circle':
      return { ...p, c: m(p.c) }
  }
}

export function applyOrientation(out: GuideOutput, gen: Frame, o: Orientation): GuideOutput {
  return {
    primitives: out.primitives.map((p) => mapPrimitive(p, gen, o)),
    anchors: out.anchors.map((a) => ({ ...a, ...mapPoint(a, gen, o) })),
  }
}

export const rotateClockwise = (o: Orientation): Orientation => ({
  ...o,
  rotate: ((o.rotate + 90) % 360) as Rotation,
})
