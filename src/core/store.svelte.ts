// 專案狀態（單一來源）。之後的存檔／讀檔就是把 project 序列化成 JSON。

import { CANVAS_PRESETS, type CanvasSpec } from './canvas'
import { IDENTITY, type Orientation } from './transform'
import type { ParamValues } from './params'
import { STEPS, type StepDef } from '../config/steps'
import { compositionTemplates } from '../layers/1-composition/templates'

const firstPreset = CANVAS_PRESETS.find((p) => p.id === '16x9') ?? CANVAS_PRESETS[0]
const firstTemplate = compositionTemplates[0]

export const project = $state({
  canvas: {
    presetId: firstPreset.id,
    w: firstPreset.w,
    h: firstPreset.h,
    unit: firstPreset.unit,
  } as CanvasSpec,
  composition: {
    templateId: firstTemplate.id,
    orientation: { ...IDENTITY } as Orientation,
    /** 每個版型各自記住參數，切換版型後切回來不會遺失。 */
    params: Object.fromEntries(compositionTemplates.map((t) => [t.id, { ...t.defaults }])) as Record<
      string,
      ParamValues
    >,
  },
  visibility: {
    composition: true,
    anchors: true,
  },
})

/** 線性流程：current = 目前所在步驟，reached = 已解鎖到的最遠步驟。 */
export const flow = $state({ current: 0, reached: 0 })

export function goToStep(i: number) {
  if (i <= flow.reached) flow.current = i
}

export function completeStep() {
  const next = flow.current + 1
  if (next >= STEPS.length) return
  flow.reached = Math.max(flow.reached, next)
  flow.current = next
}

export const currentStep = (): StepDef => STEPS[flow.current]
