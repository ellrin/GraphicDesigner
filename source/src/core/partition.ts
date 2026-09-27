// 由直線切出的區域：把畫布（凸多邊形）依序用「完整穿過它」的線段切開，得到所有小區域。
// 例如對角線構圖會得到三角形與梯形、三分法得到九宮格。結果只作為建議區塊，由使用者決定是否採用。

import type { GuideOutput, Pt, Rect } from './geometry'

type Poly = Pt[]
type Seg = [Pt, Pt]

const EPS = 1e-4
const MAX_FACES = 160

function segmentsOf(outputs: GuideOutput[]): Seg[] {
  const segs: Seg[] = []
  for (const o of outputs) {
    for (const p of o.primitives) {
      if (p.kind === 'line') segs.push([p.a, p.b])
      else if (p.kind === 'polyline' && p.points.length <= 12) {
        // 曲線（大量取樣點）不參與切割，只用少量頂點的折線與多邊形邊
        const pts = p.points
        const n = p.closed ? pts.length : pts.length - 1
        for (let i = 0; i < n; i++) segs.push([pts[i], pts[(i + 1) % pts.length]])
      }
    }
  }
  return segs
}

/** 點在直線哪一側（>0 左、<0 右） */
/** 點到直線的有號距離（>0 左、<0 右），已除以線段長度，所以容許誤差與線段長短無關 */
const side = (a: Pt, b: Pt, p: Pt) =>
  ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / (Math.hypot(b.x - a.x, b.y - a.y) || 1)

/** 線段所在直線與多邊形邊界的交點，回傳切開後的兩塊（線段沒有完整穿過時回傳 null） */
function split(poly: Poly, [a, b]: Seg): [Poly, Poly] | null {
  const left: Poly = []
  const right: Poly = []
  const hits: Pt[] = []
  const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
  if (len2 < EPS) return null
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const sp = side(a, b, p)
    const sq = side(a, b, q)
    if (sp >= -EPS) left.push(p)
    if (sp <= EPS) right.push(p)
    // 線剛好通過頂點（例如對角線經過畫布的角）也算交點
    if (Math.abs(sp) <= EPS) hits.push(p)
    if ((sp > EPS && sq < -EPS) || (sp < -EPS && sq > EPS)) {
      const t = sp / (sp - sq)
      const x = { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }
      left.push(x)
      right.push(x)
      hits.push(x)
    }
  }
  if (hits.length !== 2 || left.length < 3 || right.length < 3) return null
  // 兩個交點都要落在線段範圍內（容許一點誤差），否則代表線段沒有完整穿過這一塊
  const tol = 0.01
  for (const h of hits) {
    const t = ((h.x - a.x) * (b.x - a.x) + (h.y - a.y) * (b.y - a.y)) / len2
    if (t < -tol || t > 1 + tol) return null
  }
  return [left, right]
}

/** 用一條無限延伸的直線把凸多邊形切成兩半（左側、右側）；沒有切到時該側為空陣列 */
export function cutByLine(poly: Poly, a: Pt, b: Pt): [Poly, Poly] {
  const left: Poly = []
  const right: Poly = []
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const sp = side(a, b, p)
    const sq = side(a, b, q)
    if (sp >= -EPS) left.push(p)
    if (sp <= EPS) right.push(p)
    if ((sp > EPS && sq < -EPS) || (sp < -EPS && sq > EPS)) {
      const t = sp / (sp - sq)
      const x = { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }
      left.push(x)
      right.push(x)
    }
  }
  return [left.length >= 3 ? left : [], right.length >= 3 ? right : []]
}

export const area = (poly: Poly) =>
  Math.abs(poly.reduce((s, p, i) => {
    const q = poly[(i + 1) % poly.length]
    return s + p.x * q.y - q.x * p.y
  }, 0)) / 2

export function facesFromLines(outputs: GuideOutput[], frame: Rect): Poly[] {
  let faces: Poly[] = [[
    { x: frame.x, y: frame.y },
    { x: frame.x + frame.w, y: frame.y },
    { x: frame.x + frame.w, y: frame.y + frame.h },
    { x: frame.x, y: frame.y + frame.h },
  ]]
  for (const seg of segmentsOf(outputs)) {
    const next: Poly[] = []
    for (const f of faces) {
      const parts = split(f, seg)
      if (parts) next.push(...parts)
      else next.push(f)
    }
    faces = next
    if (faces.length > MAX_FACES) break
  }
  // 太小的碎片（小於畫面 0.5%）不列入
  const min = frame.w * frame.h * 0.005
  return faces.filter((f) => area(f) >= min)
}
