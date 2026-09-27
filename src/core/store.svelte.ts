// 專案狀態（單一來源）。存檔、自動暫存、復原／重做都是對 project 做快照。

import { CANVAS_MAX, CANVAS_PRESETS, type CanvasSpec } from './canvas'
import { roleOf, type Block } from './blocks'
import type { Rect } from './geometry'
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
  blocks: { items: Block[] }
  visibility: {
    composition: boolean
    anchors: boolean
    guides: boolean
    blocks: boolean
    /** 第三層：在畫布上同時預覽所有建議區塊（關閉時只預覽滑鼠指到的那一個） */
    suggestions: boolean
  }
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
    blocks: { items: [] },
    visibility: { composition: true, anchors: true, guides: true, blocks: true, suggestions: false },
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
  project.blocks = {
    items: (data.blocks?.items ?? []).map((b) => ({ ...defaultBlock(), ...b, role: roleOf(b.role).id })),
  }
  project.visibility = { ...base.visibility, ...data.visibility }
}

// ── 第二層：視覺引導的操作 ──────────────────────────────

/** 介面狀態（不存檔、不進復原紀錄）。 */
export const ui = $state({
  selectedGuide: null as string | null,
  selectedBlock: null as string | null,
  /** 滑鼠指到的建議區塊（在畫布上預覽） */
  hoverSuggestion: null as number | null,
})

const uid = () => Math.random().toString(36).slice(2, 10)

export const addGuide = discrete((templateId: string) => {
  const t = guideTemplates.find((x) => x.id === templateId)
  if (!t) return
  const item: GuideItem = { uid: uid(), templateId, params: clone(t.defaults), orientation: { ...IDENTITY }, visible: true }
  project.guides.items.push(item)
  ui.selectedGuide = item.uid
})

export const removeGuide = discrete((id: string) => {
  project.guides.items = project.guides.items.filter((g) => g.uid !== id)
  if (ui.selectedGuide === id) ui.selectedGuide = project.guides.items.at(-1)?.uid ?? null
})

// ── 復原紀錄的掛鉤 ──────────────────────────────────────

/**
 * 由 history 在初始化時填入。新增、刪除、複製這類「一次性」動作前後各記一次，
 * 避免和前後的連續操作（拖曳滑桿等）合併成同一步復原。
 */
export const historyHooks = { checkpoint: () => {} }

function discrete<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  return (...args) => {
    historyHooks.checkpoint()
    const r = fn(...args)
    historyHooks.checkpoint()
    return r
  }
}

// ── 第三層：區塊的操作 ──────────────────────────────────

function defaultBlock(): Block {
  return { uid: uid(), name: '', role: 'subject', x: 0.35, y: 0.35, w: 0.3, h: 0.3, filled: false, color: '', opacity: 0.25, visible: true }
}

/** 新增區塊（rect 為 0–1 相對座標）。回傳新區塊的 uid。 */
export const addBlock = discrete((rect: Rect | null = null, role: string = 'subject', name: string = ''): string => {
  const r = roleOf(role)
  const n = project.blocks.items.filter((b) => b.role === r.id).length + 1
  const b: Block = { ...defaultBlock(), ...(rect ?? {}), role: r.id, color: r.color, name: name || `${r.label} ${n}` }
  project.blocks.items.push(b)
  ui.selectedBlock = b.uid
  return b.uid
})

export function updateBlock(id: string, patch: Partial<Block>) {
  const b = project.blocks.items.find((x) => x.uid === id)
  if (b) Object.assign(b, patch)
}

export const removeBlock = discrete((id: string) => {
  project.blocks.items = project.blocks.items.filter((b) => b.uid !== id)
  if (ui.selectedBlock === id) ui.selectedBlock = null
})

export const duplicateBlock = discrete((id: string) => {
  const b = project.blocks.items.find((x) => x.uid === id)
  if (!b) return
  const copy = { ...clone(b), uid: uid(), name: `${b.name} 副本`, x: Math.min(1 - b.w, b.x + 0.02), y: Math.min(1 - b.h, b.y + 0.02) }
  project.blocks.items.push(copy)
  ui.selectedBlock = copy.uid
})

/** 調整疊放順序：+1 往上一層，-1 往下一層。 */
export const moveBlock = discrete((id: string, dir: 1 | -1) => {
  const items = project.blocks.items
  const i = items.findIndex((b) => b.uid === id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= items.length) return
  ;[items[i], items[j]] = [items[j], items[i]]
})

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
