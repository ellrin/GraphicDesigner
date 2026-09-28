// 版型範例（recipe）：一個 JSON 檔 = 構圖 + 視覺引導 + 預先排好、標好用途的區塊。
// 區塊用「第幾個構圖的哪個區域」或「哪個錨點」描述，而不是寫死座標，所以任何畫布比例都能正確套用。
//
// 檔案放在 src/recipes/<構圖 id>/<名稱>.json，新增檔案即自動出現在第一層的「版型範例」中。

import { roleOf, type Block, type BlockShape } from './blocks'
import { computeInstance, resolveFrame, type FrameRef, type TemplateInstance } from './instances'
import { boundsOfPoints, type Frame, type GuideOutput, type Pt, type Rect, type Region } from './geometry'
import type { ParamValues } from './params'
import type { Template } from './registry'
import { IDENTITY, type Orientation } from './transform'

/** 指向「第 n 個構圖（或引導）」切出的區域或錨點 */
type Ref = [number, string]

interface InstanceSpec {
  template: string
  params?: ParamValues
  orientation?: Partial<Orientation>
  /** 省略 = 整張畫布；region = 前面某個構圖的區域；rect = 相對畫布的範圍 [x, y, w, h] */
  frame?: 'canvas' | { region: Ref } | { rect: [number, number, number, number] }
}

export interface BlockSpec {
  name: string
  role: string
  /** 來自構圖的區域（保留區域的形狀：矩形、多邊形、橢圓） */
  region?: Ref
  /** 以錨點為中心的區塊，size 為 [寬, 高]（相對畫布短邊） */
  anchor?: Ref
  size?: [number, number]
  /** 相對畫布的矩形 [x, y, w, h] */
  rect?: [number, number, number, number]
  /** 相對畫布的多邊形頂點 */
  points?: [number, number][]
  shape?: BlockShape
  /** 往內縮（相對畫布短邊），留出邊距；多邊形不支援 */
  inset?: number
  filled?: boolean
  /** 縮成範圍內置中的正方形（搭配 ellipse 在任何畫布比例都是正圓） */
  square?: boolean
  /** 在成品中畫成色塊（顏色取自配色的角色） */
  panel?: PanelTone
}

export type PanelTone = 'primary' | 'accent' | 'dark' | 'light'

/** 切割類型（精靈第三步的分組） */
export type CutKind = 'rect' | 'diagonal' | 'geometric'
export const CUT_KINDS: { id: CutKind; label: string }[] = [
  { id: 'rect', label: '矩形切割' },
  { id: 'diagonal', label: '斜切・三角' },
  { id: 'geometric', label: '幾何・圓弧' },
]

export interface Recipe {
  id: string
  /** 屬於哪一種第一層構圖（用來分組） */
  group: string
  name: string
  description?: string
  /** 建議的畫布預設尺寸 id（config/canvas-presets.json） */
  canvas?: string
  /** 建議畫布改為直式（長寬對調） */
  portrait?: boolean
  /** 切割類型；省略時依區塊形狀判斷 */
  cut?: CutKind
  compositions: InstanceSpec[]
  guides?: InstanceSpec[]
  blocks: BlockSpec[]
  order?: number
}

export interface ResolvedBlock {
  name: string
  role: string
  shape: BlockShape
  /** 畫布座標 */
  rect: Rect
  points?: Pt[]
  filled: boolean
  panel?: PanelTone
}

export interface ResolvedRecipe {
  compositions: TemplateInstance[]
  guides: TemplateInstance[]
  outputs: GuideOutput[]
  blocks: ResolvedBlock[]
}

const uid = () => Math.random().toString(36).slice(2, 10)

/**
 * 在指定畫布上展開版型：建立構圖與引導實例、計算它們的輸出，並把區塊描述換算成實際形狀。
 * 找不到的版型或區域會略過（並在主控台提示），不會讓整個版型失敗。
 */
