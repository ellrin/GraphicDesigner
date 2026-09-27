// 專案狀態（單一來源）。存檔、自動暫存、復原／重做都是對 project 做快照。

import { CANVAS_MAX, CANVAS_PRESETS, type CanvasSpec } from './canvas'
import { boundsOfPoints, remapPoints, roleOf, type Block, type BlockShape } from './blocks'
import type { Pt, Rect } from './geometry'
import { DEFAULT_BACKGROUND, type Background, type DesignObject } from './objects'
import { objectTypeOf } from '../layers/4-objects/types'
import { TEXT_DEFAULTS } from '../layers/4-objects/types/text/shape'
import { IDENTITY, type Orientation } from './transform'
import { CANVAS_FRAME, type FrameRef, type TemplateInstance } from './instances'
import { resolveRecipe, toProjectBlocks, type Recipe } from './recipes'
import type { ParamValues } from './params'
import type { Template } from './registry'
import { STEPS, type StepDef } from '../config/steps'
import { compositionTemplates } from '../layers/1-composition/templates'
import { guideTemplates } from '../layers/2-guides/templates'

/** 第二層的視覺引導與第一層的構圖一樣，都是版型實例 */
export type GuideItem = TemplateInstance

export interface ProjectData {
  canvas: CanvasSpec
  /** 第一層：可以有多個構圖，各自套用在整張畫布或某個範圍 */
  compositions: { items: TemplateInstance[] }
  guides: { items: TemplateInstance[] }
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
    // 構圖由使用者在第一步自行選擇
    compositions: { items: [] },
    guides: { items: [] },
    blocks: { items: [] },
    objects: { items: [] },
    background: structuredClone(DEFAULT_BACKGROUND),
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
  const instances = (items: Partial<TemplateInstance>[] | undefined, templates: Template[]): TemplateInstance[] =>
    (items ?? [])
      .filter((g) => templates.some((t) => t.id === g.templateId))
      .map((g) => ({
        uid: g.uid ?? uid(),
        templateId: g.templateId!,
        visible: g.visible ?? true,
        orientation: { ...IDENTITY, ...g.orientation },
        params: withDefaults(templates.find((t) => t.id === g.templateId), g.params),
        frame: g.frame ?? { ...CANVAS_FRAME },
      }))

  // 舊版存檔只有單一構圖（composition），轉成實例清單
  const legacy = (data as unknown as { composition?: { templateId: string; orientation: Orientation; params: Record<string, ParamValues> } }).composition
  const compItems = data.compositions?.items
    ? instances(data.compositions.items, compositionTemplates)
    : legacy
      ? instances([{ templateId: legacy.templateId, orientation: legacy.orientation, params: legacy.params?.[legacy.templateId] }], compositionTemplates)
      : []
  project.compositions = { items: compItems }
  project.guides = { items: instances(data.guides?.items, guideTemplates) }
  project.blocks = {
    items: (data.blocks?.items ?? []).map((b) => ({ ...defaultBlock(), ...b, role: roleOf(b.role).id })),
  }
  project.objects = {
    items: (data.objects?.items ?? [])
      .filter((o) => objectTypeOf(o.type))
      .map((o) => ({ ...o, props: { ...objectDefaultProps(o.type), ...o.props } })),
  }
  project.background = { ...structuredClone(DEFAULT_BACKGROUND), ...data.background }
  project.visibility = { ...base.visibility, ...data.visibility }
}

// ── 第二層：視覺引導的操作 ──────────────────────────────

/** 介面狀態（不存檔、不進復原紀錄）。 */
export const ui = $state({
  selectedComposition: null as string | null,
  selectedGuide: null as string | null,
  selectedBlock: null as string | null,
  /** 第三層在空白處拖曳時畫出的形狀 */
  blockTool: 'rect' as 'rect' | 'ellipse' | 'polygon',
  /** 滑鼠指到的建議區塊（在畫布上預覽） */
  hoverSuggestion: null as number | null,
  /** 選取中的物件（可多選）；最後一個為主要選取 */
  selectedObjects: [] as string[],
  /** 顯示背景照片的主體標記 ⊕（可拖曳對齊錨點） */
  editBackground: false,
  /** 等待使用者在照片上點一下標記主體：'bg' 或圖片物件 uid */
  pickSubject: null as string | null,
})

