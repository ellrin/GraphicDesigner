// 文字自動排版：依內容（標題、子標題、內文…）與版面空間，提出幾種排版方案。
// 規則刻意保持寬鬆：只決定「放哪裡、多大、怎麼對齊」，套用後都可以自由微調。
//
// 1. 可放文字的空間（slot）：優先用使用者畫的區塊，其次用構圖與引導切出的區域，都沒有時用畫布的上中下三帶。
// 2. 空間的順序：有視覺引導時依視線順序（例如 Z 型的 1→4），沒有時由上而下、由左而右。
// 3. 字級：同一區內的文字依層級比例（標題 1、子標題 0.5…）一起放大，直到剛好放得下。

import type { Pt, Rect } from './geometry'
import { breakText, flowText, largestFitting, units, verticalColumns } from './textfit'

export type ContentRole = 'title' | 'subtitle' | 'body' | 'list' | 'highlight'

export interface ContentRoleDef {
  id: ContentRole
  label: string
  /** 相對標題的字級比例 */
  ratio: number
  lineHeight: number
  weight: 'heavy' | 'bold' | 'regular'
  text: string
}

export const CONTENT_ROLES: ContentRoleDef[] = [
  { id: 'title', label: '標題', ratio: 1, lineHeight: 1.15, weight: 'heavy', text: '標題文字' },
  { id: 'subtitle', label: '子標題', ratio: 0.5, lineHeight: 1.3, weight: 'bold', text: '子標題' },
  { id: 'body', label: '內文', ratio: 0.3, lineHeight: 1.6, weight: 'regular', text: '內文段落，按 Enter 可以分段。' },
  { id: 'list', label: '條列', ratio: 0.3, lineHeight: 1.6, weight: 'regular', text: '・第一項\n・第二項\n・第三項' },
  { id: 'highlight', label: '醒目', ratio: 0.42, lineHeight: 1.2, weight: 'bold', text: '限時優惠' },
]

export const roleDef = (id: string) => CONTENT_ROLES.find((r) => r.id === id) ?? CONTENT_ROLES[2]


export interface ContentItem {
  uid: string
  role: ContentRole
  text: string
}

export type SlotShape = 'rect' | 'ellipse' | 'polygon'

export interface SlotSource {
  rect: Rect
  shape?: SlotShape
  points?: Pt[]
  role?: string
  label?: string
}

interface Slot extends Required<Pick<SlotSource, 'rect'>> {
  shape: SlotShape
  points?: Pt[]
  role?: string
  order: number
  area: number
}

export interface Placement {
  uid: string
  role: ContentRole
  /** 畫布座標 */
  rect: Rect
  /** 字級（畫布單位） */
  size: number
  lineHeight: number
  align: 'left' | 'center' | 'right'
  direction: 'horizontal' | 'vertical'
  /** 依形狀逐行分段後的文字（只有圓形、多邊形區域會改寫） */
  text?: string
  /** 預覽用的各行文字 */
  lines: string[]
}

export interface Proposal {
  id: string
  name: string
  placements: Placement[]
  /** 有文字放不下（超出區域或畫布） */
  overflow?: boolean
}

export interface LayoutInput {
  canvas: { w: number; h: number }
  items: ContentItem[]
  /** 使用者畫的區塊（畫布座標） */
  blocks: SlotSource[]
  /** 構圖與引導切出的區域（畫布座標） */
  regions: SlotSource[]
  /** 視覺動線上的點（依順序） */
  path: Pt[]
  /** 不要蓋到的地方：圖片、Logo（可以是圓形或多邊形） */
  obstacles: SlotSource[]
}

// 可以放文字的區塊用途（圖片、Logo、背景之外）
const TEXT_ROLES = new Set(['title', 'text', 'cta', 'other', 'space', undefined])

const center = (r: Rect): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })
const area = (r: Rect) => Math.max(0, r.w) * Math.max(0, r.h)
function overlap(a: Rect, b: Rect) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}
const iou = (a: Rect, b: Rect) => {
  const o = overlap(a, b)
  return o / (area(a) + area(b) - o || 1)
}

