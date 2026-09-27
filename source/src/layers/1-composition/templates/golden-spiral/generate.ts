import { arcPoints, PHI, polygon, pt, region, type Anchor, type Primitive, type Pt, type Region } from '../../../../core/geometry'
import { defineGenerator } from '../../../../core/registry'

interface P {
  iterations: number
  fit: 'contain' | 'stretch'
  size: number
  /** 以畫布為準的位置（已換算成畫框座標）：黃金矩形在剩餘空間中的比例位置 */
  position: Pt
  showSquares: boolean
  showSpiral: boolean
}

interface R {
  x: number
  y: number
  w: number
  h: number
}

/**
 * 在 (φ × 1) 的黃金矩形上，依「左 → 上 → 右 → 下」的順序切出正方形，
 * 每個正方形畫一段四分之一圓弧，串成螺旋。回傳正方形、弧線與最後剩下的矩形。
 */
function spiral(iterations: number) {
  let r: R = { x: 0, y: 0, w: PHI, h: 1 }
  const squares: R[] = []
  const arcs: Pt[][] = []
  for (let i = 0; i < iterations; i++) {
    switch (i % 4) {
      case 0: {
        const s = r.h
        squares.push({ x: r.x, y: r.y, w: s, h: s })
        arcs.push(arcPoints(pt(r.x + s, r.y + s), s, Math.PI, 1.5 * Math.PI))
        r = { x: r.x + s, y: r.y, w: r.w - s, h: r.h }
        break
      }
      case 1: {
        const s = r.w
        squares.push({ x: r.x, y: r.y, w: s, h: s })
        arcs.push(arcPoints(pt(r.x, r.y + s), s, 1.5 * Math.PI, 2 * Math.PI))
        r = { x: r.x, y: r.y + s, w: r.w, h: r.h - s }
        break
      }
      case 2: {
        const s = r.h
        squares.push({ x: r.x + r.w - s, y: r.y, w: s, h: s })
        arcs.push(arcPoints(pt(r.x + r.w - s, r.y), s, 0, 0.5 * Math.PI))
        r = { x: r.x, y: r.y, w: r.w - s, h: r.h }
        break
      }
      case 3: {
        const s = r.w
        squares.push({ x: r.x, y: r.y + r.h - s, w: s, h: s })
        arcs.push(arcPoints(pt(r.x + s, r.y + r.h - s), s, 0.5 * Math.PI, Math.PI))
        r = { x: r.x, y: r.y, w: r.w, h: r.h - s }
        break
      }
    }
  }
  return { squares, arcs, rest: r }
}

export default defineGenerator<P>(({ w, h }, p) => {
  // 直式畫布：黃金矩形改為直立（螺旋座標 x ↔ y 對調）
  const portrait = h > w

  // 黃金矩形在畫布上的大小與位置
  let gw = w
  let gh = h
  if (p.fit === 'contain') {
    if (portrait) {
      gh = Math.min(h, w * PHI) * p.size
      gw = gh / PHI
    } else {
      gw = Math.min(w, h * PHI) * p.size
      gh = gw / PHI
    }
  }
  const ox = (w - gw) * (p.position.x / w)
  const oy = (h - gh) * (p.position.y / h)

  /** 螺旋座標（φ × 1 的矩形）→ 畫布座標 */
  const toCanvas = (q: Pt): Pt =>
    portrait ? pt(ox + q.y * gw, oy + (q.x / PHI) * gh) : pt(ox + (q.x / PHI) * gw, oy + q.y * gh)

  const { squares, arcs } = spiral(p.iterations)
  const primitives: Primitive[] = []

  const toPoly = (r: R, weight: 'main' | 'sub') =>
    polygon([pt(r.x, r.y), pt(r.x + r.w, r.y), pt(r.x + r.w, r.y + r.h), pt(r.x, r.y + r.h)].map(toCanvas), { weight })

  const toRegion = (r: R, label: string, role: string): Region => {
    const a = toCanvas(pt(r.x, r.y))
    const b = toCanvas(pt(r.x + r.w, r.y + r.h))
    return region(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(a.x - b.x), Math.abs(a.y - b.y), label, role)
  }

  const partial = p.fit === 'contain' && (gw < w - 1e-6 || gh < h - 1e-6)
  if (partial) primitives.push(toPoly({ x: 0, y: 0, w: PHI, h: 1 }, 'main'))
  if (p.showSquares) for (const s of squares) primitives.push(toPoly(s, 'sub'))
  if (p.showSpiral) {
    primitives.push({ kind: 'polyline', points: arcs.flat().map(toCanvas), weight: 'main' })
  }

  // 螺旋收斂點：取足夠多次迭代後剩餘矩形的中心
  const eye = spiral(40).rest
  const eyeC = pt(eye.x + eye.w / 2, eye.y + eye.h / 2)
  const anchors: Anchor[] = [
    { ...toCanvas(eyeC), label: '螺旋中心' },
    { ...toCanvas(pt(1, 0)), label: '主分割點' },
    { ...toCanvas(pt(1, 1)), label: '主分割點' },
  ]

  // 建議區塊：大正方形放主視覺、剩下的長條放文字、螺旋中心附近放焦點
  const focus = 1 / (PHI * PHI * PHI)
  const regions: Region[] = [
    // 螺旋切出的每一個正方形（由大到小），都可以作為區塊或其他構圖的套用範圍
    ...squares.map((sq, i) => toRegion(sq, `正方形 ${i + 1}`, i === 0 ? 'subject' : i === 1 ? 'title' : 'text')),
    toRegion({ x: 1, y: 0, w: PHI - 1, h: 1 }, '黃金副區（大正方形以外）', 'text'),
    toRegion({ x: eyeC.x - focus / 2, y: eyeC.y - focus / 2, w: focus, h: focus }, '螺旋中心焦點', 'subject'),
  ]
  if (partial) regions.push(toRegion({ x: 0, y: 0, w: PHI, h: 1 }, '黃金矩形', 'image'))
  return { primitives, anchors, regions }
})
