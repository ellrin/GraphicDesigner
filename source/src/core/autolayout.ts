// 文字自動排版：依內容（標題、子標題、內文…）與版面空間，提出幾種排版方案。
// 規則刻意保持寬鬆：只決定「放哪裡、多大、怎麼對齊」，套用後都可以自由微調。
//
// 1. 可放文字的空間（slot）：優先用使用者畫的區塊，其次用構圖與引導切出的區域，都沒有時用畫布的上中下三帶。
// 2. 空間的順序：有視覺引導時依視線順序（例如 Z 型的 1→4），沒有時由上而下、由左而右。
// 3. 字級：同一區內的文字依層級比例（標題 1、子標題 0.5…）一起放大，直到剛好放得下。

import type { Pt, Rect } from './geometry'
import { breakText, flowText, largestFitting, priceUnits, setMeasureWeight, units, verticalColumns } from './textfit'

export type ContentRole = 'title' | 'subtitle' | 'body' | 'list' | 'price' | 'highlight' | 'logo'

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
  { id: 'price', label: '價目', ratio: 0.3, lineHeight: 1.7, weight: 'regular', text: '美式咖啡 90\n拿鐵 120' },
  { id: 'highlight', label: '醒目', ratio: 0.42, lineHeight: 1.2, weight: 'bold', text: '限時優惠' },
  // Logo 是圖片：ratio 為高度相對標題字級的比例
  { id: 'logo', label: 'Logo', ratio: 1.6, lineHeight: 1, weight: 'regular', text: '' },
]

export const roleDef = (id: string) => CONTENT_ROLES.find((r) => r.id === id) ?? CONTENT_ROLES[2]


export interface ContentItem {
  uid: string
  role: ContentRole
  text: string
  /** Logo：圖片寬高比 */
  aspect?: number
}

/** 量測字寬時使用的字重 */
const weightOf = (role: string) => {
  const w = roleDef(role).weight
  return w === 'heavy' ? 900 : w === 'bold' ? 700 : 400
}
/** 以某個角色的字重量一行文字的寬度（字級為單位） */
const lineUnits = (line: string, role: string) => {
  setMeasureWeight(weightOf(role))
  return units(line)
}

/** 判斷文字底色用的位置：第一行文字實際的中心（畫布座標），而不是整個文字框的中心 */
export function inkCenter(p: Placement): Pt {
  const r = inkRects(p)[0] ?? p.rect
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}

