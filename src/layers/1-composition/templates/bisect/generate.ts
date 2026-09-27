import { line, pt } from '../../../../core/geometry'
import { defineGenerator } from '../../../../core/registry'

interface P {
  axis: 'vertical' | 'horizontal'
  ratio: number
}

// 二分法（對稱構圖）：一條分割線把畫面分成兩區
export default defineGenerator<P>(({ w, h }, p) => {
  if (p.axis === 'vertical') {
    const x = w * p.ratio
    return {
      primitives: [line(pt(x, 0), pt(x, h))],
      anchors: [{ x, y: h / 2, label: '分割線中點' }, { x: x / 2, y: h / 2 }, { x: (x + w) / 2, y: h / 2 }],
    }
  }
  const y = h * p.ratio
  return {
    primitives: [line(pt(0, y), pt(w, y))],
    anchors: [{ x: w / 2, y, label: '分割線中點' }, { x: w / 2, y: y / 2 }, { x: w / 2, y: (y + h) / 2 }],
  }
})
