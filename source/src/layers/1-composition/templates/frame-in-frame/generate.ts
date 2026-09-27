import { rect, region, type Anchor, type Primitive, type Region } from '../../../../core/geometry'
import { defineGenerator } from '../../../../core/registry'

interface P {
  inset: number
  offsetX: number
  offsetY: number
  layers: number
}

// 框中框：用門窗、邊框等在畫面中再圍出一個框，聚焦主體
export default defineGenerator<P>(({ w, h }, p) => {
  const primitives: Primitive[] = []
  const anchors: Anchor[] = []
  const regions: Region[] = []
  const m = Math.min(w, h)

  for (let i = 1; i <= p.layers; i++) {
    const d = m * p.inset * i
    const iw = w - 2 * d
    const ih = h - 2 * d
    if (iw <= 0 || ih <= 0) break
    // 內框可偏移，但不超出畫布
    const x = d + p.offsetX * d
    const y = d + p.offsetY * d
    primitives.push(rect(x, y, iw, ih, { weight: i === p.layers ? 'main' : 'sub' }))
    if (i === p.layers) {
      anchors.push(
        { x, y, label: '內框角' },
        { x: x + iw, y },
        { x: x + iw, y: y + ih },
        { x, y: y + ih },
        { x: x + iw / 2, y: y + ih / 2, label: '內框中心' },
      )
      regions.push(region(x, y, iw, ih, '內框', 'subject'))
    }
  }
  return { primitives, anchors, regions }
})
