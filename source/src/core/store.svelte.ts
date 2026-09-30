// 專案狀態（單一來源）。存檔、自動暫存、復原／重做都是對 project 做快照。

import { CANVAS_MAX, CANVAS_PRESETS, type CanvasSpec } from './canvas'
import { boundsOfPoints, remapPoints, roleOf, type Block, type BlockShape } from './blocks'
import type { Pt, Rect } from './geometry'
import { DEFAULT_BACKGROUND, type Background, type DesignObject } from './objects'
import { objectTypeOf } from '../layers/4-objects/types'
import { TEXT_DEFAULTS } from '../layers/4-objects/types/text/shape'
import { CHART_DEFAULTS } from '../layers/4-objects/types/chart/shape'
import { TABLE_DEFAULTS } from '../layers/4-objects/types/table/shape'
import { trapezoidCorners } from '../layers/4-objects/types/trapezoid/shape'
import { IDENTITY, type Orientation } from './transform'
import { CANVAS_FRAME, type FrameRef, type TemplateInstance } from './instances'
import { resolveRecipe, toProjectBlocks, type PanelTone, type Recipe, type ResolvedBlock } from './recipes'
import type { ParamValues } from './params'
import type { Template } from './registry'
import { STEPS, type StepDef } from '../config/steps'
import { contrast } from './color'
import { paletteOf, rolesOf, textOn } from './palettes'
import { inkCenter, roleDef, type ContentItem, type ContentRole, type Proposal } from './autolayout'
import { FONT_GROUPS } from './fonts'
import { compositionTemplates } from '../layers/1-composition/templates'
import { guideTemplates } from '../layers/2-guides/templates'

/** 第二層的視覺引導與第一層的構圖一樣，都是版型實例 */
export type GuideItem = TemplateInstance

export interface ProjectData {
  /** 專案名稱（也用在匯出與存檔的檔名） */
  name: string
  canvas: CanvasSpec
  /** 第一層：可以有多個構圖，各自套用在整張畫布或某個範圍 */
  compositions: { items: TemplateInstance[] }
  guides: { items: TemplateInstance[] }
  blocks: { items: Block[] }
  /** 陣列順序 = 疊放順序（後面的在上層） */
  objects: { items: DesignObject[] }
  background: Background
  /** 選用的配色（色彩庫 id）；物件的預設顏色與色票都取自這組配色 */
  palette: string | null
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
    name: '',
    canvas: { presetId: preset.id, w: preset.w, h: preset.h, unit: preset.unit },
    // 構圖由使用者在第一步自行選擇
    compositions: { items: [] },
    guides: { items: [] },
    blocks: { items: [] },
    objects: { items: [] },
    background: structuredClone(DEFAULT_BACKGROUND),
    palette: null,
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
  project.name = typeof data.name === 'string' ? data.name : ''
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
      .map((o) => ({ ...o, props: { ...objectDefaultProps(o.type), ...(o.type === 'trapezoid' && !('tl' in o.props) ? trapezoidCorners(o.props) : {}), ...o.props } })),
  }
  project.background = { ...structuredClone(DEFAULT_BACKGROUND), ...data.background }
  project.palette = typeof data.palette === 'string' && paletteOf(data.palette) ? data.palette : null
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
  /** 正在畫的自由多邊形：已點的頂點（畫布座標）與對應的物件（兩點以上才建立） */
  drawPolygon: null as { uid: string | null; pts: Pt[] } | null,
  /** 上次套用的排版提案（加入或修改文字時沿用） */
  layoutPref: 'flow',
})

/** 點選物件：additive（按住 Shift）時切換加入／移除，否則只選這一個；null = 取消全部。 */
export function selectObject(id: string | null, additive = false) {
  if (id === null) ui.selectedObjects = []
  else if (!additive) ui.selectedObjects = [id]
  else if (ui.selectedObjects.includes(id)) ui.selectedObjects = ui.selectedObjects.filter((x) => x !== id)
  else ui.selectedObjects = [...ui.selectedObjects, id]
}

/** 匯出與存檔用的檔名（去掉不能用在檔名的字元） */
export function fileBase(): string {
  return project.name.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'design'
}

