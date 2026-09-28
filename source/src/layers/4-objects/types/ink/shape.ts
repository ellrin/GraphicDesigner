import Konva from 'konva'
import type { ShapeBuilder } from '../index'
import { paint, rng } from '../style'

// 潑墨：不規則的墨塊，加上向外噴濺的尖角與墨點（種子相同時形狀固定）
const build: ShapeBuilder = (ctx) => {
  const { w, h, props: p } = ctx
  const r = rng(p.seed as number)
  const rough = p.roughness as number
  const splash = p.splash as number
  const rx = w * 0.3
  const ry = h * 0.3
  const waves = Array.from({ length: 4 }, () => ({ f: 2 + Math.floor(r() * 6), a: (0.05 + r() * 0.12) * rough, ph: r() * Math.PI * 2 }))
  const spikes = Array.from({ length: Math.round(3 + splash * 9) }, () => ({ at: r() * Math.PI * 2, len: (0.2 + r() * 0.6) * splash, width: 0.05 + r() * 0.1 }))
  const pts: number[] = []
  const N = 120
  for (let i = 0; i < N; i++) {
    const t = (i / N) * Math.PI * 2
    let k = 1 + waves.reduce((s, v) => s + v.a * Math.sin(v.f * t + v.ph), 0)
    for (const s of spikes) {
      const d = Math.atan2(Math.sin(t - s.at), Math.cos(t - s.at))
      k += s.len * Math.exp(-(d * d) / (2 * s.width * s.width))
    }
    pts.push(Math.cos(t) * rx * k, Math.sin(t) * ry * k)
  }
  const out: Konva.Shape[] = [new Konva.Line({ points: pts, closed: true, tension: 0.3, ...paint(ctx) })]
  const drops = p.drops as number
  for (let i = 0; i < drops; i++) {
    const t = r() * Math.PI * 2
    const d = 1.1 + r() * (0.3 + splash * 0.6)
    const x = Math.max(-w / 2, Math.min(w / 2, Math.cos(t) * rx * d))
    const y = Math.max(-h / 2, Math.min(h / 2, Math.sin(t) * ry * d))
    const size = Math.min(w, h) * (0.008 + r() * r() * 0.05)
    out.push(new Konva.Circle({ x, y, radius: size, ...paint(ctx) }))
  }
  return out
}
export default build