export function resolveRecipe(recipe: Recipe, canvas: Frame, compTemplates: Template[], guideTemplates: Template[]): ResolvedRecipe {
  const done: { inst: TemplateInstance; output: GuideOutput }[] = []
  const lookup = (source: string, region: string) =>
    done.find((d) => d.inst.uid === source)?.output.regions?.find((r) => r.label === region)

  const build = (specs: InstanceSpec[] | undefined, templates: Template[]) => {
    const out: TemplateInstance[] = []
    for (const spec of specs ?? []) {
      const t = templates.find((x) => x.id === spec.template)
      if (!t) {
        console.warn(`[recipe ${recipe.id}] 找不到版型 ${spec.template}`)
        continue
      }
      let frame: FrameRef = { kind: 'canvas' }
      if (spec.frame && spec.frame !== 'canvas') {
        if ('rect' in spec.frame) {
          const [x, y, w, h] = spec.frame.rect
          frame = { kind: 'rect', rect: { x, y, w, h }, label: '自訂範圍' }
        } else {
          const [i, label] = spec.frame.region
          const src = done[i]
          const r = src && lookup(src.inst.uid, label)
          if (src && r) {
            frame = {
              kind: 'region',
              source: src.inst.uid,
              region: label,
              rect: { x: r.x / canvas.w, y: r.y / canvas.h, w: r.w / canvas.w, h: r.h / canvas.h },
              label: `${templates.find((x) => x.id === src.inst.templateId)?.meta.name ?? ''}・${label}`,
            }
          } else console.warn(`[recipe ${recipe.id}] 找不到區域 ${label}`)
        }
      }
      const inst: TemplateInstance = {
        uid: uid(),
        templateId: t.id,
        params: { ...structuredClone(t.defaults), ...(spec.params ?? {}) },
        orientation: { ...IDENTITY, ...spec.orientation },
        visible: true,
        frame,
      }
      const f = resolveFrame(frame, canvas, [], lookup)
      done.push({ inst, output: computeInstance(t, inst, f, frame.kind === 'canvas') })
      out.push(inst)
    }
    return out
  }

  const compositions = build(recipe.compositions, compTemplates)
  const guides = build(recipe.guides, guideTemplates)

  const short = Math.min(canvas.w, canvas.h)
  const blocks: ResolvedBlock[] = []
  for (const b of recipe.blocks) {
    const base = { name: b.name, role: roleOf(b.role).id, filled: b.filled ?? false, panel: b.panel }
    let region: Region | undefined
    if (b.region) {
      region = done[b.region[0]]?.output.regions?.find((r) => r.label === b.region![1])
      if (!region) {
        console.warn(`[recipe ${recipe.id}] 區塊「${b.name}」找不到區域 ${b.region[1]}`)
        continue
      }
    }
    if (region?.points) {
      blocks.push({ ...base, shape: 'polygon', rect: boundsOfPoints(region.points), points: region.points })
      continue
    }
    let rect: Rect | undefined
    let shape: BlockShape = b.shape ?? 'rect'
    if (region) {
      rect = { x: region.x, y: region.y, w: region.w, h: region.h }
      if (region.shape === 'ellipse' && !b.shape) shape = 'ellipse'
    } else if (b.anchor) {
      const a = done[b.anchor[0]]?.output.anchors.find((x) => x.label === b.anchor![1])
      if (!a) {
        console.warn(`[recipe ${recipe.id}] 區塊「${b.name}」找不到錨點 ${b.anchor[1]}`)
        continue
      }
      const [sw, sh] = b.size ?? [0.25, 0.25]
      rect = { x: a.x - (sw * short) / 2, y: a.y - (sh * short) / 2, w: sw * short, h: sh * short }
    } else if (b.rect) {
      const [x, y, w, h] = b.rect
      rect = { x: x * canvas.w, y: y * canvas.h, w: w * canvas.w, h: h * canvas.h }
    } else if (b.points) {
      const points = b.points.map(([x, y]) => ({ x: x * canvas.w, y: y * canvas.h }))
      blocks.push({ ...base, shape: 'polygon', rect: boundsOfPoints(points), points })
      continue
    }
    if (!rect) continue
    if (b.square) {
      const s = Math.min(rect.w, rect.h)
      rect = { x: rect.x + (rect.w - s) / 2, y: rect.y + (rect.h - s) / 2, w: s, h: s }
    }
    const d = (b.inset ?? 0) * short
    if (d) rect = { x: rect.x + d, y: rect.y + d, w: Math.max(1, rect.w - 2 * d), h: Math.max(1, rect.h - 2 * d) }
    blocks.push({ ...base, shape, rect })
  }

  return { compositions, guides, outputs: done.map((d) => d.output), blocks }
}

/** 把展開後的區塊轉成專案裡的區塊（0–1 相對座標） */
export function toProjectBlocks(blocks: ResolvedBlock[], canvas: Frame): Block[] {
  return blocks.map((b) => {
    const role = roleOf(b.role)
    return {
      uid: uid(),
      name: b.name,
      role: role.id,
      shape: b.shape,
      points: b.points?.map((p) => ({ x: p.x / canvas.w, y: p.y / canvas.h })),
      x: b.rect.x / canvas.w,
      y: b.rect.y / canvas.h,
      w: b.rect.w / canvas.w,
      h: b.rect.h / canvas.h,
      filled: b.filled,
      color: role.color,
      opacity: 0.25,
      visible: true,
    }
  })
}

const files = import.meta.glob<Omit<Recipe, 'id' | 'group'>>('../recipes/*/*.json', { eager: true, import: 'default' })

/** 範本的切割類型：有指定就用指定的，否則有多邊形 → 斜切、有橢圓 → 幾何、其他 → 矩形 */
export function cutOf(r: Recipe, resolved?: ResolvedBlock[]): CutKind {
  if (r.cut) return r.cut
  // 依展開後的實際形狀判斷（區塊可能來自構圖的多邊形或橢圓區域）
  const blocks: { shape?: BlockShape; points?: unknown }[] = resolved ?? r.blocks
  if (blocks.some((b) => b.shape === 'polygon' || b.points)) return 'diagonal'
  if (blocks.some((b) => b.shape === 'ellipse')) return 'geometric'
  return 'rect'
}

export const RECIPES: Recipe[] = Object.entries(files)
  .map(([path, r]) => {
    const parts = path.split('/')
    return { ...r, group: parts.at(-2)!, id: `${parts.at(-2)}/${parts.at(-1)!.replace(/\.json$/, '')}` }
  })
  .sort((a, b) => a.group.localeCompare(b.group) || (a.order ?? 99) - (b.order ?? 99))
