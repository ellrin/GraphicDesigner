// 由「版型 + 畫布 + 參數 + 方向」算出最終圖元，並處理位置參數（控制點）的座標換算。
// 所有圖層共用。

import type { Frame, GuideOutput, Pt } from './geometry'
import type { ParamSpec, ParamValues, PointValue } from './params'
import type { Template } from './registry'
import { applyOrientation, generationFrame, mapPoint, unmapPoint, type Orientation } from './transform'

type PointSpec = Extract<ParamSpec, { type: 'point' }>

const UNIT: Frame = { w: 1, h: 1 }

/** 參數中的 0–1 值 → 生成畫框中的 0–1 值（畫布座標的參數要先反向套用翻轉旋轉）。 */
function toFrameFraction(spec: PointSpec, v: PointValue, o: Orientation): PointValue {
  return spec.space === 'canvas' ? unmapPoint(v, UNIT, o) : v
}

/** 把 point 參數從 0–1 相對值換成生成畫框座標，版型拿到的就是實際座標。 */
function resolveParams(t: Template, gen: Frame, params: ParamValues, o: Orientation): ParamValues {
  const out: ParamValues = { ...t.defaults, ...params }
  for (const [key, spec] of Object.entries(t.params)) {
    if (spec.type !== 'point') continue
    const f = toFrameFraction(spec, out[key] as PointValue, o)
    out[key] = { x: f.x * gen.w, y: f.y * gen.h }
  }
  return out
}

export function computeTemplate(t: Template, canvas: Frame, params: ParamValues, o: Orientation): GuideOutput {
  const gen = generationFrame(canvas, o)
  return applyOrientation(t.generate(gen, resolveParams(t, gen, params, o)), gen, o)
}

export interface Handle {
  key: string
  label: string
  /** 畫布座標 */
  pos: Pt
}

/** 版型中所有要顯示控制點的 point 參數在畫布上的位置。 */
export function handlesOf(t: Template, canvas: Frame, params: ParamValues, o: Orientation): Handle[] {
  const gen = generationFrame(canvas, o)
  const values = { ...t.defaults, ...params }
  const out: Handle[] = []
  for (const [key, spec] of Object.entries(t.params)) {
    if (spec.type !== 'point' || spec.handle === false) continue
    const v = values[key] as PointValue
    const pos =
      spec.space === 'canvas'
        ? { x: v.x * canvas.w, y: v.y * canvas.h }
        : mapPoint({ x: v.x * gen.w, y: v.y * gen.h }, gen, o)
    out.push({ key, label: spec.label, pos })
  }
  return out
}

/** 拖曳後的畫布座標 → point 參數值（0–1 相對值，並限制在參數允許的範圍內）。 */
export function pointParamFromCanvas(t: Template, key: string, p: Pt, canvas: Frame, o: Orientation): PointValue {
  const spec = t.params[key]
  if (spec.type !== 'point') throw new Error(`參數 ${key} 不是 point`)
  const lo = spec.min ?? 0
  const hi = spec.max ?? 1
  const clamp = (n: number) => Math.round(Math.min(hi, Math.max(lo, n)) * 1000) / 1000
  if (spec.space === 'canvas') return { x: clamp(p.x / canvas.w), y: clamp(p.y / canvas.h) }
  const gen = generationFrame(canvas, o)
  const q = unmapPoint(p, gen, o)
  return { x: clamp(q.x / gen.w), y: clamp(q.y / gen.h) }
}
