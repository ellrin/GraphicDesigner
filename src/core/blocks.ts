// 第三層：區塊的資料型別、吸附線與建議區塊的計算。

import roles from '../config/block-roles.json'
import { boundsOfPoints, type Frame, type GuideOutput, type Pt, type Rect, type Region } from './geometry'
import { facesFromLines } from './partition'

export interface BlockRole {
  id: string
  label: string
  color: string
}

export const BLOCK_ROLES: BlockRole[] = roles
export const roleOf = (id: string): BlockRole => BLOCK_ROLES.find((r) => r.id === id) ?? BLOCK_ROLES.at(-1)!

export type BlockShape = 'rect' | 'ellipse' | 'polygon'

export const BLOCK_SHAPES: { id: BlockShape; label: string }[] = [
  { id: 'rect', label: '矩形' },
  { id: 'ellipse', label: '橢圓／圓形' },
  { id: 'polygon', label: '多邊形' },
]

/**
 * 區塊位置以相對畫布的 0–1 儲存，改畫布尺寸時會等比例跟著調整。
 * x／y／w／h 永遠是外框；橢圓內接於外框，多邊形另外記錄頂點（同樣是 0–1 相對座標）。
 */
export interface Block {
  uid: string
  name: string
  role: string
  shape: BlockShape
  points?: Pt[]
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
export const toCanvasPoints = (ps: Pt[], c: Frame): Pt[] => ps.map((p) => ({ x: p.x * c.w, y: p.y * c.h }))
export const toRelativePoints = (ps: Pt[], c: Frame): Pt[] => ps.map((p) => ({ x: p.x / c.w, y: p.y / c.h }))

/** 外框改變時，把多邊形頂點從舊外框等比例搬到新外框 */
export function remapPoints(points: Pt[], from: Rect, to: Rect): Pt[] {
  const sx = from.w ? to.w / from.w : 1
  const sy = from.h ? to.h / from.h : 1
  return points.map((p) => ({ x: to.x + (p.x - from.x) * sx, y: to.y + (p.y - from.y) * sy }))
}

export { boundsOfPoints }

/**
 * 在區塊形狀的路徑上作畫（畫布座標）。用於區塊的繪製與物件的裁切遮罩。
 */
export function traceShape(
  ctx: { beginPath(): void; rect(x: number, y: number, w: number, h: number): void; ellipse(x: number, y: number, rx: number, ry: number, rot: number, s: number, e: number): void; moveTo(x: number, y: number): void; lineTo(x: number, y: number): void; closePath(): void },
  shape: BlockShape,
  r: Rect,
  points?: Pt[],
) {
  if (shape === 'ellipse') ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, Math.max(0, r.w / 2), Math.max(0, r.h / 2), 0, 0, Math.PI * 2)
  else if (shape === 'polygon' && points && points.length >= 3) {
    ctx.moveTo(points[0].x, points[0].y)
    for (const p of points.slice(1)) ctx.lineTo(p.x, p.y)
    ctx.closePath()
  } else ctx.rect(r.x, r.y, r.w, r.h)
}

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

/** 線段交點（兩段都要真的相交） */
function segmentIntersection(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const den = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x)
  if (Math.abs(den) < 1e-9) return null
  const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / den
  const u = -((a.x - b.x) * (a.y - c.y) - (a.y - b.y) * (a.x - c.x)) / den
  if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }
}

/** 可吸附的點：所有錨點，加上直線之間的交點（曲線不計） */
export function snapPointsFrom(outputs: GuideOutput[]): Pt[] {
  const pts: Pt[] = []
  const segs: [Pt, Pt][] = []
  for (const o of outputs) {
    pts.push(...o.anchors)
    for (const p of o.primitives) {
      if (p.kind === 'line') segs.push([p.a, p.b])
      else if (p.kind === 'polyline' && p.points.length <= 12) {
        const n = p.closed ? p.points.length : p.points.length - 1
        for (let i = 0; i < n; i++) segs.push([p.points[i], p.points[(i + 1) % p.points.length]])
      }
    }
  }
  const capped = segs.slice(0, 400)
  for (let i = 0; i < capped.length; i++) {
    for (let j = i + 1; j < capped.length; j++) {
      const x = segmentIntersection(capped[i][0], capped[i][1], capped[j][0], capped[j][1])
      if (x) pts.push(x)
    }
  }
  // 去除幾乎重疊的點
  const out: Pt[] = []
  for (const p of pts) if (!out.some((q) => Math.abs(q.x - p.x) < 1e-3 && Math.abs(q.y - p.y) < 1e-3)) out.push(p)
  return out
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

  // 由直線切出的區域（三角形、梯形、格子…）
  const faces = facesFromLines(
    sources.map((s) => s.output),
    { x: 0, y: 0, w: c.w, h: c.h },
  )
  faces.forEach((f, i) => {
    const b = boundsOfPoints(f)
    const isRect = f.length === 4 && f.every((p) => [b.x, b.x + b.w].some((x) => Math.abs(p.x - x) < 1e-3) && [b.y, b.y + b.h].some((y) => Math.abs(p.y - y) < 1e-3))
    out.push({ ...b, points: isRect ? undefined : f, label: `區域 ${i + 1}`, role: 'other', source: '線條切出的區域' })
  })

  const tol = Math.min(c.w, c.h) * 0.01
  const same = (a: Suggestion, b: Suggestion) =>
    !!a.points === !!b.points &&
    a.shape === b.shape &&
    Math.abs(a.x - b.x) < tol &&
    Math.abs(a.y - b.y) < tol &&
    Math.abs(a.w - b.w) < tol &&
    Math.abs(a.h - b.h) < tol
  return out.filter((r, i) => r.w > tol && r.h > tol && out.findIndex((q) => same(q, r)) === i)
}
