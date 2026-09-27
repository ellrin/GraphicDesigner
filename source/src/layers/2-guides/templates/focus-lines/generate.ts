import { circle, line, rayToFrame, seeded, type Primitive, type Pt } from '../../../../core/geometry'
import { defineGenerator } from '../../../../core/registry'

interface P {
  focus: Pt
  count: number
  clear: number
  jitter: number
  ring: boolean
}

// 集中線：由畫面四周往焦點收束、但不碰到焦點，營造強烈的注目感
export default defineGenerator<P>((f, p) => {
  const { w, h } = f
  const inside = { x: Math.min(w, Math.max(0, p.focus.x)), y: Math.min(h, Math.max(0, p.focus.y)) }
  const r0 = Math.min(w, h) * p.clear
  const rand = seeded(p.count * 7919 + 17)
  const primitives: Primitive[] = []

  for (let i = 0; i < p.count; i++) {
    const a = (2 * Math.PI * (i + rand() * 0.6)) / p.count
    const edge = rayToFrame(inside, a, f)
    const r = r0 * (1 + p.jitter * rand())
    const start = { x: inside.x + Math.cos(a) * r, y: inside.y + Math.sin(a) * r }
    // 起點若已超出邊框（留白半徑太大），就不畫這條
    if (Math.hypot(edge.x - inside.x, edge.y - inside.y) > r) primitives.push(line(start, edge, { weight: i % 3 ? 'sub' : 'main' }))
  }
  if (p.ring) primitives.push(circle(inside, r0, { dashed: true }))

  return { primitives, anchors: [{ ...inside, label: '焦點' }] }
})
