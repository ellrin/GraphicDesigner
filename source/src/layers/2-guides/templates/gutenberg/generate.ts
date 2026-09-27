import { line, pt, region, text, type Primitive } from '../../../../core/geometry'
import { defineGenerator } from '../../../../core/registry'

interface P {
  splitX: number
  splitY: number
  labels: boolean
}

// 古騰堡圖表：視線受「閱讀重力」由左上斜向右下，右上與左下較少被注意
export default defineGenerator<P>(({ w, h }, p) => {
  const sx = w * p.splitX
  const sy = h * p.splitY
  const primitives: Primitive[] = [
    line(pt(sx, 0), pt(sx, h), { weight: 'sub', dashed: true }),
    line(pt(0, sy), pt(w, sy), { weight: 'sub', dashed: true }),
  ]
  const zones = [
    { name: '主要視覺區', c: pt(sx / 2, sy / 2) },
    { name: '強休息區', c: pt((sx + w) / 2, sy / 2) },
    { name: '弱休息區', c: pt(sx / 2, (sy + h) / 2) },
    { name: '終端視覺區', c: pt((sx + w) / 2, (sy + h) / 2) },
  ]
  // 閱讀重力：主要視覺區 → 終端視覺區
  primitives.push(line(zones[0].c, zones[3].c, { arrow: true }))
  if (p.labels) for (const z of zones) primitives.push(text(z.c, z.name, 'center', { weight: z === zones[1] || z === zones[2] ? 'sub' : 'main' }))

  return {
    primitives,
    anchors: [
      { ...zones[0].c, label: '主要視覺區' },
      { ...zones[3].c, label: '終端視覺區' },
    ],
    regions: [
      region(0, 0, sx, sy, '主要視覺區', 'title'),
      region(sx, 0, w - sx, sy, '強休息區', 'image'),
      region(0, sy, sx, h - sy, '弱休息區', 'text'),
      region(sx, sy, w - sx, h - sy, '終端視覺區', 'cta'),
    ],
  }
})