const isBodyLike = (i?: ContentItem) => !!i && (i.role === 'body' || i.role === 'list' || i.role === 'price')

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
  /** 整頁（空白畫布時提供，給「集中」使用） */
  full?: boolean
  /** 空白畫布時自動產生的區域 */
  fallback?: boolean
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
  /** 色塊：文字要完全在色塊內或完全在色塊外，不能跨在邊緣 */
  panels?: SlotSource[]
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
  const panels = input.panels ?? []
  const straddles = (r: Rect) => panels.some((o) => {
    const k = coverage(r, o)
    return k > 0.2 && k < 0.8
  })
  const blocked = (r: Rect) => obstacles.some((o) => coverage(r, o) > 0.2) || straddles(r)
  const toSlot = (s: SlotSource): Slot => ({ rect: s.rect, shape: s.shape ?? 'rect', points: s.points, role: s.role, order: 0, area: area(s.rect) })

  const slots = input.blocks.filter((b) => TEXT_ROLES.has(b.role)).map(toSlot)
  for (const r of input.regions) {
    const a = area(r.rect)
    if (!TEXT_ROLES.has(r.role) || a < total * 0.03 || a > total * 0.7 || blocked(r.rect)) continue
    if (slots.some((s) => iou(s.rect, r.rect) > 0.6)) continue
    slots.push(toSlot(r))
  }
  if (slots.length < 2) {
    // 空白畫布：上方頁首帶、下方內容區，另外加一個整頁區域
    const m = Math.min(canvas.w, canvas.h) * 0.06
    // 寬的畫布（招牌、橫幅）頁首帶較高
    const split = m + (canvas.h - 2 * m) * (canvas.w / canvas.h >= 1.8 ? 0.62 : 0.3)
    const bands = [
      { x: m, y: m, w: canvas.w - 2 * m, h: split - m },
      { x: m, y: split, w: canvas.w - 2 * m, h: canvas.h - m - split },
    ]
    bands.forEach((rect, i) => {
      if (!blocked(rect) && !slots.some((s) => iou(s.rect, rect) > 0.5)) slots.push({ ...toSlot({ rect, role: i === 0 ? 'title' : 'text' }), fallback: true })
    })
    const whole = { x: m, y: m, w: canvas.w - 2 * m, h: canvas.h - 2 * m }
    if (!blocked(whole)) slots.push({ ...toSlot({ rect: whole }), full: true, fallback: true })
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
      if (xs.length < 2) return null
      // 凹多邊形（例如中間有 V 形缺口）一行會切成好幾段：取最寬的一段
      xs.sort((p, q) => p - q)
      let best: [number, number] = [xs[0], xs[1]]
      for (let i = 2; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > best[1] - best[0]) best = [xs[i], xs[i + 1]]
      return best
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

interface StackOptions {
  fixedBase?: number
  /** 不再內縮（呼叫端已經算好範圍） */
  noPad?: boolean
  /** 強制對齊 */
  align?: Placement['align']
  /** 放不下時允許更小的字級（最後的退路） */
  tight?: boolean
}

function layoutStack(items: ContentItem[], slot: Slot, canvas: { w: number; h: number }, opts: StackOptions = {}): StackResult {
  const { fixedBase } = opts
  const short = Math.min(canvas.w, canvas.h)
  const pad = opts.noPad ? 0 : Math.min(slot.rect.w, slot.rect.h) * 0.08
  const inner = inset(slot.rect, pad)
  const shaped = slot.shape !== 'rect'
  const logo = items.find((i) => i.role === 'logo')
  // 寬的矩形區域：Logo 在左、文字在右（招牌常見的橫式組合）
  if (logo && items.length > 1 && !shaped && !opts.noPad && inner.w / inner.h >= 2.2) return layoutSide(items, logo, slot, inner, canvas)
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
    const out: { item: ContentItem; lines: string[]; y: number; h: number; size: number; w?: number }[] = []
    items.forEach((item, k) => {
      const def = roleDef(item.role)
      const size = base * def.ratio
      // 段落之間（子標題開始新的一段）多留一點距離
      if (k > 0) y += item.role === 'subtitle' && isBodyLike(items[k - 1]) ? size * 1.1 : item.role === 'logo' ? 0 : size * 0.5
      if (k > 0 && items[k - 1].role === 'logo') y += base * 0.3
      if (item.role === 'logo') {
        const maxW = shaped && Number.isFinite(boxWidth) ? boxWidth : inner.w
        let h = size
        let w = h * (item.aspect ?? 1)
        if (w > maxW) {
          w = maxW
          h = w / (item.aspect ?? 1)
        }
        out.push({ item, lines: [], y, h, size, w })
        y += h
        return
      }
      if (item.role === 'price') {
        // 價目：一行一個品項，不自動換行（放不下就縮小字級）
        const lines = item.text.split('\n')
        setMeasureWeight(400)
        out.push({ item, lines, y, h: lines.length * size * def.lineHeight, size })
        y += lines.length * size * def.lineHeight
        return
      }
      // 標題類：平均各行長度；在形狀中改用內接矩形的寬度（不擠進尖端或圓頂）
      // 內文、條列：沿著形狀逐行排（例如三角形中一行比一行長）
      const titleLike = !isBodyLike(item)
      setMeasureWeight(weightOf(item.role))
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
  // 每段文字中最長的英文單字寬度（字級為單位）：單字不能被切斷，放不下就縮小字級
  const longestWord = new Map(
    items.map((it) => [it.uid, Math.max(0, ...(it.text.match(/[A-Za-z0-9][A-Za-z0-9.'&$-]*/g) ?? []).map((w) => lineUnits(w, it.role)))]),
  )
  const fits = (base: number) => {
    const r = run(base)
    const wordsFit = r.out.every((o) => {
      const word = (longestWord.get(o.item.uid) ?? 0) * o.size
      if (!word || o.item.role === 'logo' || o.item.role === 'price') return true
      const avail = !shaped ? inner.w : !isBodyLike(o.item) && Number.isFinite(boxWidth) ? boxWidth : Math.max(0, ...o.lines.map((_, i) => {
        const c = lineChord(chord, o.y + i * o.size * roleDef(o.item.role).lineHeight, o.size)
        return c ? c[1] - c[0] : 0
      }))
      // 與換行時使用的寬度（96%）一致
      return word <= avail * 0.95
    })
    if (!wordsFit) return false
    // 每一行都要落在區域內（形狀區域另外檢查該行的實際寬度沒有超出形狀）
    return (
      r.bottom <= span.bottom + 0.5 &&
      r.out.every((o) =>
        (o.item.role === 'logo'
          ? (() => {
              // Logo：它所在高度範圍內的可用寬度要放得下
              const c = lineChord(chord, o.y, o.h)
              return !!c && c[1] - c[0] >= (o.w ?? o.h) * 0.98
            })()
          : true) &&
        o.lines.every((line, i) => {
          const c = lineChord(chord, o.y + i * o.size * roleDef(o.item.role).lineHeight, o.size)
          if (!c) return false
          if (o.item.role === 'price') return priceUnits(line) * o.size <= (c[1] - c[0]) * 0.98
          return !shaped || lineUnits(line, o.item.role) * o.size <= (c[1] - c[0]) * 1.001
        }),
      )
    )
  }
  // 字級上限：標題最大約畫布短邊的 22%；下限讓內文仍可閱讀
  const hi = (short * 0.22) / topRatio
  const lo = (short * (opts.tight ? 0.004 : 0.012)) / Math.min(...items.filter((i) => i.role !== 'logo').map((i) => roleDef(i.role).ratio), 1)
  const base = fixedBase ?? largestFitting(lo, hi, fits)
  const { out, bottom } = run(base)

  // 矩形區域：靠近版面上方的靠上、下方的靠下，中間置中；左右依區域在畫面中的位置對齊
  const cy = center(slot.rect).y / canvas.h
  const free = Math.max(0, inner.y + inner.h - bottom)
  const dy = shaped ? 0 : cy < 0.36 ? 0 : cy > 0.64 ? free : free / 2
  const cx = center(slot.rect).x / canvas.w
  // 只有內文、條列的區域一律靠左（靠右或置中的長段文字不好讀）
  const textOnly = items.every((i) => i.role === 'body' || i.role === 'list')
  let align: Placement['align'] = opts.align ?? (textOnly ? 'left' : cx < 0.38 ? 'left' : cx > 0.62 ? 'right' : 'center')
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
    // 先看左、右邊是否是直的（直角三角形、梯形），最後才看是否對稱（圓形、等腰三角形）
    if (chords.length && spread(lefts) < tol && spread(rights) >= tol) {
      align = 'left'
      frame = { x: Math.min(...lefts), w: Math.max(...rights) - Math.min(...lefts) }
    } else if (chords.length && spread(rights) < tol && spread(lefts) >= tol) {
      align = 'right'
      frame = { x: Math.min(...lefts), w: Math.max(...rights) - Math.min(...lefts) }
    } else if (chords.length && spread(mids) < tol) {
      align = 'center'
      const m = mids.reduce((a, b) => a + b, 0) / mids.length
      frame = { x: m - inner.w / 2, w: inner.w }
    } else if (chords.length) {
      align = 'left'
      frame = { x: Math.min(...lefts), w: Math.max(...rights) - Math.min(...lefts) }
      pads = (line, y, size) => {
        const c = lineChord(chord, y, size)
        if (!c) return line
        const offset = c[0] + (c[1] - c[0] - units(line) * size) / 2 - frame.x // 字重已在排版時設定
        return '\u3000'.repeat(Math.max(0, Math.round(offset / size))) + line
      }
    }
  }

  return {
    base,
    overflow: bottom > inner.y + inner.h + 0.5,
    placements: out.map(({ item, lines, y, h, size, w }) => {
      const lh = roleDef(item.role).lineHeight
      if (item.role === 'logo') {
        const lw = w ?? h
        let x = align === 'left' ? frame.x : align === 'right' ? frame.x + frame.w - lw : frame.x + (frame.w - lw) / 2
        // 形狀區域：放在所在高度的可用範圍中間
        const c = shaped ? lineChord(chord, y, h) : null
        if (c) x = (c[0] + c[1]) / 2 - lw / 2
        return { uid: item.uid, role: item.role, rect: { x, y: y + dy, w: lw, h }, size, lineHeight: 1, align, direction: 'horizontal' as const, lines: [] }
      }
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

/** Logo 在左、文字在右：文字先在右側排好，Logo 高度配合文字，整組在區域內置中 */
function layoutSide(items: ContentItem[], logo: ContentItem, slot: Slot, inner: Rect, canvas: { w: number; h: number }): StackResult {
  const aspect = logo.aspect ?? 1
  const gap = inner.h * 0.12
  let logoW = Math.min(inner.h * aspect, inner.w * 0.35)
  const textRect = { x: inner.x + logoW + gap, y: inner.y, w: Math.max(1, inner.w - logoW - gap), h: inner.h }
  const text = layoutStack(
    items.filter((i) => i !== logo),
    { ...slot, rect: textRect, shape: 'rect', points: undefined, area: area(textRect) },
    canvas,
    { noPad: true, align: 'left' },
  )
  const ps = text.placements
  const top = Math.min(...ps.map((p) => p.rect.y))
  const bottom = Math.max(...ps.map((p) => p.rect.y + p.rect.h))
  const textW = Math.max(...ps.map((p) => Math.max(...p.lines.map((l) => lineUnits(l, p.role))) * p.size))
  const logoH = Math.min(inner.h, Math.max(bottom - top, inner.h * 0.55))
  logoW = Math.min(logoH * aspect, inner.w * 0.35)
  const total = logoW + gap + textW
  const x0 = inner.x + Math.max(0, (inner.w - total) / 2)
  const mid = inner.y + inner.h / 2
  const shiftY = mid - (top + bottom) / 2
  return {
    base: text.base,
    overflow: text.overflow,
    placements: [
      { uid: logo.uid, role: 'logo', rect: { x: x0, y: mid - logoH / 2, w: logoW, h: logoH }, size: logoH, lineHeight: 1, align: 'left', direction: 'horizontal', lines: [] },
      ...ps.map((p) => ({ ...p, rect: { ...p.rect, x: x0 + logoW + gap, y: p.rect.y + shiftY, w: inner.x + inner.w - (x0 + logoW + gap) } })),
    ],
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

/**
 * 依輸入順序把內容分組（不重新排序）：
 * - 頁首：開頭的 Logo、標題，以及緊跟在標題後、後面沒有接內文的子標題
 * - 段落：子標題＋其後的內文、條列、價目（例如「咖啡」＋咖啡的品項）
 * - 醒目：醒目訊息另外安排位置
 */
interface Split {
  header: ContentItem[]
  sections: ContentItem[][]
  highlights: ContentItem[]
}

function splitContent(items: ContentItem[]): Split {
  const header: ContentItem[] = []
  const sections: ContentItem[][] = []
  const highlights = items.filter((i) => i.role === 'highlight')
  const flow = items.filter((i) => i.role !== 'highlight')
  flow.forEach((it, k) => {
    if (it.role === 'title' || it.role === 'logo' || (it.role === 'subtitle' && !isBodyLike(flow[k + 1]))) {
      if (!sections.length) header.push(it)
      else sections.push([it])
    } else if (it.role === 'subtitle' || !sections.length) sections.push([it])
    else sections[sections.length - 1].push(it)
  })
  return { header, sections, highlights }
}

/**
 * 畫面上最大的幾塊空白矩形：把畫布切成格子，排除照片，並且同一塊只能全在某個色塊內或全在色塊外。
 * 回傳每一種「底」（無色塊、各個色塊）中面積最大的矩形。
 */
function largestFreeRects(input: LayoutInput): Slot[] {
  const { canvas } = input
  const m = Math.min(canvas.w, canvas.h) * 0.05
  const N = 24
  const cw = (canvas.w - 2 * m) / N
  const ch = (canvas.h - 2 * m) / N
  const panels = input.panels ?? []
  const label: number[][] = []
  for (let j = 0; j < N; j++) {
    label.push([])
    for (let i = 0; i < N; i++) {
      const p = { x: m + (i + 0.5) * cw, y: m + (j + 0.5) * ch }
      if (input.obstacles.some((o) => inside(o, p))) label[j].push(-2)
      else {
        let k = -1
        panels.forEach((o, n) => inside(o, p) && (k = n))
        label[j].push(k)
      }
    }
  }
  const out: Slot[] = []
  for (let lab = -1; lab < panels.length; lab++) {
    // 最大矩形（直方圖法）
    const hgt = new Array(N).fill(0)
    let best = { a: 0, x: 0, y: 0, w: 0, h: 0 }
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) hgt[i] = label[j][i] === lab ? hgt[i] + 1 : 0
      for (let i = 0; i < N; i++) {
        let hmin = Infinity
        for (let k = i; k < N && hgt[k] > 0; k++) {
          hmin = Math.min(hmin, hgt[k])
          const a = hmin * (k - i + 1)
          if (a > best.a) best = { a, x: i, y: j - hmin + 1, w: k - i + 1, h: hmin }
        }
      }
    }
    if (best.a >= 4) {
      const rect = { x: m + best.x * cw, y: m + best.y * ch, w: best.w * cw, h: best.h * ch }
      out.push({ rect, shape: 'rect', order: 0, area: area(rect) })
    }
  }
  return out
}

/** 一個排版結果實際有文字（或圖片）的範圍：橫排文字逐行計算 */
export function inkRects(p: Placement): Rect[] {
  if (p.role === 'logo' || p.direction === 'vertical' || p.role === 'price' || !p.lines.length) return [p.rect]
  const step = p.size * p.lineHeight
  return p.lines.map((line, i) => {
    const w = Math.min(p.rect.w, lineUnits(line.replace(/^\u3000+/, ''), p.role) * p.size)
    const lead = (line.length - line.replace(/^\u3000+/, '').length) * p.size
    const x = p.align === 'right' ? p.rect.x + p.rect.w - w : p.align === 'center' ? p.rect.x + (p.rect.w - w) / 2 : p.rect.x + lead
    return { x, y: p.rect.y + i * step + ((p.lineHeight - 1) * p.size) / 2, w, h: p.size }
  })
}

/** 多個區域：以標題的字級為上限，讓其他文字維持層級（只縮小不放大） */
/** 排版時要避開的形狀（每次 proposeLayouts 設定） */
let avoid: SlotSource[] = []
let panelShapes: SlotSource[] = []
/** 範本指定的文字區塊：文字落在其中時，允許疊在照片上（區塊本來就設計成壓在照片上） */
let textBlocks: SlotSource[] = []
const inTextBlock = (r: Rect) => textBlocks.some((b) => coverage(r, b) > 0.9)

/** 文字（逐行）是否跨在色塊邊緣 */
const straddlesPanel = (p: Placement) =>
  p.role !== 'logo' &&
  inkRects(p).some((r) =>
    panelShapes.some((o) => {
      const k = coverage(r, o)
      return k > 0.12 && k < 0.88
    }),
  )

function assemble(groups: { items: ContentItem[]; slot: Slot; vertical?: boolean; base?: number; align?: Placement['align'] }[], canvas: { w: number; h: number }): { placements: Placement[]; overflow: boolean } {
  const results = groups.map((g) => ({ g, r: g.vertical ? layoutVertical(g.items[0], g.slot, canvas) : layoutStack(g.items, g.slot, canvas, { fixedBase: g.base, align: g.align }) }))
  const titleGroup = results.find(({ g }) => g.items.some((i) => i.role === 'title'))
  const cap = titleGroup?.r.base
  const final = results.map(({ g, r }) => (!cap || g === titleGroup?.g || g.vertical || r.base <= cap ? r : layoutStack(g.items, g.slot, canvas, { fixedBase: cap, align: g.align })))
  const placements = final.flatMap((r) => r.placements)
  const outside = placements.some((p) => p.rect.x < -1 || p.rect.y < -1 || p.rect.x + p.rect.w > canvas.w + 1 || p.rect.y + p.rect.h > canvas.h + 1)
  // 排好的文字壓到圖片、Logo 也算放不下（逐行檢查實際文字範圍，而不是整個文字框）
  const covered = placements.some((p) => inkRects(p).some((r) => !inTextBlock(r) && avoid.some((o) => coverage(r, o) > 0.12)))
  const straddle = placements.some(straddlesPanel)
  // 不同區域的文字互相重疊
  const inks = final.map((r) => r.placements.flatMap(inkRects))
  let clash = false
  for (let a = 0; a < inks.length && !clash; a++)
    for (let b = a + 1; b < inks.length && !clash; b++)
      clash = inks[a].some((x) => inks[b].some((y) => overlap(x, y) > Math.min(area(x), area(y)) * 0.05))
  return { placements, overflow: outside || covered || straddle || clash || final.some((r) => r.overflow) }
}

export function proposeLayouts(input: LayoutInput, all = false): Proposal[] {
  const items = input.items.filter((i) => i.role === 'logo' || i.text.trim())
  if (!items.length) return []
  const slots = collectSlots(input)
  if (!slots.length) return []
  const { canvas } = input
  avoid = input.obstacles
  panelShapes = input.panels ?? []
  // 只有明確放字的區塊（標題、內文、行動呼籲）才算；裝飾色塊（滿版底色、外框）不算
  textBlocks = input.blocks.filter((b) => b.role === 'title' || b.role === 'text' || b.role === 'cta')
  const proposals: Proposal[] = []

  const { header, sections, highlights } = splitContent(items)
  const body = sections.flat()
  const largest = (list: Slot[]) => [...list].sort((a, b) => b.area - a.area)[0]
  /** 與已使用的區域不重疊的區域 */
  const clear = (list: Slot[], used: Slot[]) =>
    list.filter((s) => used.every((u) => u !== s && overlap(s.rect, u.rect) < Math.min(s.area, u.area) * 0.1))
  const parts = slots.filter((s) => !s.full)
  const withRole = (role: string) => parts.find((s) => s.role === role)
  type Group = { items: ContentItem[]; slot: Slot; vertical?: boolean; base?: number; align?: Placement['align'] }

  // 頁首放的區域：有「標題」區塊就用它，否則動線前段最大的區域
  const early = parts.slice(0, Math.max(1, Math.ceil(parts.length * 0.6)))
  const titleSlot = parts.length ? (withRole('title') ?? largest(early)) : slots[0]
  const afterTitle = clear(parts, [titleSlot])

  // A｜沿動線：頁首在動線前段、段落依序接著、醒目訊息放終點
  {
    const cta = withRole('cta')
    const hlSlot = highlights.length ? (cta && afterTitle.includes(cta) ? cta : afterTitle.length > 1 ? afterTitle[afterTitle.length - 1] : undefined) : undefined
    const bodySlots = hlSlot ? clear(afterTitle, [hlSlot]) : afterTitle
    const groups: Group[] = []
    const main = [...header]
    // 標題區域是直長形時，標題改直排，其餘頁首內容放到內文區域
    const titleItem = main.find((i) => i.role === 'title')
    const lead: ContentItem[] = []
    if (titleItem && main.length === 1 && titleSlot.rect.h / titleSlot.rect.w >= 1.6 && bodySlots.length) {
      groups.push({ items: [titleItem], slot: titleSlot, vertical: true })
      main.length = 0
    } else if (titleItem && titleSlot.rect.h / titleSlot.rect.w >= 1.6 && bodySlots.length) {
      groups.push({ items: [titleItem], slot: titleSlot, vertical: true })
      lead.push(...main.filter((i) => i !== titleItem))
      main.length = 0
    }
    if (!bodySlots.length) main.push(...body, ...(hlSlot ? [] : highlights))
    if (main.length) groups.push({ items: main, slot: titleSlot })
    if (bodySlots.length && (body.length || lead.length)) {
      const ordered = [...bodySlots].sort((a, b) => a.order - b.order)
      if (sections.length > 1 && ordered.length >= sections.length && !lead.length) {
        // 段落數量不多於剩下的區域：每一段放一個區域，依動線順序
        // 依序挑互不重疊的區域
        const used: Slot[] = [titleSlot, ...(hlSlot ? [hlSlot] : [])]
        const picks: Slot[] = []
        for (const s of ordered) if (picks.length < sections.length && clear([s], [...used, ...picks]).length) picks.push(s)
        if (picks.length === sections.length) sections.forEach((sec, i) => groups.push({ items: sec, slot: picks[i] }))
        else groups.push({ items: [...lead, ...body], slot: largest(ordered) })
        if (!hlSlot && highlights.length) groups[groups.length - 1].items.push(...highlights)
      } else {
        const textSlot = ordered.find((s) => s.role === 'text') ?? ordered.find((s) => s.order > titleSlot.order) ?? ordered[0]
        groups.push({ items: [...lead, ...body, ...(hlSlot ? [] : highlights)], slot: textSlot })
      }
    } else if (bodySlots.length && !hlSlot && highlights.length) groups.push({ items: highlights, slot: bodySlots[0] })
    if (hlSlot && highlights.length) groups.push({ items: highlights, slot: hlSlot })
    if (!groups.length) groups.push({ items, slot: titleSlot })
    let flow = assemble(groups, canvas)
    // 分散後有放不下的，改成全部依序放在頁首的區域
    if (flow.overflow) flow = assemble([{ items: [...header, ...highlights, ...body], slot: titleSlot }], canvas)
    proposals.push({ id: 'flow', name: '沿動線', ...flow })
  }

  // B｜集中：所有內容依序集中在一區（空白畫布時使用整頁）
  {
    const slot = slots.find((s) => s.full) ?? withRole('title') ?? withRole('text') ?? largest(slots)
    proposals.push({ id: 'stack', name: '集中', ...assemble([{ items: [...header, ...highlights, ...body], slot }], canvas) })
  }

  // C｜兩欄：有兩段以上時，頁首在上、段落平均分成左右兩欄
  if (sections.length >= 2) {
    const area2 = largest(afterTitle.length ? afterTitle : parts)
    if (area2 && area2 !== titleSlot) {
      const gap = area2.rect.w * 0.05
      const colW = (area2.rect.w - gap) / 2
      const col = (i: number): Slot => {
        const rect = { x: area2.rect.x + i * (colW + gap), y: area2.rect.y, w: colW, h: area2.rect.h }
        return { rect, shape: 'rect', order: area2.order + i * 0.001, area: area(rect) }
      }
      // 依內容長度把段落平均分到兩欄（保持順序）
      const weight = (sec: ContentItem[]) => sec.reduce((n, i) => n + i.text.split('\n').length + 1, 0)
      const total = sections.reduce((n, sec) => n + weight(sec), 0)
      let acc = 0
      const left: ContentItem[] = []
      const right: ContentItem[] = []
      for (const sec of sections) {
        ;(acc < total / 2 && (acc + weight(sec) / 2 <= total / 2 || !left.length) ? left : right).push(...sec)
        acc += weight(sec)
      }
      // 兩欄的字級一致（取較小者）
      const base = Math.min(layoutStack(left, col(0), canvas).base, right.length ? layoutStack(right, col(1), canvas).base : Infinity)
      const groups: Group[] = []
      if (header.length || highlights.length) groups.push({ items: [...header, ...highlights], slot: titleSlot })
      // 欄內文字一律靠左（條列、說明置中不好讀）
      groups.push({ items: left, slot: col(0), base, align: 'left' })
      if (right.length) groups.push({ items: right, slot: col(1), base, align: 'left' })
      const r = assemble(groups, canvas)
      proposals.push({ id: 'columns', name: '兩欄', ...r })
    }
  }

  // D｜直排標題（有直長的區域時），否則大標題獨占最大區域
  {
    const title = items.find((i) => i.role === 'title')
    const others = [...header, ...highlights, ...body].filter((i) => i !== title)
    const tall = [...parts].sort((a, b) => b.rect.h / b.rect.w - a.rect.h / a.rect.w)[0]
    if (title && tall && tall.rect.h / tall.rect.w >= 1.1) {
      const rest = clear(parts, [tall])
      const groups: Group[] = [{ items: [title], slot: tall, vertical: true }]
      if (others.length) groups.push({ items: others, slot: rest.length ? largest(rest) : tall })
      if (rest.length || !others.length) proposals.push({ id: 'vertical', name: '直排標題', ...assemble(groups, canvas) })
    } else if (title && others.length && parts.length > 1 && !parts.every((s) => s.fallback)) {
      const big = largest(parts)
      const rest = clear(parts, [big])
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
  if (all) return unique
  // 放不下的方案不列出；全部都放不下時，保留一個讓使用者自己調整
  const fitting = unique.filter((p) => !p.overflow)
  if (fitting.length) return fitting
  // 文字多到每個方案都放不下：找畫面上最大的空白處（不壓照片、不跨色塊），縮小字級依序放入
  const all3 = [...header, ...highlights, ...body]
  const candidates = [...largestFreeRects(input), ...slots]
  // 優先選放得下的；都放不下時選字最大的（字級可以縮得更小，但不出界、不壓照片、不跨色塊）
  let best: { placements: Placement[]; overflow: boolean; score: number } | null = null
  for (const s of candidates) {
    const r = layoutStack(all3, s, canvas, { tight: true })
    const inCanvas = r.placements.every((p) => p.rect.x >= -1 && p.rect.y >= -1 && p.rect.x + p.rect.w <= canvas.w + 1 && p.rect.y + p.rect.h <= canvas.h + 1)
    const ok = inCanvas && !r.placements.some(straddlesPanel) && !r.placements.some((p) => inkRects(p).some((q) => !inTextBlock(q) && avoid.some((o) => coverage(q, o) > 0.12)))
    const score = (ok ? 1e9 : 0) + (r.overflow ? 0 : 1e6) + r.base
    if (!best || score > best.score) best = { placements: r.placements, overflow: r.overflow, score }
  }
  return best ? [{ id: 'full', name: '緊湊', placements: best.placements, overflow: best.overflow }] : []
}
