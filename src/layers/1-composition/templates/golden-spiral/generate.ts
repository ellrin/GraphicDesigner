import { arcPoints, PHI, polygon, pt, type Anchor, type Primitive, type Pt } from '../../../../core/geometry'
import { defineGenerator } from '../../../../core/registry'

interface P {
  iterations: number
  fit: 'contain' | 'stretch'
  align: 'start' | 'center' | 'end'
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
  // 直式畫布：在橫式畫框中計算後轉置（x ↔ y）
  const portrait = h > w
  const L = portrait ? { w: h, h: w } : { w, h }

  let gw = L.w
  let gh = L.h
  if (p.fit === 'contain') {
    if (L.w / L.h >= PHI) gw = L.h * PHI
    else gh = L.w / PHI
  }
  const k = { start: 0, center: 0.5, end: 1 }[p.align]
  const ox = (L.w - gw) * k
  const oy = (L.h - gh) * k

  const toCanvas = (q: Pt): Pt => {
    const x = ox + (q.x / PHI) * gw
    const y = oy + q.y * gh
    return portrait ? pt(y, x) : pt(x, y)
  }

  const { squares, arcs } = spiral(p.iterations)
  const primitives: Primitive[] = []

  const toPoly = (r: R, weight: 'main' | 'sub') =>
    polygon([pt(r.x, r.y), pt(r.x + r.w, r.y), pt(r.x + r.w, r.y + r.h), pt(r.x, r.y + r.h)].map(toCanvas), { weight })

  if (p.fit === 'contain' && (gw < L.w - 1e-6 || gh < L.h - 1e-6)) {
    primitives.push(toPoly({ x: 0, y: 0, w: PHI, h: 1 }, 'main'))
  }
  if (p.showSquares) for (const s of squares) primitives.push(toPoly(s, 'sub'))
  if (p.showSpiral) {
    primitives.push({ kind: 'polyline', points: arcs.flat().map(toCanvas), weight: 'main' })
  }

  // 螺旋收斂點：取足夠多次迭代後剩餘矩形的中心
  const eye = spiral(40).rest
  const anchors: Anchor[] = [
    { ...toCanvas(pt(eye.x + eye.w / 2, eye.y + eye.h / 2)), label: '螺旋中心' },
    { ...toCanvas(pt(1, 0)), label: '主分割點' },
    { ...toCanvas(pt(1, 1)), label: '主分割點' },
  ]
  return { primitives, anchors }
})
