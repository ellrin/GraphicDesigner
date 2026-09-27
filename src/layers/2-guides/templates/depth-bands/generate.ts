import { line, pt, region, text, type Primitive } from '../../../../core/geometry'
import { defineGenerator } from '../../../../core/registry'

interface P {
  far: number
  near: number
  labels: boolean
}

// 景深分帶：把畫面由上而下分成背景、中景、前景
export default defineGenerator<P>(({ w, h }, p) => {
  const y1 = h * Math.min(p.far, p.near)
  const y2 = h * Math.max(p.far, p.near)
  const primitives: Primitive[] = [line(pt(0, y1), pt(w, y1)), line(pt(0, y2), pt(w, y2))]
  const bands = [
    { name: '背景', y: y1 / 2 },
    { name: '中景', y: (y1 + y2) / 2 },
    { name: '前景', y: (y2 + h) / 2 },
  ]
  if (p.labels) for (const b of bands) primitives.push(text(pt(w * 0.02, b.y), b.name, 'left'))
  return {
    primitives,
    anchors: bands.map((b) => ({ x: w / 2, y: b.y, label: b.name })),
    regions: [
      region(0, 0, w, y1, '背景帶', 'background'),
      region(0, y1, w, y2 - y1, '中景帶', 'subject'),
      region(0, y2, w, h - y2, '前景帶', 'image'),
    ],
  }
})