/** 點是否在形狀內 */
function inside(s: SlotSource, p: Pt): boolean {
  const r = s.rect
  if (p.x < r.x || p.x > r.x + r.w || p.y < r.y || p.y > r.y + r.h) return false
  if (s.shape === 'ellipse') return ((p.x - r.x - r.w / 2) / (r.w / 2)) ** 2 + ((p.y - r.y - r.h / 2) / (r.h / 2)) ** 2 <= 1
  if (s.shape === 'polygon' && s.points && s.points.length >= 3) {
    let hit = false
    const ps = s.points
    for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
      if (ps[i].y > p.y !== ps[j].y > p.y && p.x < ((ps[j].x - ps[i].x) * (p.y - ps[i].y)) / (ps[j].y - ps[i].y) + ps[i].x) hit = !hit
    }
    return hit
  }
  return true
}

/** 矩形 r 有多少比例被形狀 s 蓋住（取樣估算） */
function coverage(r: Rect, s: SlotSource): number {
  if (!overlap(r, s.rect)) return 0
  const n = 7
  let hit = 0
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (inside(s, { x: r.x + ((i + 0.5) / n) * r.w, y: r.y + ((j + 0.5) / n) * r.h })) hit++
  return hit / (n * n)
}

function collectSlots(input: LayoutInput): Slot[] {
  const { canvas, obstacles } = input
  const total = canvas.w * canvas.h
  const blocked = (r: Rect) => obstacles.some((o) => coverage(r, o) > 0.2)
  const toSlot = (s: SlotSource): Slot => ({ rect: s.rect, shape: s.shape ?? 'rect', points: s.points, role: s.role, order: 0, area: area(s.rect) })

  const slots = input.blocks.filter((b) => TEXT_ROLES.has(b.role)).map(toSlot)
  for (const r of input.regions) {
    const a = area(r.rect)
    if (!TEXT_ROLES.has(r.role) || a < total * 0.03 || a > total * 0.7 || blocked(r.rect)) continue
    if (slots.some((s) => iou(s.rect, r.rect) > 0.6)) continue
    slots.push(toSlot(r))
  }
  if (slots.length < 2) {
    const m = Math.min(canvas.w, canvas.h) * 0.06
    const bandH = (canvas.h - 2 * m) / 3
    for (let i = 0; i < 3; i++) {
      const rect = { x: m, y: m + i * bandH, w: canvas.w - 2 * m, h: bandH }
      if (!blocked(rect) && !slots.some((s) => iou(s.rect, rect) > 0.5)) slots.push(toSlot({ rect }))
    }
  }

  // 順序：沿著視覺動線；沒有動線時由上而下、由左而右
  for (const s of slots) {
    const c = center(s.rect)
    if (input.path.length) {
      let best = 0
      input.path.forEach((p, i) => {
        if (Math.hypot(p.x - c.x, p.y - c.y) < Math.hypot(input.path[best].x - c.x, input.path[best].y - c.y)) best = i
      })
      s.order = best + (c.y / canvas.h) * 0.01
    } else s.order = Math.round((c.y / canvas.h) * 3) * 10 + c.x / canvas.w
  }
  return slots.sort((a, b) => a.order - b.order)
}

// ── 區域內的可用寬度 ─────────────────────────────────────

/** 區域在高度 y 處的左右邊界（沒有交集時回傳 null） */
function chordFn(slot: Slot, inner: Rect): (y: number) => [number, number] | null {
  if (slot.shape === 'ellipse') {
    const c = center(inner)
    const a = inner.w / 2
    const b = inner.h / 2
    return (y) => {
      const t = (y - c.y) / b
      if (Math.abs(t) >= 1) return null
      const half = a * Math.sqrt(1 - t * t)
      return [c.x - half, c.x + half]
    }
  }
  if (slot.shape === 'polygon' && slot.points && slot.points.length >= 3) {
    // 多邊形往內縮：以外框的內距比例縮放頂點
    const c = center(slot.rect)
    const k = Math.min(inner.w / slot.rect.w, inner.h / slot.rect.h)
    const pts = slot.points.map((p) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k }))
    return (y) => {
      const xs: number[] = []
      pts.forEach((p, i) => {
        const q = pts[(i + 1) % pts.length]
        if ((p.y <= y && q.y > y) || (q.y <= y && p.y > y)) xs.push(p.x + ((y - p.y) / (q.y - p.y)) * (q.x - p.x))
      })
      return xs.length >= 2 ? [Math.min(...xs), Math.max(...xs)] : null
    }
  }
  return (y) => (y >= inner.y - 1e-6 && y <= inner.y + inner.h + 1e-6 ? [inner.x, inner.x + inner.w] : null)
}

