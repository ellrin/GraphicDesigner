// 圖表共用的繪圖工具：文字、標題、註腳、圖例、空資料提示。
// 所有尺寸都由基本字級 fs 推導，物件放大縮小、換畫布尺寸時比例一致。

import Konva from 'konva'
import type { ShapeContext } from '../index'
import { inkOf, type Ink } from './colors'
import type { NumberFormat } from './format'

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface Kit {
  ctx: ShapeContext
  /** 基本字級（畫布座標） */
  fs: number
  family: string
  ink: Ink
  out: Konva.Shape[]
  fmt: NumberFormat
  unit: string
  text(o: TextOpts): Konva.Text
  width(s: string, size?: number, weight?: number): number
}

export interface TextOpts {
  x: number
  y: number
  text: string
  size?: number
  weight?: number
  fill?: string
  /** 水平對齊點：x 是文字的左邊、中間或右邊 */
  anchor?: 'start' | 'middle' | 'end'
  /** 垂直對齊點：y 是文字的上緣、中線或下緣 */
  baseline?: 'top' | 'middle' | 'bottom'
  /** 限制寬度（超出以 … 截斷） */
  maxWidth?: number
  opacity?: number
}

const measure = new Map<string, number>()

export function makeKit(ctx: ShapeContext): Kit {
  const p = ctx.props
  const fs = Math.max(1e-6, Number(p.fontSize ?? 0.012) * ctx.canvasH)
  const family = `"${p.fontFamily ?? 'Noto Sans TC'}", "PingFang TC", "Microsoft JhengHei", sans-serif`
  const ink = inkOf(ctx)
  const out: Konva.Shape[] = []

  const width = (s: string, size = fs, weight = 400) => {
    const key = `${family}|${weight}|${s}`
    let unit = measure.get(key)
    if (unit === undefined) {
      unit = new Konva.Text({ text: s, fontSize: 100, fontFamily: family, fontStyle: String(weight), wrap: 'none' }).width() / 100
      if (measure.size > 4000) measure.clear()
      measure.set(key, unit)
    }
    return unit * size
  }

  const text = (o: TextOpts) => {
    const size = o.size ?? fs
    const weight = o.weight ?? 400
    let w = width(o.text, size, weight)
    const clipped = o.maxWidth !== undefined && w > o.maxWidth
    if (clipped) w = Math.max(0, o.maxWidth!)
    const x = o.anchor === 'middle' ? o.x - w / 2 : o.anchor === 'end' ? o.x - w : o.x
    const y = o.baseline === 'middle' ? o.y - size / 2 : o.baseline === 'bottom' ? o.y - size : o.y
    const t = new Konva.Text({
      x,
      y,
      text: o.text,
      fontSize: size,
      fontFamily: family,
      fontStyle: String(weight),
      fill: o.fill ?? ink.secondary,
      lineHeight: 1,
      wrap: 'none',
      opacity: o.opacity ?? 1,
      listening: false,
      ...(clipped ? { width: w, ellipsis: true } : {}),
    })
    out.push(t)
    return t
  }

  return { ctx, fs, family, ink, out, text, width, fmt: (p.format as NumberFormat) ?? 'auto', unit: String(p.unit ?? '') }
}

/** 物件框（以中心為原點） */
export const frameOf = (ctx: ShapeContext): Box => ({ x0: -ctx.w / 2, y0: -ctx.h / 2, x1: ctx.w / 2, y1: ctx.h / 2 })

/** 透明的點擊區：圖表中間的空白處也能點選、拖曳整個物件 */
export function hitArea(k: Kit) {
  const { w, h } = k.ctx
  k.out.push(new Konva.Rect({ x: -w / 2, y: -h / 2, width: w, height: h, fill: 'rgba(0,0,0,0)' }))
}

/** 標題（上）與註腳（下）；回傳剩下的繪圖範圍 */
export function titleAndNote(k: Kit, box: Box): Box {
  const p = k.ctx.props
  const b = { ...box }
  const title = String(p.title ?? '').trim()
  if (title) {
    const size = k.fs * 1.3
    k.text({ x: b.x0, y: b.y0, text: title, size, weight: 700, fill: k.ink.primary, maxWidth: b.x1 - b.x0 })
    b.y0 += size * 1.2 + k.fs * 0.5
  }
  const note = String(p.note ?? '').trim()
  if (note) {
    const size = k.fs * 0.82
    k.text({ x: b.x0, y: b.y1, text: note, size, fill: k.ink.muted, baseline: 'bottom', maxWidth: b.x1 - b.x0 })
    b.y1 -= size * 1.2 + k.fs * 0.5
  }
  return b
}

export interface LegendItem {
  name: string
  color: string
  /** 圖例記號：方塊（長條、圓餅）或短線（折線） */
  mark: 'box' | 'line'
}

/** 水平圖例（放在上方或下方，太長會換行）；回傳佔用的高度 */
export function legendRow(k: Kit, items: LegendItem[], box: Box, at: 'top' | 'bottom'): number {
  const size = k.fs * 0.92
  const sw = k.fs * 0.72
  const gap = k.fs * 0.4
  const itemGap = k.fs * 1.2
  const rowH = k.fs * 1.5
  const maxW = box.x1 - box.x0
  // 先排版算出行數，再依上下位置決定起點
  const placed: { item: LegendItem; x: number; row: number; w: number }[] = []
  let x = 0
  let row = 0
  for (const item of items) {
    const w = sw + gap + Math.min(k.width(item.name, size), maxW - sw - gap)
    if (x > 0 && x + w > maxW) {
      x = 0
      row++
    }
    placed.push({ item, x, row, w })
    x += w + itemGap
  }
  const height = (row + 1) * rowH
  const top = at === 'top' ? box.y0 : box.y1 - height
  for (const { item, x: dx, row: r } of placed) {
    const cx = box.x0 + dx
    const cy = top + r * rowH + rowH / 2 - k.fs * 0.15
    if (item.mark === 'line') {
      k.out.push(new Konva.Line({ points: [cx, cy, cx + sw, cy], stroke: item.color, strokeWidth: k.fs * 0.2, lineCap: 'round', listening: false }))
    } else {
      k.out.push(new Konva.Rect({ x: cx, y: cy - sw / 2, width: sw, height: sw, fill: item.color, cornerRadius: sw * 0.2, listening: false }))
    }
    k.text({ x: cx + sw + gap, y: cy, text: item.name, size, baseline: 'middle', maxWidth: maxW - sw - gap })
  }
  return height + k.fs * 0.4
}

/** 沒有可畫的資料時：淡色虛線框＋說明 */
export function placeholder(k: Kit, box: Box, message: string) {
  k.out.push(
    new Konva.Rect({
      x: box.x0,
      y: box.y0,
      width: box.x1 - box.x0,
      height: box.y1 - box.y0,
      stroke: k.ink.muted,
      strokeWidth: k.fs * 0.08,
      dash: [k.fs * 0.4, k.fs * 0.3],
      cornerRadius: k.fs * 0.4,
      listening: false,
    }),
  )
  k.text({
    x: (box.x0 + box.x1) / 2,
    y: (box.y0 + box.y1) / 2,
    text: message,
    anchor: 'middle',
    baseline: 'middle',
    fill: k.ink.muted,
    maxWidth: box.x1 - box.x0 - k.fs,
  })
}