export function uid() {
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

/** 精靈：只用一個構圖（清掉區塊與引導） */
export const chooseComposition = discrete((templateId: string) => {
  const t = compositionTemplates.find((x) => x.id === templateId)
  if (!t) return
  const item = newInstance(t)
  project.compositions.items = [item]
  project.blocks.items = []
  project.guides.items = []
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
  const extra = type === 'text' ? TEXT_DEFAULTS : type === 'chart' ? CHART_DEFAULTS : type === 'table' ? TABLE_DEFAULTS : {}
  return { ...extra, ...clone(t?.defaults ?? {}) }
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
  const colors = paletteColors(type, { x: x + w / 2, y: y + h / 2 })
  const o: DesignObject = {
    uid: uid(),
    type,
    name: name || `${t.meta.name} ${n}`,
    x,
    y,
    w,
    h,
    rotation: 0,
    fill: t.meta.fill === '' ? '' : (colors.fill ?? t.meta.fill ?? '#2f6bff'),
    stroke: t.meta.stroke ? (colors.stroke ?? t.meta.stroke) : '',
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

// ── 配色 ───────────────────────────────────────────────

/** 某個位置（0–1）底下看得到的顏色：最上層蓋住該點的填色圖形，沒有就是背景色 */
function backdropAt(p: Pt, below = project.objects.items.length): string {
  for (let i = below - 1; i >= 0; i--) {
    const o = project.objects.items[i]
    if (!o.visible || !o.fill || o.type === 'text' || o.type === 'line' || o.type === 'image') continue
    if (covers(o, p)) return o.fill
  }
  return project.background.color
}

/** 物件是否蓋住某個位置（0–1）：色塊依實際形狀（橢圓、多邊形）判斷，其他物件看外框 */
function covers(o: DesignObject, p: Pt): boolean {
  if (p.x < o.x || p.x > o.x + o.w || p.y < o.y || p.y > o.y + o.h) return false
  if (o.type !== 'panel') return true
  const u = (p.x - o.x) / o.w
  const v = (p.y - o.y) / o.h
  if (o.props.shape === 'ellipse') return (u - 0.5) ** 2 + (v - 0.5) ** 2 <= 0.25
  const pts = o.props.points as unknown as Pt[] | undefined
  if (o.props.shape !== 'polygon' || !pts || pts.length < 3) return true
  let hit = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    if (pts[i].y > v !== pts[j].y > v && u < ((pts[j].x - pts[i].x) * (v - pts[i].y)) / (pts[j].y - pts[i].y) + pts[i].x) hit = !hit
  }
  return hit
}

/** 某個位置底下是不是照片（背景照片或下層的圖片；Logo 不算，被填色圖形蓋住也不算） */
export function onPhotoAt(p: Pt, below = project.objects.items.length): boolean {
  for (let i = below - 1; i >= 0; i--) {
    const o = project.objects.items[i]
    if (!o.visible || o.type === 'text' || o.type === 'line') continue
    if (!covers(o, p)) continue
    if (o.type === 'image') {
      if (!isContent(o)) return true
    } else if (o.fill) return false
  }
  return !!project.background.assetId
}

/** 新物件的預設顏色：依選用的配色（文字依底色自動選深或淺，圖形輪流使用鮮豔色） */
function paletteColors(type: string, center: Pt): { fill?: string; stroke?: string } {
  const p = paletteOf(project.palette)
  if (!p) return {}
  const r = rolesOf(p)
  if (type === 'text') return { fill: onPhotoAt(center) ? '#ffffff' : textOn(backdropAt(center), r) }
  if (type === 'line') return { stroke: r.primary }
  const bg = backdropAt(center)
  const list = r.chromatic.filter((c) => contrast(c, bg) >= 1.3)
  const pool = list.length ? list : [r.primary]
  const n = project.objects.items.filter((o) => o.type !== 'text' && o.type !== 'image').length
  // 線條型（預設沒有填色）的圖形：保持不填色，線條改用配色中的鮮豔色
  const lineOnly = objectTypeOf(type)?.meta.fill === ''
  return lineOnly ? { stroke: pool[n % pool.length] } : { fill: pool[n % pool.length], stroke: r.dark }
}

/**
 * 一鍵上色：背景取配色中最淺（或最深）的顏色，圖形輪流使用鮮豔色，
 * 最大的文字用主色（對比足夠時），其他文字依底色自動選深或淺。
 */
export const applyPalette = discrete((id: string, mode: 'light' | 'dark') => {
  const p = paletteOf(id)
  if (!p) return
  project.palette = id
  const r = rolesOf(p)
  const bg = mode === 'light' ? r.light : r.dark
  project.background.color = bg
  const pool = r.chromatic.filter((c) => contrast(c, bg) >= 1.3)
  const colors = pool.length ? pool : [r.primary]
  let k = 0
  const items = project.objects.items
  items.forEach((o, i) => {
    if (o.type === 'chart' || o.type === 'table') {
      // 圖表的主色用配色主色；文字與格線依底下的顏色選深淺
      const under = backdropAt({ x: o.x + o.w / 2, y: o.y + o.h / 2 }, i)
      o.fill = r.primary
      o.props.ink = contrast('#ffffff', under) > contrast('#1a1a1a', under) ? 'light' : 'dark'
    } else if (o.type === 'line') o.stroke = r.primary
    else if (o.type === 'panel' && o.props.tone) o.fill = panelColor(o.props.tone as PanelTone)
    else if (o.type !== 'text' && o.type !== 'image') {
      o.fill = colors[k++ % colors.length]
      if (o.stroke) o.stroke = r.dark
    }
  })
  const texts = items.filter((o) => o.type === 'text').sort((a, b) => Number(b.props.fontSize) - Number(a.props.fontSize))
  texts.forEach((o, i) => {
    const at = { x: o.x + o.w / 2, y: o.y + o.h / 2 }
    const photo = onPhotoAt(at, items.indexOf(o))
    const under = backdropAt(at, items.indexOf(o))
    o.fill = photo ? '#ffffff' : i === 0 && contrast(r.primary, under) >= 3 ? r.primary : textOn(under, r)
    o.props.shadow = photo
  })
})

// ── 文字內容與自動排版 ─────────────────────────────────

/** 標了內容角色（標題、內文…）的文字物件 */
export const isContent = (o: DesignObject) => (o.type === 'text' || o.type === 'image') && typeof o.props.role === 'string'

/** 內容原文（依形狀分段時，畫布上的文字含有換行，原文另外保存） */
export const contentText = (o: DesignObject) => String(o.props.contentText ?? o.props.text ?? '')

export function contentItems(): ContentItem[] {
  const c = project.canvas
  return project.objects.items
    .filter(isContent)
    .map((o) =>
      o.type === 'image'
        ? { uid: o.uid, role: 'logo' as const, text: '', aspect: logoAspect(o, c) }
        : { uid: o.uid, role: o.props.role as ContentRole, text: contentText(o) },
    )
}

/**
 * Logo 的寬高比：用加入時記下的圖片原始比例（固定不變）。
 * 不能用目前的物件框算，否則每次排版後的微小誤差會被當成「內容改變」而不斷重新排版。
 */
function logoAspect(o: DesignObject, c: { w: number; h: number }): number {
  const a = Number(o.props.aspect)
  return Number.isFinite(a) && a > 0 ? a : Math.round(((o.w * c.w) / (o.h * c.h)) * 1000) / 1000
}

/** 加入 Logo（圖片），也列入文字內容一起自動排版 */
export const addLogo = discrete((assetId: string, width: number, height: number) => {
  const c = project.canvas
  const k = (Math.min(c.w, c.h) * 0.2) / Math.max(width, height)
  const w = (width * k) / c.w
  const h = (height * k) / c.h
  addObject('image', { rect: { x: 0.5 - w / 2, y: 0.5 - h / 2, w, h } }, { assetId, role: 'logo', aspect: width / height }, 'Logo')
  ui.selectedObjects = []
})

/** 修改內容文字（清掉依形狀分段的結果） */
export function setContentText(o: DesignObject, text: string) {
  o.props.text = text
  delete o.props.contentText
}

/** 內容清單中上移（-1）或下移（1）一項：與相鄰的內容交換位置 */
export const moveContent = discrete((id: string, dir: -1 | 1) => {
  const items = project.objects.items
  const content = items.map((o, i) => [o, i] as const).filter(([o]) => isContent(o))
  const k = content.findIndex(([o]) => o.uid === id)
  const other = content[k + dir]
  if (k < 0 || !other) return
  const a = content[k][1]
  const b = other[1]
  ;[items[a], items[b]] = [items[b], items[a]]
})

export const addContent = discrete((role: ContentRole, text?: string) => {
  const def = roleDef(role)
  const n = project.objects.items.filter((o) => o.props.role === role).length + 1
  addObject('text', {}, { text: text ?? def.text, role, lineHeight: def.lineHeight }, `${def.label} ${n}`)
  // 不切換到物件編輯區，留在內容清單繼續輸入
  ui.selectedObjects = []
})

/** 字重：heavy = 字型最粗、bold ≈ 700、regular ≈ 400（依字型實際提供的字重） */
function weightFor(kind: 'heavy' | 'bold' | 'regular', family: string): number {
  const ws = FONT_GROUPS.flatMap((g) => g.fonts).find((f) => f.family === family)?.weights ?? [400, 700]
  if (kind === 'heavy') return Math.max(...ws)
  const target = kind === 'bold' ? 700 : 400
  return ws.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a), ws[0])
}

/** 內容文字在某個位置的顏色：標題用主色、醒目用強調色（對比足夠時），其他依底色選深或淺 */
export function contentColor(role: string, at: Pt, below?: number): string {
  const p = paletteOf(project.palette)
  const r = p ? rolesOf(p) : undefined
  // 照片上：白字（另加陰影），避免深色字壓在照片上看不清
  if (onPhotoAt(at, below)) return '#ffffff'
  const under = backdropAt(at, below)
  if (r && role === 'title' && contrast(r.primary, under) >= 3) return r.primary
  if (r && role === 'highlight' && contrast(r.accent, under) >= 3) return r.accent
  return textOn(under, r)
}

const rectKey = (o: DesignObject) => [o.x, o.y, o.w, o.h].map((v) => v.toFixed(4)).join(',')

/** 內容文字都還在自動排版的位置（沒有手動移動、縮放過） */
export function contentUntouched(): boolean {
  return project.objects.items.filter(isContent).every((o) => o.props.autoRect === undefined || o.props.autoRect === rectKey(o))
}

export const applyProposal = discrete((proposal: Proposal) => {
  ui.layoutPref = proposal.id
  const c = project.canvas
  const items = project.objects.items
  for (const pl of proposal.placements) {
    const o = items.find((x) => x.uid === pl.uid)
    if (!o) continue
    if (o.type === 'image') {
      Object.assign(o, { x: pl.rect.x / c.w, y: pl.rect.y / c.h, w: pl.rect.w / c.w, h: pl.rect.h / c.h, rotation: 0 })
      o.props.autoRect = rectKey(o)
      continue
    }
    const original = contentText(o)
    Object.assign(o, { x: pl.rect.x / c.w, y: pl.rect.y / c.h, w: pl.rect.w / c.w, h: pl.rect.h / c.h, rotation: 0 })
    Object.assign(o.props, {
      fontSize: pl.size / c.h,
      lineHeight: pl.lineHeight,
      align: pl.align,
      verticalAlign: 'top',
      direction: pl.direction,
      slant: pl.slant ?? 0,
      letterSpacing: 0,
      fontWeight: weightFor(roleDef(pl.role).weight, String(o.props.fontFamily)),
    })
    if (pl.text !== undefined && pl.text !== original) {
      o.props.contentText = original
      o.props.text = pl.text
    } else setContentText(o, original)
    const ink = inkCenter(pl)
    const at = { x: ink.x / c.w, y: ink.y / c.h }
    o.fill = contentColor(pl.role, at, items.indexOf(o))
    o.props.shadow = onPhotoAt(at, items.indexOf(o))
    o.stroke = ''
    o.props.autoRect = rectKey(o)
  }
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
  // 範本色塊與對應的區塊連結（「區塊」清單會顯示已填色）
  placePanels(r.blocks.map((b, i) => ({ b, block: project.blocks.items[i]?.uid })).filter(({ b }) => b.panel))
  ui.selectedComposition = r.compositions[0].uid
  ui.selectedGuide = null
  ui.selectedBlock = null
  unlockSteps()
})

/** 各色塊角色在沒有選配色時的顏色 */
const PANEL_DEFAULT: Record<PanelTone, string> = { primary: '#2f6bff', accent: '#f0642a', dark: '#1f1f23', light: '#f2efe9' }

export function panelColor(tone: PanelTone): string {
  const p = paletteOf(project.palette)
  if (!p) return PANEL_DEFAULT[tone]
  const r = rolesOf(p)
  return tone === 'primary' ? r.primary : tone === 'accent' ? r.accent : tone === 'dark' ? r.dark : r.light
}

/** 區塊用途對應的預設色塊顏色 */
export function toneForRole(role: string): PanelTone {
  return role === 'title' ? 'primary' : role === 'cta' ? 'accent' : role === 'background' ? 'dark' : 'light'
}

/** 某個區塊裡已經放了什麼：照片（用區塊裁切的圖片）、色塊 */
export function blockFill(uid: string) {
  const items = project.objects.items
  return {
    photo: items.find((o) => o.type === 'image' && o.mask === uid && !isContent(o)),
    panel: items.find((o) => o.type === 'panel' && o.props.block === uid),
  }
}

/** 照片放進區塊：物件框 = 區塊外框，用區塊形狀裁切；放在色塊之上、文字之下（同一區塊的舊照片會被取代） */
export const placePhotoInBlock = discrete((uid: string, assetId: string) => {
  const b = project.blocks.items.find((x) => x.uid === uid)
  if (!b) return
  project.objects.items = project.objects.items.filter((o) => !(o.type === 'image' && o.mask === uid && !isContent(o)))
  addObject('image', { rect: { x: b.x, y: b.y, w: b.w, h: b.h }, block: uid }, { assetId }, b.name || '照片')
  const img = project.objects.items.pop()!
  const at = project.objects.items.filter((o) => o.type === 'panel').length
  project.objects.items.splice(at, 0, img)
  ui.selectedObjects = []
})

/** 區塊填色：依區塊形狀建立色塊（顏色取自配色），放在最下層 */
export const fillBlock = discrete((blockId: string) => {
  const b = project.blocks.items.find((x) => x.uid === blockId)
  if (!b) return
  const c = project.canvas
  const tone = toneForRole(b.role)
  const rect = { x: b.x * c.w, y: b.y * c.h, w: b.w * c.w, h: b.h * c.h }
  const t = objectTypeOf('panel')!
  const panel: DesignObject = {
    uid: uid(),
    type: 'panel',
    name: `${b.name || '區塊'}（色塊）`,
    x: b.x,
    y: b.y,
    w: b.w,
    h: b.h,
    rotation: 0,
    fill: panelColor(tone),
    stroke: '',
    strokeWidth: 0,
    opacity: 1,
    visible: true,
    props: {
      ...structuredClone(t.defaults),
      shape: b.shape,
      radius: b.radius ?? 0,
      points: (b.points?.map((q) => ({ x: (q.x * c.w - rect.x) / rect.w, y: (q.y * c.h - rect.y) / rect.h })) ?? []) as unknown as ParamValues[string],
      tone,
      block: blockId,
    },
    mask: null,
  }
  project.objects.items = [panel, ...project.objects.items.filter((o) => !(o.type === 'panel' && o.props.block === blockId))]
})


/** 範本的色塊：換成實際的填色形狀，放在所有物件最下層（先移除上一個範本留下的色塊） */
function placePanels(list: { b: ResolvedBlock; block?: string }[]) {
  const c = project.canvas
  const kept = project.objects.items.filter((o) => o.type !== 'panel' || !o.props.fromTemplate)
  const panels: DesignObject[] = list.map(({ b, block }, i) => {
    const t = objectTypeOf('panel')!
    return {
      uid: uid(),
      type: 'panel',
      name: b.name || `色塊 ${i + 1}`,
      x: b.rect.x / c.w,
      y: b.rect.y / c.h,
      w: b.rect.w / c.w,
      h: b.rect.h / c.h,
      rotation: 0,
      fill: panelColor(b.panel!),
      stroke: '',
      strokeWidth: 0,
      opacity: 1,
      visible: true,
      props: {
        ...structuredClone(t.defaults),
        shape: b.shape,
        // 多邊形頂點（物件框內 0–1）；屬性型別不含陣列，存成 unknown
        points: (b.points?.map((q) => ({ x: (q.x - b.rect.x) / b.rect.w, y: (q.y - b.rect.y) / b.rect.h })) ?? []) as unknown as ParamValues[string],
        tone: b.panel!,
        fromTemplate: true,
        ...(block ? { block } : {}),
      },
      mask: null,
    }
  })
  project.objects.items = [...panels, ...kept]
}

// ── 線性流程 ────────────────────────────────────────────

/** current = 目前所在步驟，reached = 已解鎖到的最遠步驟。 */
export const flow = $state({ current: 0, reached: 0 })

// 開發用：網址加 #step=3 可直接跳到第 4 步（只在 npm run dev 有效）
if (import.meta.env.DEV) {
  const m = location.hash.match(/step=(\d)/)
  if (m) flow.current = flow.reached = Math.min(Number(m[1]), STEPS.length - 1)
}

/** 編輯器的步驟可以自由切換（建立設計的流程由精靈負責） */
export function goToStep(i: number) {
  flow.current = i
  flow.reached = Math.max(flow.reached, i)
}

export function completeStep() {
  const next = flow.current + 1
  if (next >= STEPS.length) return
  flow.reached = Math.max(flow.reached, next)
  flow.current = next
}

export const currentStep = (): StepDef => STEPS[flow.current]

/** 以版型範例開始：套用後直接前往「插入物件」（前面的步驟都已解鎖，可以回頭調整） */
export function startFromRecipe(recipe: Recipe) {
  applyRecipe(recipe)
  const objects = STEPS.findIndex((s) => s.id === 'objects')
  flow.reached = Math.max(flow.reached, objects)
  flow.current = objects
}

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
