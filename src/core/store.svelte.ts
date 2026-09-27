// 專案狀態（單一來源）。存檔、自動暫存、復原／重做都是對 project 做快照。

import { CANVAS_MAX, CANVAS_PRESETS, type CanvasSpec } from './canvas'
import { IDENTITY, type Orientation } from './transform'
import type { ParamValues } from './params'
import type { Template } from './registry'
import { STEPS, type StepDef } from '../config/steps'
import { compositionTemplates } from '../layers/1-composition/templates'
import { guideTemplates } from '../layers/2-guides/templates'

/** 第二層可疊加多條視覺引導，每條是一個實例。 */
export interface GuideItem {
  uid: string
  templateId: string
  params: ParamValues
  orientation: Orientation
  visible: boolean
}

export interface ProjectData {
  canvas: CanvasSpec
  composition: {
    templateId: string
    orientation: Orientation
    /** 每個版型各自記住參數，切換版型後切回來不會遺失。 */
    params: Record<string, ParamValues>
  }
  guides: { items: GuideItem[] }
  visibility: { composition: boolean; anchors: boolean; guides: boolean }
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

export function newProject(): ProjectData {
  const preset = CANVAS_PRESETS.find((p) => p.id === '16x9') ?? CANVAS_PRESETS[0]
  return {
    canvas: { presetId: preset.id, w: preset.w, h: preset.h, unit: preset.unit },
    composition: {
      templateId: compositionTemplates[0].id,
      orientation: { ...IDENTITY },
      params: Object.fromEntries(compositionTemplates.map((t) => [t.id, clone(t.defaults)])),
    },
    guides: { items: [] },
    visibility: { composition: true, anchors: true, guides: true },
  }
}

export const project = $state<ProjectData>(newProject())

/**
 * 以外部資料（存檔、暫存、復原）取代目前專案。
 * 與預設值合併，所以舊存檔在新增版型或參數後仍可開啟；不存在的版型會被略過。
 */
export function replaceProject(data: ProjectData) {
  const base = newProject()
  const withDefaults = (t: Template | undefined, p: ParamValues | undefined) => ({ ...clone(t?.defaults ?? {}), ...(p ?? {}) })

  const size = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= CANVAS_MAX ? v : fallback
  project.canvas = {
    presetId: data.canvas?.presetId ?? null,
    unit: data.canvas?.unit === 'mm' ? 'mm' : 'px',
    w: size(data.canvas?.w, base.canvas.w),
    h: size(data.canvas?.h, base.canvas.h),
  }
  project.composition = {
    templateId: compositionTemplates.some((t) => t.id === data.composition?.templateId)
      ? data.composition.templateId
      : base.composition.templateId,
    orientation: { ...IDENTITY, ...data.composition?.orientation },
    params: Object.fromEntries(
      compositionTemplates.map((t) => [t.id, withDefaults(t, data.composition?.params?.[t.id])]),
    ),
  }
  project.guides = {
    items: (data.guides?.items ?? [])
      .filter((g) => guideTemplates.some((t) => t.id === g.templateId))
      .map((g) => ({
        uid: g.uid,
        templateId: g.templateId,
        visible: g.visible ?? true,
        orientation: { ...IDENTITY, ...g.orientation },
        params: withDefaults(guideTemplates.find((t) => t.id === g.templateId), g.params),
      })),
  }
  project.visibility = { ...base.visibility, ...data.visibility }
}

// ── 第二層：視覺引導的操作 ──────────────────────────────

/** 介面狀態（不存檔、不進復原紀錄）。 */
export const ui = $state({ selectedGuide: null as string | null })

const uid = () => Math.random().toString(36).slice(2, 10)

export function addGuide(templateId: string) {
  const t = guideTemplates.find((x) => x.id === templateId)
  if (!t) return
  const item: GuideItem = { uid: uid(), templateId, params: clone(t.defaults), orientation: { ...IDENTITY }, visible: true }
  project.guides.items.push(item)
  ui.selectedGuide = item.uid
}

export function removeGuide(id: string) {
  project.guides.items = project.guides.items.filter((g) => g.uid !== id)
  if (ui.selectedGuide === id) ui.selectedGuide = project.guides.items.at(-1)?.uid ?? null
}

// ── 線性流程 ────────────────────────────────────────────

/** current = 目前所在步驟，reached = 已解鎖到的最遠步驟。 */
export const flow = $state({ current: 0, reached: 0 })

// 開發用：網址加 #step=3 可直接跳到第 4 步（只在 npm run dev 有效）
if (import.meta.env.DEV) {
  const m = location.hash.match(/step=(\d)/)
  if (m) flow.current = flow.reached = Math.min(Number(m[1]), STEPS.length - 1)
}

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