/** 一行文字（上緣 y、字高 size）可用的左右邊界 */
function lineChord(chord: (y: number) => [number, number] | null, y: number, size: number): [number, number] | null {
  const a = chord(y)
  const b = chord(y + size)
  if (!a || !b) return null
  const l = Math.max(a[0], b[0])
  const r = Math.min(a[1], b[1])
  return r > l ? [l, r] : null
}

const inset = (r: Rect, pad: number): Rect => ({ x: r.x + pad, y: r.y + pad, w: Math.max(1, r.w - 2 * pad), h: Math.max(1, r.h - 2 * pad) })

// ── 一區內堆疊多段文字 ───────────────────────────────────

interface StackResult {
  placements: Placement[]
  /** 標題字級基準（相對標題 = 1） */
  base: number
  overflow: boolean
}

function layoutStack(items: ContentItem[], slot: Slot, canvas: { w: number; h: number }, fixedBase?: number): StackResult {
  const short = Math.min(canvas.w, canvas.h)
  const pad = Math.min(slot.rect.w, slot.rect.h) * 0.08
  const inner = inset(slot.rect, pad)
  const shaped = slot.shape !== 'rect'
  const raw = chordFn(slot, inner)
  // 形狀區域只在夠寬的範圍排字：寬度不到最寬處 35% 的尖端、圓頂不放文字
  let span = { top: inner.y, bottom: inner.y + inner.h }
  // 標題類短文字在形狀中使用的寬度：形狀內能放的最大矩形的寬（例如圓形的內接方形）
  let boxWidth = Infinity
  if (shaped) {
    const ys = Array.from({ length: 81 }, (_, i) => inner.y + (inner.h * i) / 80)
    const ws = ys.map((y) => {
      const c = raw(y)
      return c ? c[1] - c[0] : 0
    })
    const max = Math.max(...ws)
    const ok = ys.filter((_, i) => ws[i] >= max * 0.35)
    if (ok.length) span = { top: ok[0], bottom: ok[ok.length - 1] }
    let best = 0
    for (let i = 0; i < ys.length; i++) {
      let minW = Infinity
      for (let j = i; j < ys.length; j++) {
        minW = Math.min(minW, ws[j])
        const a = minW * (ys[j] - ys[i])
        if (a > best) {
          best = a
          boxWidth = minW
        }
      }
    }
  }
  const chord = (y: number) => (y < span.top - 1e-6 || y > span.bottom + 1e-6 ? null : raw(y))
  // 形狀區域在高度 y 處的寬度（畫布外或形狀外為 0）
  const widthAt = (y: number) => {
    const c = chord(y)
    return c ? c[1] - c[0] : 0
  }
  const topRatio = Math.max(...items.map((i) => roleDef(i.role).ratio))

  const runFrom = (base: number, start: number) => {
    let y = start
    const out: { item: ContentItem; lines: string[]; y: number; h: number; size: number }[] = []
    items.forEach((item, k) => {
      const def = roleDef(item.role)
      const size = base * def.ratio
      if (k > 0) y += size * 0.5
      // 標題類：平均各行長度；在形狀中改用內接矩形的寬度（不擠進尖端或圓頂）
      // 內文、條列：沿著形狀逐行排（例如三角形中一行比一行長）
      const titleLike = item.role !== 'body' && item.role !== 'list'
      const at = titleLike && shaped && Number.isFinite(boxWidth) ? () => boxWidth : widthAt
      const { lines, height } = flowText(item.text, size, def.lineHeight, y, at, titleLike ? 1 : 0)
      out.push({ item, lines, y, h: height, size })
      y += height
    })
    return { out, top: start, bottom: y }
  }
  // 形狀區域：整段文字在形狀內上下置中（從較寬的地方開始排，避免頂端只放得下一個字）
  const run = (base: number) => {
    let r = runFrom(base, span.top)
    if (!shaped) return r
    for (let k = 0; k < 4; k++) {
      const start = span.top + Math.max(0, (span.bottom - span.top - (r.bottom - r.top)) / 2)
      if (Math.abs(start - r.top) < 0.5) break
      r = runFrom(base, start)
    }
    return r
  }
  const fits = (base: number) => {
    const r = run(base)
    // 每一行都要落在區域內（形狀區域另外檢查該行的實際寬度沒有超出形狀）
    return (
      r.bottom <= span.bottom + 0.5 &&
      r.out.every((o) =>
        o.lines.every((line, i) => {
          const c = lineChord(chord, o.y + i * o.size * roleDef(o.item.role).lineHeight, o.size)
          return !!c && (!shaped || units(line) * o.size <= (c[1] - c[0]) * 1.001)
        }),
      )
    )
  }
  // 字級上限：標題最大約畫布短邊的 22%；下限讓內文仍可閱讀
  const hi = (short * 0.22) / topRatio
  const lo = (short * 0.012) / Math.min(...items.map((i) => roleDef(i.role).ratio))
  const base = fixedBase ?? largestFitting(lo, hi, fits)
  const { out, bottom } = run(base)

  // 矩形區域：靠近版面上方的靠上、下方的靠下，中間置中；左右依區域在畫面中的位置對齊
  const cy = center(slot.rect).y / canvas.h
  const free = Math.max(0, inner.y + inner.h - bottom)
  const dy = shaped ? 0 : cy < 0.36 ? 0 : cy > 0.64 ? free : free / 2
  const cx = center(slot.rect).x / canvas.w
  // 只有內文、條列的區域一律靠左（靠右或置中的長段文字不好讀）
  const textOnly = items.every((i) => i.role === 'body' || i.role === 'list')
  let align: Placement['align'] = textOnly ? 'left' : cx < 0.38 ? 'left' : cx > 0.62 ? 'right' : 'center'
  let frame = { x: inner.x, w: inner.w }
  let pads: ((line: string, y: number, size: number) => string) | undefined

  if (shaped) {
    // 依每行的左右邊界決定對齊：左邊是直的就靠左、右邊是直的就靠右、對稱就置中；
    // 都不是時靠左並在行首補全形空白，讓每行落在形狀中間
    const chords = out.flatMap((o) => o.lines.map((_, i) => lineChord(chord, o.y + i * o.size * roleDef(o.item.role).lineHeight, o.size))).filter((c): c is [number, number] => !!c)
    const tol = Math.min(...out.map((o) => o.size)) * 0.5
    const spread = (vs: number[]) => Math.max(...vs) - Math.min(...vs)
    const lefts = chords.map((c) => c[0])
    const rights = chords.map((c) => c[1])
    const mids = chords.map((c) => (c[0] + c[1]) / 2)
    if (chords.length && spread(mids) < tol) {
      align = 'center'
      const m = mids.reduce((a, b) => a + b, 0) / mids.length
      frame = { x: m - inner.w / 2, w: inner.w }
    } else if (chords.length && spread(lefts) < tol) {
      align = 'left'
      frame = { x: Math.min(...lefts), w: Math.max(...rights) - Math.min(...lefts) }
    } else if (chords.length && spread(rights) < tol) {
      align = 'right'
      frame = { x: Math.min(...lefts), w: Math.max(...rights) - Math.min(...lefts) }
    } else if (chords.length) {
      align = 'left'
      frame = { x: Math.min(...lefts), w: Math.max(...rights) - Math.min(...lefts) }
      pads = (line, y, size) => {
        const c = lineChord(chord, y, size)
        if (!c) return line
        const offset = c[0] + (c[1] - c[0] - units(line) * size) / 2 - frame.x
        return '\u3000'.repeat(Math.max(0, Math.round(offset / size))) + line
      }
    }
  }

  return {
    base,
    overflow: bottom > inner.y + inner.h + 0.5,
    placements: out.map(({ item, lines, y, h, size }) => {
      const lh = roleDef(item.role).lineHeight
      const shown = pads ? lines.map((l, i) => pads!(l, y + i * size * lh, size)) : lines
      return {
        uid: item.uid,
        role: item.role,
        rect: { x: frame.x, y: y + dy, w: frame.w, h },
        size,
        lineHeight: lh,
        align,
        direction: 'horizontal' as const,
        // 用算好的斷行（避頭點、平均行長、依形狀分段）
        text: shown.join('\n'),
        lines: shown,
      }
    }),
  }
}

