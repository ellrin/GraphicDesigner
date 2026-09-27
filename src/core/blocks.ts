// 第三層：區塊的資料型別、吸附線與建議區塊的計算。

import roles from '../config/block-roles.json'
import type { Frame, GuideOutput, Rect, Region } from './geometry'

export interface BlockRole {
  id: string
  label: string
  color: string
}

export const BLOCK_ROLES: BlockRole[] = roles
export const roleOf = (id: string): BlockRole => BLOCK_ROLES.find((r) => r.id === id) ?? BLOCK_ROLES.at(-1)!

/** 區塊位置以相對畫布的 0–1 儲存，改畫布尺寸時會等比例跟著調整。 */
export interface Block {
  uid: string
  name: string
  role: string
  x: number
  y: number
  w: number
  h: number
  /** 是否填色；不填色時只顯示框線 */
  filled: boolean
  color: string
  opacity: number
  visible: boolean
}

export const toCanvasRect = (b: Rect, c: Frame): Rect => ({ x: b.x * c.w, y: b.y * c.h, w: b.w * c.w, h: b.h * c.h })
export const toRelativeRect = (r: Rect, c: Frame): Rect => ({ x: r.x / c.w, y: r.y / c.h, w: r.w / c.w, h: r.h / c.h })

// ── 吸附 ───────────────────────────────────────────────

export interface SnapLines {
  xs: number[]
  ys: number[]
}

const uniq = (vs: number[]) => [...new Set(vs.map((v) => Math.round(v * 1000) / 1000))]

/**
 * 可吸附的位置（畫布座標）：畫布邊緣與中線、所有錨點的 x／y、
 * 以及引導線中水平或垂直的線段。
 */
export function snapLinesFrom(outputs: GuideOutput[], c: Frame): SnapLines {
  const xs = [0, c.w / 2, c.w]
  const ys = [0, c.h / 2, c.h]
  const eps = 1e-6
  for (const o of outputs) {
    for (const a of o.anchors) {
      xs.push(a.x)
      ys.push(a.y)
    }
    for (const p of o.primitives) {
      const segs =
        p.kind === 'line'
          ? [[p.a, p.b]]
          : p.kind === 'polyline'
            ? p.points.map((q, i) => [q, p.points[(i + 1) % p.points.length]]).slice(0, p.closed ? undefined : -1)
            : []
      for (const [a, b] of segs) {
        if (Math.abs(a.x - b.x) < eps) xs.push(a.x)
        if (Math.abs(a.y - b.y) < eps) ys.push(a.y)
      }
    }
  }
  return { xs: uniq(xs), ys: uniq(ys) }
}

/** 在 candidates 中找最接近 values 其中之一的位置；回傳需要的位移（找不到則為 0）。 */
export function snapOffset(values: number[], candidates: number[], limit: number): number {
  let best = 0
  let bestD = limit
  for (const v of values) {
    for (const c of candidates) {
      const d = Math.abs(c - v)
      if (d < bestD) [best, bestD] = [c - v, d]
    }
  }
  return best
}

// ── 建議區塊 ───────────────────────────────────────────

export interface Suggestion extends Region {
  /** 來源：哪個構圖或引導 */
  source: string
}

/**
 * 收集建議區塊：各版型自己提供的 regions，加上「以錨點為中心」的通用建議與全版背景。
 * 幾乎相同的矩形會合併。
 */
export function collectSuggestions(sources: { name: string; output: GuideOutput }[], c: Frame): Suggestion[] {
  const out: Suggestion[] = [{ x: 0, y: 0, w: c.w, h: c.h, label: '全版背景', role: 'background', source: '畫布' }]
  const side = Math.min(c.w, c.h) * 0.22

  for (const s of sources) {
    for (const r of s.output.regions ?? []) out.push({ ...r, source: s.name })
    for (const a of s.output.anchors) {
      const x = Math.min(Math.max(0, a.x - side / 2), c.w - side)
      const y = Math.min(Math.max(0, a.y - side / 2), c.h - side)
      out.push({ x, y, w: side, h: side, label: a.label ? `${a.label}的主體` : '錨點主體', role: 'subject', source: s.name })
    }
  }

  const tol = Math.min(c.w, c.h) * 0.01
  const same = (a: Rect, b: Rect) =>
    Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol && Math.abs(a.w - b.w) < tol && Math.abs(a.h - b.h) < tol
  return out.filter((r, i) => r.w > tol && r.h > tol && out.findIndex((q) => same(q, r)) === i)
}
