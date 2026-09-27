import { circle, line, pt, type Primitive } from '../../../../core/geometry'
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
  return { primitives, anchors: [{ ...c, label: '中心' }] }
})
