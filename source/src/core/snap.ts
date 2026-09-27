// 吸附的幾何資料與計算：點（錨點、交點）、任意角度的線段與曲線、水平／垂直線、
// 旋轉角度（引導線的方向），以及尺寸比例（1/3、1/2、0.618…）。

import { PHI, type GuideOutput, type Pt } from './geometry'
import { snapOffset, type SnapLines } from './blocks'

export interface SnapGeometry extends SnapLines {
  /** 可吸附的點：錨點、線的交點 */
  points: Pt[]
  /** 可吸附的線段（含曲線取樣後的小段），點會被投影到線上 */
  segments: [Pt, Pt][]
  /** 引導線的方向（度，0–180），物件旋轉時吸附 */
  angles: number[]
}

export const EMPTY_SNAP: SnapGeometry = { xs: [], ys: [], points: [], segments: [], angles: [] }

/** 尺寸比例吸附的候選值（相對畫布寬或高） */
export const SIZE_RATIOS: { value: number; label: string }[] = [
  { value: 1, label: '1' },
  { value: 1 / PHI, label: '0.618' },
  { value: 2 / 3, label: '2/3' },
  { value: 1 / 2, label: '1/2' },
  { value: 1 / (PHI * PHI), label: '0.382' },
  { value: 1 / 3, label: '1/3' },
  { value: 1 / 4, label: '1/4' },
  { value: 1 / (PHI * PHI * PHI), label: '0.236' },
]

export function segmentsFrom(outputs: GuideOutput[]): [Pt, Pt][] {
  const segs: [Pt, Pt][] = []
  for (const o of outputs) {
    for (const p of o.primitives) {
      if (p.kind === 'line') segs.push([p.a, p.b])
      else if (p.kind === 'polyline') {
        const n = p.closed ? p.points.length : p.points.length - 1
        for (let i = 0; i < n; i++) segs.push([p.points[i], p.points[(i + 1) % p.points.length]])
      }
    }
  }
  return segs
}

/** 直線（非曲線取樣）的方向，去除重複，包含 0 與 90 度 */
export function anglesFrom(outputs: GuideOutput[]): number[] {
  const out = new Set<number>([0, 90])
  for (const o of outputs) {
    for (const p of o.primitives) {
      const segs: [Pt, Pt][] =
        p.kind === 'line'
          ? [[p.a, p.b]]
          : p.kind === 'polyline' && p.points.length <= 12
            ? p.points.slice(0, -1).map((q, i) => [q, p.points[i + 1]] as [Pt, Pt])
            : []
      for (const [a, b] of segs) {
        if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) continue
        const deg = (((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI) % 180 + 180) % 180
        out.add(Math.round(deg * 10) / 10)
      }
    }
  }
  return [...out]
}

/** 點投影到線段上的最近點 */
export function projectToSegment(p: Pt, [a, b]: [Pt, Pt]): Pt {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  if (len2 < 1e-12) return a
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return { x: a.x + t * dx, y: a.y + t * dy }
}

/**
 * 吸附一個點。優先順序：錨點／交點 → 線上（任意角度與曲線）→ 水平／垂直線（x、y 各自）。
 * limit 為畫布座標下的吸附距離。
 */
export function snapPoint(p: Pt, g: SnapGeometry, limit: number): { p: Pt; kind: 'point' | 'line' | 'axis' | null } {
  let best: Pt | null = null
  let bestD = limit * 1.4
  for (const q of g.points) {
    const d = Math.hypot(q.x - p.x, q.y - p.y)
    if (d < bestD) [best, bestD] = [q, d]
  }
  if (best) return { p: { x: best.x, y: best.y }, kind: 'point' }

  bestD = limit
  for (const s of g.segments) {
    const q = projectToSegment(p, s)
    const d = Math.hypot(q.x - p.x, q.y - p.y)
    if (d < bestD) [best, bestD] = [q, d]
  }
  if (best) return { p: best, kind: 'line' }

  const dx = snapOffset([p.x], g.xs, limit)
  const dy = snapOffset([p.y], g.ys, limit)
  return { p: { x: p.x + dx, y: p.y + dy }, kind: dx || dy ? 'axis' : null }
}

/** 尺寸吸附到畫布比例；回傳吸附後的長度與比例名稱（沒有吸附時 label 為空） */
export function snapSize(len: number, total: number, limit: number): { len: number; label: string } {
  for (const r of SIZE_RATIOS) {
    const v = total * r.value
    if (Math.abs(v - len) < limit) return { len: v, label: r.label }
  }
  return { len, label: '' }
}

export function buildSnapGeometry(outputs: GuideOutput[], base: SnapLines, points: Pt[]): SnapGeometry {
  return { ...base, points, segments: segmentsFrom(outputs), angles: anglesFrom(outputs) }
}
