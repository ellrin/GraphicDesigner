import { line, polygonRegion, pt, type Anchor, type Primitive, type Pt, type Region } from '../../../../core/geometry'
import { cutByLine } from '../../../../core/partition'
import { defineGenerator } from '../../../../core/registry'

interface P {
  center: Pt
  angle: number
  width: number
  bands: number
  gap: number
}

/** 通過 c、方向 d 的直線與畫框的兩個交點（畫出來的線段） */
function clipLine(c: Pt, d: Pt, w: number, h: number): [Pt, Pt] | null {
  const ts: number[] = []
  if (Math.abs(d.x) > 1e-9) ts.push(-c.x / d.x, (w - c.x) / d.x)
  if (Math.abs(d.y) > 1e-9) ts.push(-c.y / d.y, (h - c.y) / d.y)
  const pts = ts
    .map((t) => pt(c.x + d.x * t, c.y + d.y * t))
    .filter((p) => p.x >= -1e-6 && p.x <= w + 1e-6 && p.y >= -1e-6 && p.y <= h + 1e-6)
  if (pts.length < 2) return null
  pts.sort((a, b) => a.x - b.x || a.y - b.y)
  return [pts[0], pts[pts.length - 1]]
}

// 斜帶構圖：一條（或數條平行）有寬度的斜帶貫穿畫面，標題或商品沿著斜帶排列，帶來速度感與動感
export default defineGenerator<P>(({ w, h }, p) => {
  const a = (p.angle * Math.PI) / 180
  const d = pt(Math.cos(a), Math.sin(a))
  const n = pt(-d.y, d.x) // 法向量（斜帶寬度方向）
  const bandW = Math.min(w, h) * p.width
  const step = bandW + Math.min(w, h) * p.gap
  const frame = [pt(0, 0), pt(w, 0), pt(w, h), pt(0, h)]

  const primitives: Primitive[] = []
  const anchors: Anchor[] = []
  const regions: Region[] = []
  const edges: Pt[] = [] // 每條邊界線上的一點（依法向量排序）

  for (let k = 0; k < p.bands; k++) {
    const off = (k - (p.bands - 1) / 2) * step
    const c = pt(p.center.x + n.x * off, p.center.y + n.y * off)
    const e1 = pt(c.x - (n.x * bandW) / 2, c.y - (n.y * bandW) / 2)
    const e2 = pt(c.x + (n.x * bandW) / 2, c.y + (n.y * bandW) / 2)
    for (const e of [e1, e2]) {
      const seg = clipLine(e, d, w, h)
      if (seg) primitives.push(line(seg[0], seg[1]))
    }
    const mid = clipLine(c, d, w, h)
    if (mid) primitives.push(line(mid[0], mid[1], { weight: 'sub', dashed: true }))
    anchors.push({ ...c, label: `斜帶 ${k + 1} 中心` })
    if (mid) anchors.push({ ...pt((mid[0].x + c.x) / 2, (mid[0].y + c.y) / 2), label: `斜帶 ${k + 1}` }, { ...pt((mid[1].x + c.x) / 2, (mid[1].y + c.y) / 2), label: `斜帶 ${k + 1}` })

    // 斜帶本身：畫框 ∩ 兩條邊界之間（cutByLine 的左側 [0] 是法向量 n 的正方向）
    const inner = cutByLine(frame, e1, pt(e1.x + d.x, e1.y + d.y))[0]
    const band = inner.length ? cutByLine(inner, e2, pt(e2.x + d.x, e2.y + d.y))[1] : []
    if (band.length >= 3) regions.push(polygonRegion(band, `斜帶 ${k + 1}`, k === 0 ? 'title' : 'subject'))
    edges.push(e1, e2)
  }

  // 斜帶以外的上、下兩塊
  if (edges.length) {
    const first = edges[0]
    const last = edges[edges.length - 1]
    const sideA = cutByLine(frame, first, pt(first.x + d.x, first.y + d.y))[1]
    const sideB = cutByLine(frame, last, pt(last.x + d.x, last.y + d.y))[0]
    if (sideA.length >= 3) regions.push(polygonRegion(sideA, '斜帶一側', 'image'))
    if (sideB.length >= 3) regions.push(polygonRegion(sideB, '斜帶另一側', 'text'))
  }

  return { primitives, anchors, regions }
})
