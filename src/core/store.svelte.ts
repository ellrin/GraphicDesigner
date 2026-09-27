// 專案狀態（單一來源）。存檔、自動暫存、復原／重做都是對 project 做快照。

import { CANVAS_MAX, CANVAS_PRESETS, type CanvasSpec } from './canvas'
import { roleOf, type Block } from './blocks'
import type { Pt, Rect } from './geometry'
import { DEFAULT_BACKGROUND, type Background, type DesignObject } from './objects'
import { objectTypeOf } from '../layers/4-objects/types'
import { TEXT_DEFAULTS } from '../layers/4-objects/types/text/shape'
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
  /** 陣列順序 = 疊放順序（後面的在上層） */
  objects: { items: DesignObject[] }
  background: Background
  visibility: {
    composition: boolean
    anchors: boolean
    guides: boolean
    blocks: boolean
    objects: boolean
    /** 輔助線（構圖、引導、錨點、區塊）疊在物件上方；false 時放在物件下方 */
    guidesOnTop: boolean
    /** 輔助線的不透明度 0–1 */
    guideOpacity: number
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
    objects: { items: [] },
    background: { ...DEFAULT_BACKGROUND },
    visibility: {
      composition: true,
      anchors: true,
      guides: true,
      blocks: true,
      objects: true,
      guidesOnTop: true,
      guideOpacity: 1,
      suggestions: false,
    },
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
  project.objects = {
    items: (data.objects?.items ?? [])
      .filter((o) => objectTypeOf(o.type))
      .map((o) => ({ ...o, props: { ...objectDefaultProps(o.type), ...o.props } })),
  }
  project.background = { ...DEFAULT_BACKGROUND, ...data.background }
  project.visibility = { ...base.visibility, ...data.visibility }
}

// ── 第二層：視覺引導的操作 ──────────────────────────────

/** 介面狀態（不存檔、不進復原紀錄）。 */
export const ui = $state({
  selectedGuide: null as string | null,
  selectedBlock: null as string | null,
  /** 滑鼠指到的建議區塊（在畫布上預覽） */
  hoverSuggestion: null as number | null,
  selectedObject: null as string | null,
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

// ── 第四層：物件的操作 ──────────────────────────────────

function objectDefaultProps(type: string): ParamValues {
  const t = objectTypeOf(type)
  return { ...(type === 'text' ? TEXT_DEFAULTS : {}), ...clone(t?.defaults ?? {}) }
}

/**
 * 新增物件的放置方式：
 * - rect：放進指定範圍（例如區塊），物件框等於該範圍
 * - center：以該點為中心（例如錨點），使用預設尺寸
 * - 都沒有：放在畫布中央
 * 座標皆為 0–1 相對值。
 */
export interface Placement {
  rect?: Rect
  center?: Pt
}

export const addObject = discrete((type: string, placement: Placement = {}, props: ParamValues = {}, name: string = ''): string | null => {
  const t = objectTypeOf(type)
  if (!t) return null
  const c = project.canvas
  const short = Math.min(c.w, c.h)
  // 預設尺寸以畫布短邊為單位，換算成 0–1 相對值
  let w = (t.meta.size[0] * short) / c.w
  let h = (t.meta.size[1] * short) / c.h
  let x: number
  let y: number
  if (placement.rect) {
    ;({ x, y, w, h } = placement.rect)
  } else {
    const ctr = placement.center ?? { x: 0.5, y: 0.5 }
    x = ctr.x - w / 2
    y = ctr.y - h / 2
  }
  const n = project.objects.items.filter((o) => o.type === type).length + 1
  const o: DesignObject = {
    uid: uid(),
    type,
    name: name || `${t.meta.name} ${n}`,
    x,
    y,
    w,
    h,
    rotation: 0,
    fill: t.meta.fill ?? '#2f6bff',
    stroke: t.meta.stroke ?? '',
    strokeWidth: t.meta.strokeWidth ?? 0.004,
    opacity: 1,
    visible: true,
    props: { ...objectDefaultProps(type), ...props },
  }
  project.objects.items.push(o)
  ui.selectedObject = o.uid
  return o.uid
})

export function updateObject(id: string, patch: Partial<DesignObject>) {
  const o = project.objects.items.find((x) => x.uid === id)
  if (o) Object.assign(o, patch)
}

export const removeObject = discrete((id: string) => {
  project.objects.items = project.objects.items.filter((o) => o.uid !== id)
  if (ui.selectedObject === id) ui.selectedObject = null
})

export const duplicateObject = discrete((id: string) => {
  const o = project.objects.items.find((x) => x.uid === id)
  if (!o) return
  const copy = { ...clone(o), uid: uid(), name: `${o.name} 副本`, x: o.x + 0.02, y: o.y + 0.02 }
  project.objects.items.push(copy)
  ui.selectedObject = copy.uid
})

/** 疊放順序：+1 上移、-1 下移、'top' 移到最上、'bottom' 移到最下。 */
export const moveObject = discrete((id: string, dir: 1 | -1 | 'top' | 'bottom') => {
  const items = project.objects.items
  const i = items.findIndex((o) => o.uid === id)
  if (i < 0) return
  if (dir === 'top' || dir === 'bottom') {
    const [o] = items.splice(i, 1)
    if (dir === 'top') items.push(o)
    else items.unshift(o)
    return
  }
  const j = i + dir
  if (j < 0 || j >= items.length) return
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