/** 點選物件：additive（按住 Shift）時切換加入／移除，否則只選這一個；null = 取消全部。 */
export function selectObject(id: string | null, additive = false) {
  if (id === null) ui.selectedObjects = []
  else if (!additive) ui.selectedObjects = [id]
  else if (ui.selectedObjects.includes(id)) ui.selectedObjects = ui.selectedObjects.filter((x) => x !== id)
  else ui.selectedObjects = [...ui.selectedObjects, id]
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function newInstance(t: Template, frame: FrameRef = CANVAS_FRAME): TemplateInstance {
  return { uid: uid(), templateId: t.id, params: clone(t.defaults), orientation: { ...IDENTITY }, visible: true, frame: clone(frame) }
}

/** 把實例換成另一個版型（參數重設為新版型的預設值，範圍不變） */
export const setInstanceTemplate = discrete((inst: TemplateInstance, t: Template) => {
  inst.templateId = t.id
  inst.params = clone(t.defaults)
})

// ── 第一層：構圖實例 ────────────────────────────────────

export const addComposition = discrete((templateId: string, frame: FrameRef = CANVAS_FRAME) => {
  const t = compositionTemplates.find((x) => x.id === templateId)
  if (!t) return
  const item = newInstance(t, frame)
  project.compositions.items.push(item)
  ui.selectedComposition = item.uid
})

export const removeComposition = discrete((id: string) => {
  project.compositions.items = project.compositions.items.filter((g) => g.uid !== id)
  if (ui.selectedComposition === id) ui.selectedComposition = project.compositions.items.at(-1)?.uid ?? null
})

// ── 第二層：視覺引導實例 ────────────────────────────────

export const addGuide = discrete((templateId: string, frame: FrameRef = CANVAS_FRAME) => {
  const t = guideTemplates.find((x) => x.id === templateId)
  if (!t) return
  const item = newInstance(t, frame)
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
  return {
    uid: uid(),
    name: '',
    role: 'subject',
    shape: 'rect',
    x: 0.35,
    y: 0.35,
    w: 0.3,
    h: 0.3,
    filled: false,
    color: '',
    opacity: 0.25,
    visible: true,
  }
}

/** 區塊形狀（0–1 相對座標）：多邊形給 points，橢圓給 shape: 'ellipse' */
export interface BlockGeometry {
  shape?: BlockShape
  points?: Pt[]
}

/** 新增區塊（rect 為 0–1 相對座標；多邊形時以 points 為準）。回傳新區塊的 uid。 */
export const addBlock = discrete(
  (rect: Rect | null = null, role: string = 'subject', name: string = '', geo: BlockGeometry = {}): string => {
    const r = roleOf(role)
    const n = project.blocks.items.filter((b) => b.role === r.id).length + 1
    const points = geo.points && geo.points.length >= 3 ? clone(geo.points) : undefined
    const box = points ? boundsOfPoints(points) : (rect ?? {})
    const b: Block = {
      ...defaultBlock(),
      ...box,
      shape: points ? 'polygon' : (geo.shape ?? 'rect'),
      points,
      role: r.id,
      color: r.color,
      name: name || `${r.label} ${n}`,
    }
    project.blocks.items.push(b)
    ui.selectedBlock = b.uid
    return b.uid
  },
)

/**
 * 更新區塊。外框（x／y／w／h）改變時，多邊形頂點會跟著等比例移動與縮放；
 * 直接給新的頂點時，外框依頂點重新計算。
 */
export function updateBlock(id: string, patch: Partial<Block>) {
  const b = project.blocks.items.find((x) => x.uid === id)
  if (!b) return
  if (patch.points) {
    Object.assign(b, patch, boundsOfPoints(patch.points))
    return
  }
  const boxChanged = ['x', 'y', 'w', 'h'].some((k) => k in patch)
  if (boxChanged && b.shape === 'polygon' && b.points) {
    const from = { x: b.x, y: b.y, w: b.w, h: b.h }
    const to = { x: patch.x ?? b.x, y: patch.y ?? b.y, w: patch.w ?? b.w, h: patch.h ?? b.h }
    b.points = remapPoints(b.points, from, to)
  }
  Object.assign(b, patch)
}

/** 改變區塊形狀：矩形／橢圓互換；轉成多邊形時以外框四個角為頂點 */
export const setBlockShape = discrete((id: string, shape: BlockShape) => {
  const b = project.blocks.items.find((x) => x.uid === id)
  if (!b || b.shape === shape) return
  if (shape === 'polygon' && !b.points) {
    b.points = [
      { x: b.x, y: b.y },
      { x: b.x + b.w, y: b.y },
      { x: b.x + b.w, y: b.y + b.h },
      { x: b.x, y: b.y + b.h },
    ]
  }
  b.shape = shape
})

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
  /** 放進的區塊 uid：圖片會自動用區塊形狀裁切 */
  block?: string
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
    mask: type === 'image' && placement.block ? placement.block : null,
  }
  project.objects.items.push(o)
  ui.selectedObjects = [o.uid]
  return o.uid
})

