import Konva from 'konva'
import type { ShapeBuilder } from '../index'
import { paint } from '../style'

// 網點：格狀排列的點，大小可依方向漸變
const build: ShapeBuilder = (ctx) => {
  const { w, h, props: p } = ctx
  const cols = Math.max(1, p.cols as number)
  const cell = w / cols
  const rows = Math.max(1, Math.round(h / cell))
  const cellH = h / rows
  const min = p.min as number
  const square = p.shape === 'square'
  return [
    new Konva.Shape({
      ...paint(ctx),
      sceneFunc: (c, shape) => {
        c.beginPath()
        for (let j = 0; j < rows; j++) {
          for (let i = 0; i < cols; i++) {
            const u = (i + 0.5) / cols
            const v = (j + 0.5) / rows
            const t = p.gradient === 'x' ? u : p.gradient === 'y' ? v : p.gradient === 'radial' ? Math.min(1, Math.hypot(u - 0.5, v - 0.5) / 0.7071) : 0
            const k = 1 - (1 - min) * t
            const s = (Math.min(cell, cellH) / 2) * k * 0.95
            if (s <= 0.2) continue
            const x = -w / 2 + (i + 0.5) * cell
            const y = -h / 2 + (j + 0.5) * cellH
            if (square) c.rect(x - s, y - s, s * 2, s * 2)
            else {
              c.moveTo(x + s, y)
              c.arc(x, y, s, 0, Math.PI * 2)
            }
          }
        }
        c.fillStrokeShape(shape)
      },
      hitFunc: (c, shape) => {
        c.beginPath()
        c.rect(-w / 2, -h / 2, w, h)
        c.fillStrokeShape(shape)
      },
    }),
  ]
}
export default build
