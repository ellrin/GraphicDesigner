// 第五層：對齊與等距分佈。以物件框（0–1 相對座標，不含旋轉）計算，回傳每個物件的新位置。

import type { Rect } from './geometry'

export type AlignEdge = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'
export type Axis = 'x' | 'y'

interface Item extends Rect {
  uid: string
}

export function boundsOf(items: Rect[]): Rect {
  const x = Math.min(...items.map((r) => r.x))
  const y = Math.min(...items.map((r) => r.y))
  const r = Math.max(...items.map((i) => i.x + i.w))
  const b = Math.max(...items.map((i) => i.y + i.h))
  return { x, y, w: r - x, h: b - y }
}

/** 對齊到 target 範圍（多選時為選取範圍、單選時通常為畫布 {0,0,1,1}）。 */
export function align(items: Item[], edge: AlignEdge, target: Rect): Map<string, { x?: number; y?: number }> {
  const out = new Map<string, { x?: number; y?: number }>()
  for (const i of items) {
    switch (edge) {
      case 'left':
        out.set(i.uid, { x: target.x })
        break
      case 'hcenter':
        out.set(i.uid, { x: target.x + (target.w - i.w) / 2 })
        break
      case 'right':
        out.set(i.uid, { x: target.x + target.w - i.w })
        break
      case 'top':
        out.set(i.uid, { y: target.y })
        break
      case 'vcenter':
        out.set(i.uid, { y: target.y + (target.h - i.h) / 2 })
        break
      case 'bottom':
        out.set(i.uid, { y: target.y + target.h - i.h })
        break
    }
  }
  return out
}

/**
 * 等距分佈：頭尾兩個物件不動，中間的物件讓彼此「間距」相等。
 * 需要至少 3 個物件。
 */
export function distribute(items: Item[], axis: Axis): Map<string, { x?: number; y?: number }> {
  const out = new Map<string, { x?: number; y?: number }>()
  if (items.length < 3) return out
  const pos = (i: Item) => (axis === 'x' ? i.x : i.y)
  const size = (i: Item) => (axis === 'x' ? i.w : i.h)
  const sorted = [...items].sort((a, b) => pos(a) - pos(b))
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const span = pos(last) + size(last) - pos(first)
  const total = sorted.reduce((s, i) => s + size(i), 0)
  const gap = (span - total) / (sorted.length - 1)
  let cursor = pos(first)
  for (const i of sorted) {
    out.set(i.uid, axis === 'x' ? { x: cursor } : { y: cursor })
    cursor += size(i) + gap
  }
  return out
}
