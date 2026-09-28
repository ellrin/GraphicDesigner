import Konva from 'konva'
import type { ShapeBuilder } from '../index'
import { paletteCycle, rng } from '../style'

// 紙屑：隨機散落的紙條、圓點、三角（多色時使用配色；種子相同時位置固定）
const build: ShapeBuilder = (ctx) => {
  const { w, h, props: p } = ctx
  const colors = p.multicolor && ctx.palette.length ? paletteCycle(ctx) : [ctx.fill || '#f0642a']
  const kinds = p.mix === 'mixed' ? ['strip', 'dot', 'triangle'] : [p.mix as string]
  const r = rng(p.seed as number)
  const unit = Math.min(w, h) * 0.06 * (p.size as number)
  const pieces = Array.from({ length: p.count as number }, () => ({
    x: -w / 2 + r() * w,
    y: -h / 2 + r() * h,
    s: unit * (0.6 + r() * 0.8),
    rot: r() * Math.PI * 2,
    kind: kinds[Math.floor(r() * kinds.length)],
    color: colors[Math.floor(r() * colors.length)],
  }))
  return [
    new Konva.Shape({
      sceneFunc: (c) => {
        for (const q of pieces) {
          c.save()
          c.translate(q.x, q.y)
          c.rotate(q.rot)
          c.beginPath()
          if (q.kind === 'dot') c.arc(0, 0, q.s / 2, 0, Math.PI * 2)
          else if (q.kind === 'triangle') {
            c.moveTo(0, -q.s / 2)
            c.lineTo(q.s / 2, q.s / 2)
            c.lineTo(-q.s / 2, q.s / 2)
            c.closePath()
          } else c.rect(-q.s, -q.s / 4, q.s * 2, q.s / 2)
          c.setAttr('fillStyle', q.color)
          c.fill()
          c.restore()
        }
      },
      hitFunc: (c, shape) => {
        c.beginPath()
        c.rect(-w / 2, -h / 2, w, h)
        c.fillStrokeShape(shape)
      },
      fill: '#000',
    }),
  ]
}
export default build