/** 直排標題：放在區域內側，字級放到欄數剛好放得下 */
function layoutVertical(item: ContentItem, slot: Slot, canvas: { w: number; h: number }): StackResult {
  const short = Math.min(canvas.w, canvas.h)
  const inner = inset(slot.rect, Math.min(slot.rect.w, slot.rect.h) * 0.08)
  const lh = 1.25
  const fits = (s: number) => verticalColumns(item.text, s, inner.h) * s * lh <= inner.w
  const size = largestFitting(short * 0.015, short * 0.16, fits)
  const cols = verticalColumns(item.text, size, inner.h)
  const perCol = Math.max(1, Math.floor(inner.h / size))
  const longest = Math.max(...item.text.split('\n').map((p) => Math.min([...p].length, perCol)))
  const w = cols * size * lh
  const h = Math.min(inner.h, longest * size * 1.02)
  const onLeft = center(slot.rect).x < canvas.w / 2
  return {
    base: size,
    overflow: !fits(size),
    placements: [
      {
        uid: item.uid,
        role: item.role,
        rect: { x: onLeft ? inner.x : inner.x + inner.w - w, y: inner.y, w, h },
        size,
        lineHeight: lh,
        align: 'left',
        direction: 'vertical',
        lines: breakText(item.text, () => perCol),
      },
    ],
  }
}

