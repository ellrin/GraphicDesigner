// 由「版型 + 畫布 + 參數 + 方向」算出最終圖元，並處理位置參數（控制點）的座標換算。
// 所有圖層共用。

import type { Frame, GuideOutput, Pt } from './geometry'
import type { ParamValues, PointValue } from './params'
import type { Template } from './registry'
import { applyOrientation, generationFrame, mapPoint, unmapPoint, type Orientation } from './transform'

/** 把 point 參數從 0–1 相對值換成生成畫框座標，版型拿到的就是實際座標。 */
function resolveParams(t: Template, gen: Frame, params: ParamValues): ParamValues {
  const out: ParamValues = { ...t.defaults, ...params }
  for (const [key, spec] of Object.entries(t.params)) {
    if (spec.type !== 'point') continue
    const v = out[key] as PointValue
    out[key] = { x: v.x * gen.w, y: v.y * gen.h }
  }
  return out
}

export function computeTemplate(t: Template, canvas: Frame, params: ParamValues, o: Orientation): GuideOutput {
  const gen = generationFrame(canvas, o)
  return applyOrientation(t.generate(gen, resolveParams(t, gen, params)), gen, o)
}

export interface Handle {
  key: string
  label: string
  /** 畫布座標 */
  pos: Pt
}

/** 版型中所有 point 參數在畫布上的位置。 */
export function handlesOf(t: Template, canvas: Frame, params: ParamValues, o: Orientation): Handle[] {
  const gen = generationFrame(canvas, o)
  const values = { ...t.defaults, ...params }
  return Object.entries(t.params)
    .filter(([, spec]) => spec.type === 'point')
    .map(([key, spec]) => {
      const v = values[key] as PointValue
      return { key, label: spec.label, pos: mapPoint({ x: v.x * gen.w, y: v.y * gen.h }, gen, o) }
    })
}

/** 拖曳後的畫布座標 → point 參數值（0–1 相對值，並限制在參數允許的範圍內）。 */
export function pointParamFromCanvas(t: Template, key: string, p: Pt, canvas: Frame, o: Orientation): PointValue {
  const spec = t.params[key]
  const lo = spec.type === 'point' ? (spec.min ?? 0) : 0
  const hi = spec.type === 'point' ? (spec.max ?? 1) : 1
  const gen = generationFrame(canvas, o)
  const q = unmapPoint(p, gen, o)
  const clamp = (n: number) => Math.round(Math.min(hi, Math.max(lo, n)) * 1000) / 1000
  return { x: clamp(q.x / gen.w), y: clamp(q.y / gen.h) }
}
