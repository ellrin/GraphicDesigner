import { line, pt, type Primitive, type Pt } from '../../../../core/geometry'
import { defineGenerator } from '../../../../core/registry'

interface P {
  horizon: number
  vp1x: number
  vp2x: number
  rays: number
  third: 'none' | 'up' | 'down'
  thirdDist: number
}

// 兩點（或三點）透視：兩個消失點位於地平線上，常在畫面外
export default defineGenerator<P>(({ w, h }, p) => {
  const hy = h * p.horizon
  const primitives: Primitive[] = [line(pt(0, hy), pt(w, hy))]

  /** 從消失點向「對面那一側」的邊扇形射出，涵蓋整個畫面（畫面外的部分會被裁掉）。 */
  const fan = (vp: Pt, targetAt: (t: number) => Pt) => {
    for (let i = 0; i <= p.rays; i++) primitives.push(line(vp, targetAt(i / p.rays), { weight: 'sub' }))
  }

  const vp1 = pt(w * p.vp1x, hy)
  const vp2 = pt(w * p.vp2x, hy)
  fan(vp1, (t) => pt(w, -h / 2 + 2 * h * t))
  fan(vp2, (t) => pt(0, -h / 2 + 2 * h * t))

  if (p.third !== 'none') {
    // 第三消失點：垂直方向的線收束到畫面上方或下方
    const y3 = p.third === 'down' ? h * (1 + p.thirdDist) : -h * p.thirdDist
    const edge = p.third === 'down' ? 0 : h
    fan(pt(w / 2, y3), (t) => pt(-w / 2 + 2 * w * t, edge))
  }

  return { primitives, anchors: [{ x: w / 2, y: hy, label: '地平線' }] }
})
