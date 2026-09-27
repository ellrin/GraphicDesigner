// 方向變換（旋轉 0/90/180/270 + 水平/垂直翻轉）由核心統一處理，版型不需要自己實作。
//
// 做法：旋轉 90/270 度時，版型在「長寬對調」的畫框中生成，再轉回畫布，
// 所以圖形永遠剛好貼合畫布，不會轉出界。

import type { Frame, GuideOutput, Primitive, Pt, Region } from './geometry'

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

/** mapPoint 的反向：畫布座標 → 生成畫框座標（拖曳控制點時使用）。 */
export function unmapPoint(p: Pt, gen: Frame, o: Orientation): Pt {
  let x: number
  let y: number
  switch (o.rotate) {
    case 0:
      ;[x, y] = [p.x, p.y]
      break
    case 90:
      ;[x, y] = [p.y, gen.h - p.x]
      break
    case 180:
      ;[x, y] = [gen.w - p.x, gen.h - p.y]
      break
    case 270:
      ;[x, y] = [gen.w - p.y, p.x]
      break
  }
  return { x: o.flipH ? gen.w - x : x, y: o.flipV ? gen.h - y : y }
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
    case 'text':
      return { ...p, at: m(p.at) }
  }
}

/** 矩形經過旋轉 90° 倍數與翻轉後仍是矩形：轉換兩個對角再取範圍。 */
function mapRegion(r: Region, gen: Frame, o: Orientation): Region {
  const a = mapPoint({ x: r.x, y: r.y }, gen, o)
  const b = mapPoint({ x: r.x + r.w, y: r.y + r.h }, gen, o)
  return {
    ...r,
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
    points: r.points?.map((p) => mapPoint(p, gen, o)),
  }
}

export function applyOrientation(out: GuideOutput, gen: Frame, o: Orientation): GuideOutput {
  return {
    primitives: out.primitives.map((p) => mapPrimitive(p, gen, o)),
    anchors: out.anchors.map((a) => ({ ...a, ...mapPoint(a, gen, o) })),
    regions: out.regions?.map((r) => mapRegion(r, gen, o)),
  }
}

export const rotateClockwise = (o: Orientation): Orientation => ({
  ...o,
  rotate: ((o.rotate + 90) % 360) as Rotation,
})
