import { line, pt, type Anchor, type Primitive } from '../../../../core/geometry'
import { defineGenerator } from '../../../../core/registry'

interface P {
  margin: number
  bars: number
  first: number
  decay: number
}

// F 型動線：先橫向讀完第一行，往下逐行讀得越來越短，最後沿左側往下掃
export default defineGenerator<P>(({ w, h }, p) => {
  const mx = w * p.margin
  const my = h * p.margin
  const usableW = w - 2 * mx
  const gap = (h - 2 * my) / (p.bars + 1)
  const primitives: Primitive[] = [line(pt(mx, my), pt(mx, h - my), { arrow: true, weight: 'sub' })]
  const anchors: Anchor[] = []
  for (let i = 0; i < p.bars; i++) {
    const y = my + gap * i
    const len = usableW * p.first * Math.pow(p.decay, i)
    primitives.push(line(pt(mx, y), pt(mx + len, y), { arrow: true }))
    anchors.push({ x: mx, y, label: `第 ${i + 1} 行起點` })
  }
  return { primitives, anchors }
})
