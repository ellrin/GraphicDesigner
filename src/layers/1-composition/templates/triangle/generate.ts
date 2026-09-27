import { line, polygon, pt, type Primitive } from '../../../../core/geometry'
import { defineGenerator } from '../../../../core/registry'

interface P {
  apex: number
  marginX: number
  marginY: number
  median: boolean
}

// 三角形構圖：穩定、金字塔感。倒三角形請用「垂直翻轉」。
export default defineGenerator<P>(({ w, h }, p) => {
  const top = pt(w * p.apex, h * p.marginY)
  const left = pt(w * p.marginX, h * (1 - p.marginY))
  const right = pt(w * (1 - p.marginX), h * (1 - p.marginY))
  const primitives: Primitive[] = [polygon([top, right, left])]
  if (p.median) primitives.push(line(top, pt(top.x, left.y), { weight: 'sub', dashed: true }))

  const centroid = pt((top.x + left.x + right.x) / 3, (top.y + left.y + right.y) / 3)
  return {
    primitives,
    anchors: [
      { ...top, label: '頂點' },
      { ...left, label: '底角' },
      { ...right, label: '底角' },
      { ...centroid, label: '重心' },
    ],
  }
})