// ── 方案 ───────────────────────────────────────────────

const ORDER: ContentRole[] = ['title', 'subtitle', 'highlight', 'body', 'list']
const byRole = (items: ContentItem[]) => [...items].sort((a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role))

/** 多個區域：以標題的字級為上限，讓其他文字維持層級（只縮小不放大） */
/** 排版時要避開的形狀（每次 proposeLayouts 設定） */
let avoid: SlotSource[] = []

function assemble(groups: { items: ContentItem[]; slot: Slot; vertical?: boolean }[], canvas: { w: number; h: number }): { placements: Placement[]; overflow: boolean } {
  const results = groups.map((g) => ({ g, r: g.vertical ? layoutVertical(g.items[0], g.slot, canvas) : layoutStack(g.items, g.slot, canvas) }))
  const titleGroup = results.find(({ g }) => g.items.some((i) => i.role === 'title'))
  const cap = titleGroup?.r.base
  const final = results.map(({ g, r }) => (!cap || g === titleGroup?.g || g.vertical || r.base <= cap ? r : layoutStack(g.items, g.slot, canvas, cap)))
  const placements = final.flatMap((r) => r.placements)
  const outside = placements.some((p) => p.rect.x < -1 || p.rect.y < -1 || p.rect.x + p.rect.w > canvas.w + 1 || p.rect.y + p.rect.h > canvas.h + 1)
  // 排好的文字壓到圖片、Logo 也算放不下
  const covered = placements.some((p) => avoid.some((o) => coverage(p.rect, o) > 0.12))
  return { placements, overflow: outside || covered || final.some((r) => r.overflow) }
}