export function updateObject(id: string, patch: Partial<DesignObject>) {
  const o = project.objects.items.find((x) => x.uid === id)
  if (o) Object.assign(o, patch)
}

/** 一次更新多個物件（對齊、分佈），合併成同一步復原。 */
export const updateObjects = discrete((patches: Map<string, Partial<DesignObject>>) => {
  for (const [id, patch] of patches) updateObject(id, patch)
})

const idList = (ids: string | string[]) => (Array.isArray(ids) ? ids : [ids])

export const removeObject = discrete((ids: string | string[]) => {
  const set = new Set(idList(ids))
  project.objects.items = project.objects.items.filter((o) => !set.has(o.uid))
  ui.selectedObjects = ui.selectedObjects.filter((x) => !set.has(x))
})

export const duplicateObject = discrete((ids: string | string[]) => {
  const copies: string[] = []
  for (const id of idList(ids)) {
    const o = project.objects.items.find((x) => x.uid === id)
    if (!o) continue
    const copy = { ...clone(o), uid: uid(), name: `${o.name} 副本`, x: o.x + 0.02, y: o.y + 0.02 }
    project.objects.items.push(copy)
    copies.push(copy.uid)
  }
  if (copies.length) ui.selectedObjects = copies
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

// ── 畫布尺寸 ────────────────────────────────────────────

/**
 * 改變畫布尺寸。物件以 0–1 相對座標儲存，直接改尺寸會被拉伸變形，所以這裡同時調整物件：
 * 物件中心維持在畫面上的相對位置，大小依「長寬中較小的縮放比」等比例縮放，字級與框線一起縮放。
 * 區塊是版面分割，照畫布比例延伸即可，不調整。
 */
export const resizeCanvas = discrete((w: number, h: number, patch: Partial<CanvasSpec> = {}) => {
  const old = project.canvas
  const f = Math.min(w / old.w, h / old.h)
  const oldShort = Math.min(old.w, old.h)
  const newShort = Math.min(w, h)
  for (const o of project.objects.items) {
    const cx = o.x + o.w / 2
    const cy = o.y + o.h / 2
    const nw = (o.w * old.w * f) / w
    const nh = (o.h * old.h * f) / h
    Object.assign(o, { x: cx - nw / 2, y: cy - nh / 2, w: nw, h: nh })
    o.strokeWidth = (o.strokeWidth * oldShort * f) / newShort
    if (typeof o.props.fontSize === 'number') o.props.fontSize = (o.props.fontSize * old.h * f) / h
  }
  project.canvas = { ...old, ...patch, w, h }
})

// ── 版型範例 ────────────────────────────────────────────

/**
 * 套用版型範例：取代目前的構圖、視覺引導與區塊（物件與背景保留）。
 * withCanvas 為 true 且範例有建議畫布時，先換成該畫布尺寸。
 */
export const applyRecipe = discrete((recipe: Recipe, withCanvas: boolean = false) => {
  const preset = withCanvas && recipe.canvas ? CANVAS_PRESETS.find((p) => p.id === recipe.canvas) : undefined
  if (preset) {
    const [w, h] = recipe.portrait ? [Math.min(preset.w, preset.h), Math.max(preset.w, preset.h)] : [preset.w, preset.h]
    resizeCanvas(w, h, { presetId: preset.id, unit: preset.unit })
  }
  const c = project.canvas
  const r = resolveRecipe(recipe, c, compositionTemplates, guideTemplates)
  if (!r.compositions.length) return
  project.compositions.items = r.compositions
  project.guides.items = r.guides
  project.blocks.items = toProjectBlocks(r.blocks, c)
  ui.selectedComposition = r.compositions[0].uid
  ui.selectedGuide = null
  ui.selectedBlock = null
  unlockSteps()
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

/** 專案已經有後面步驟的內容時（套用範例、開啟專案檔），直接解鎖到那一步，讓內容可以編輯 */
export function unlockSteps() {
  const has = [
    true,
    project.guides.items.length > 0,
    project.blocks.items.length > 0,
    project.objects.items.length > 0 || !!project.background.assetId,
  ]
  flow.reached = Math.max(flow.reached, has.lastIndexOf(true))
}
