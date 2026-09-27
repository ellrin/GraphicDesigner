import { pt, type Anchor, type Pt } from '../../../../core/geometry'
import { defineGenerator } from '../../../../core/registry'

interface P {
  amplitude: number
  bends: number
  margin: number
}

// S 曲線：視線沿曲線由下往上蜿蜒，常用於道路、河流、人物姿態
export default defineGenerator<P>(({ w, h }, p) => {
  const y0 = h * (1 - p.margin)
  const y1 = h * p.margin
  const at = (t: number): Pt =>
    pt(w / 2 + w * p.amplitude * Math.sin(Math.PI * p.bends * t), y0 + (y1 - y0) * t)

  const points = Array.from({ length: 121 }, (_, i) => at(i / 120))
  // 每個彎的頂點：sin 取極值處
  const anchors: Anchor[] = Array.from({ length: p.bends }, (_, i) => ({
    ...at((i + 0.5) / p.bends),
    label: '彎點',
  }))
  return { primitives: [{ kind: 'polyline', points }], anchors }
})