export function proposeLayouts(input: LayoutInput): Proposal[] {
  const items = input.items.filter((i) => i.text.trim())
  if (!items.length) return []
  const slots = collectSlots(input)
  if (!slots.length) return []
  const { canvas } = input
  avoid = input.obstacles
  const proposals: Proposal[] = []

  const titles = items.filter((i) => i.role === 'title' || i.role === 'subtitle')
  const bodies = items.filter((i) => i.role === 'body' || i.role === 'list')
  const highlights = items.filter((i) => i.role === 'highlight')
  const largest = (list: Slot[]) => [...list].sort((a, b) => b.area - a.area)[0]
  /** 與已使用的區域不重疊的區域 */
  const clear = (list: Slot[], used: Slot[]) =>
    list.filter((s) => used.every((u) => u !== s && overlap(s.rect, u.rect) < Math.min(s.area, u.area) * 0.1))
  const withRole = (role: string) => slots.find((s) => s.role === role)

  // A｜沿動線：標題在動線前段、內文接著、醒目訊息放終點
  {
    const early = slots.slice(0, Math.max(1, Math.ceil(slots.length * 0.6)))
    const titleSlot = withRole('title') ?? largest(early)
    const rest = clear(slots, [titleSlot])
    const cta = withRole('cta')
    const hlSlot = highlights.length ? (cta && rest.includes(cta) ? cta : rest.length > 1 ? rest[rest.length - 1] : undefined) : undefined
    const bodySlots = hlSlot ? clear(rest, [hlSlot]) : rest
    const groups: { items: ContentItem[]; slot: Slot; vertical?: boolean }[] = []
    const main = [...titles]
    const bodyCandidates = bodySlots.filter((s) => s !== titleSlot)
    if (!bodySlots.length) main.push(...bodies)
    if (!hlSlot && !bodySlots.length) main.push(...highlights)
    // 標題區域是直長形時，標題改直排，其餘文字放到下一個區域
    const titleItem = main.find((i) => i.role === 'title')
    const tallTitle = titleItem && titleSlot.rect.h / titleSlot.rect.w >= 1.6 && bodyCandidates.length > 0
    if (tallTitle) {
      groups.push({ items: [titleItem], slot: titleSlot, vertical: true })
      main.splice(main.indexOf(titleItem), 1)
      if (main.length) bodies.unshift(...main)
      main.length = 0
    }
    if (main.length) groups.push({ items: byRole(main), slot: titleSlot })
    if (bodySlots.length && bodies.length) {
      const textSlot = bodyCandidates.find((s) => s.role === 'text') ?? bodyCandidates.find((s) => s.order > titleSlot.order) ?? bodyCandidates[0]
      const others = hlSlot ? [] : highlights
      groups.push({ items: byRole([...bodies, ...others]), slot: textSlot })
    } else if (bodySlots.length && !hlSlot && highlights.length) groups.push({ items: highlights, slot: bodySlots[0] })
    if (hlSlot && highlights.length) groups.push({ items: highlights, slot: hlSlot })
    if (!groups.length) groups.push({ items: byRole(items), slot: titleSlot })
    let flow = assemble(groups, canvas)
    // 分散後有放不下的，改成全部放在標題的區域
    if (flow.overflow) flow = assemble([{ items: byRole(items), slot: titleSlot }], canvas)
    proposals.push({ id: 'flow', name: '沿動線', ...flow })
  }

  // B｜集中：所有文字集中在一區
  {
    const slot = withRole('title') ?? withRole('text') ?? largest(slots)
    proposals.push({ id: 'stack', name: '集中', ...assemble([{ items: byRole(items), slot }], canvas) })
  }

  // C｜直排標題（有直長的區域時），否則大標題獨占最大區域
  {
    const title = items.find((i) => i.role === 'title')
    const others = byRole(items.filter((i) => i !== title))
    const tall = [...slots].sort((a, b) => b.rect.h / b.rect.w - a.rect.h / a.rect.w)[0]
    if (title && tall.rect.h / tall.rect.w >= 1.1) {
      const rest = clear(slots, [tall])
      const groups: { items: ContentItem[]; slot: Slot; vertical?: boolean }[] = [{ items: [title], slot: tall, vertical: true }]
      if (others.length) groups.push({ items: others, slot: rest.length ? largest(rest) : tall })
      if (rest.length || !others.length) proposals.push({ id: 'vertical', name: '直排標題', ...assemble(groups, canvas) })
    } else if (title && others.length && slots.length > 1) {
      const big = largest(slots)
      const rest = clear(slots, [big])
      if (rest.length)
        proposals.push({
          id: 'hero',
          name: '大標題',
          ...assemble(
            [
              { items: [title], slot: big },
              { items: others, slot: largest(rest) },
            ],
            canvas,
          ),
        })
    }
  }

  // 去掉結果相同的方案
  const key = (p: Proposal) => p.placements.map((x) => `${x.uid}:${Math.round(x.rect.x)}:${Math.round(x.rect.y)}:${Math.round(x.size)}`).join('|')
  const unique = proposals.filter((p, i) => p.placements.length && proposals.findIndex((q) => key(q) === key(p)) === i)
  // 放不下的方案不列出；全部都放不下時，保留一個讓使用者自己調整
  const fitting = unique.filter((p) => !p.overflow)
  if (fitting.length) return fitting
  // 文字多到每個方案都放不下：改用整張畫布（留邊距）排，確保文字完整留在畫面內
  const m = Math.min(canvas.w, canvas.h) * 0.05
  const rect = { x: m, y: m, w: canvas.w - 2 * m, h: canvas.h - 2 * m }
  avoid = []
  return [{ id: 'full', name: '全版', ...assemble([{ items: byRole(items), slot: { rect, shape: 'rect', order: 0, area: area(rect) } }], canvas) }]
}
