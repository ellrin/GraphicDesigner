import { circle, line, pt, region, type Primitive } from '../../../../core/geometry'
import { defineGenerator } from '../../../../core/registry'

interface P {
  radius: number
  crosshair: boolean
}

// 中央構圖（日の丸構圖）：主體置於畫面正中央
export default defineGenerator<P>(({ w, h }, p) => {
  const c = pt(w / 2, h / 2)
  const primitives: Primitive[] = [circle(c, (Math.min(w, h) / 2) * p.radius)]
  if (p.crosshair) {
    primitives.push(line(pt(w / 2, 0), pt(w / 2, h), { weight: 'sub', dashed: true }))
    primitives.push(line(pt(0, h / 2), pt(w, h / 2), { weight: 'sub', dashed: true }))
  }
  const r = (Math.min(w, h) / 2) * p.radius
  return {
    primitives,
    anchors: [{ ...c, label: '中心' }],
    regions: [
      { ...region(c.x - r, c.y - r, 2 * r, 2 * r, '中央圓形', 'title'), shape: 'ellipse' },
      region(c.x - r, c.y - r, 2 * r, 2 * r, '中央方框', 'subject'),
      region(0, 0, w / 2, h / 2, '左上', 'image'),
      region(w / 2, 0, w / 2, h / 2, '右上', 'image'),
      region(0, h / 2, w / 2, h / 2, '左下', 'image'),
      region(w / 2, h / 2, w / 2, h / 2, '右下', 'image'),
    ],
  }
})
