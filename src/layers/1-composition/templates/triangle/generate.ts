import { line, polygon, polygonRegion, pt, type Pt, type Primitive, type Region } from '../../../../core/geometry'
import { cutByLine } from '../../../../core/partition'
import { defineGenerator } from '../../../../core/registry'

interface P {
  a: Pt
  b: Pt
  c: Pt
  bands: number
  median: boolean
}

const centroidOf = (ps: Pt[]) => pt(ps.reduce((s, p) => s + p.x, 0) / ps.length, ps.reduce((s, p) => s + p.y, 0) / ps.length)

// 三角形構圖：三個頂點都能在畫布上拖曳（可做等腰、倒三角、直角、不等邊三角）。
// 可再橫向切成數層，像金字塔一樣由上而下分配重要性。
export default defineGenerator<P>(({ w, h }, p) => {
  const tri = [p.a, p.b, p.c]
  const primitives: Primitive[] = [polygon(tri)]
  const regions: Region[] = [polygonRegion(tri, '三角形', 'subject')]
  const center = centroidOf(tri)

  // 三角形每一邊外側的區域（畫布被該邊延長線切開、不含三角形的那一側）
  const frame = [pt(0, 0), pt(w, 0), pt(w, h), pt(0, h)]
  const names = ['邊 1 外側', '邊 2 外側', '邊 3 外側']
  tri.forEach((v, i) => {
    const next = tri[(i + 1) % 3]
    const [l, r] = cutByLine(frame, v, next)
    // 取不含重心的一側
    const s = (next.x - v.x) * (center.y - v.y) - (next.y - v.y) * (center.x - v.x)
    const outer = s > 0 ? r : l
    if (outer.length >= 3) regions.push(polygonRegion(outer, names[i], 'other'))
  })

  // 橫向分層：三角形 ∩ 水平帶
  if (p.bands > 1) {
    const top = Math.min(...tri.map((q) => q.y))
    const bottom = Math.max(...tri.map((q) => q.y))
    const step = (bottom - top) / p.bands
    for (let k = 0; k < p.bands; k++) {
      const y0 = top + step * k
      const y1 = y0 + step
      // cutByLine 保留直線「左側」：由左往右的水平線左側是下方，由右往左則是上方
      const below = cutByLine(tri, pt(0, y0), pt(w, y0))[0]
      const band = below.length ? cutByLine(below, pt(w, y1), pt(0, y1))[0] : []
      if (band.length >= 3) regions.push(polygonRegion(band, `第 ${k + 1} 層`, k === 0 ? 'title' : k === p.bands - 1 ? 'image' : 'text'))
      if (k > 0) primitives.push(line(pt(0, y0), pt(w, y0), { weight: 'sub', dashed: true }))
    }
  }

  if (p.median) {
    const apex = tri.reduce((m, q) => (q.y < m.y ? q : m))
    primitives.push(line(apex, pt(apex.x, Math.max(...tri.map((q) => q.y))), { weight: 'sub', dashed: true }))
  }

  return {
    primitives,
    anchors: [
      { ...p.a, label: '頂點 A' },
      { ...p.b, label: '頂點 B' },
      { ...p.c, label: '頂點 C' },
      { ...center, label: '重心' },
    ],
    regions,
  }
})
