import { intersectLines, line, PHI, pt, rayToFrame, type Anchor, type Primitive, type Pt } from '../../../../core/geometry'
import { defineGenerator } from '../../../../core/registry'

interface P {
  mode: 'golden' | 'reciprocal' | 'x' | 'single'
}

export default defineGenerator<P>((f, p) => {
  const { w, h } = f
  const bl = pt(0, h)
  const tr = pt(w, 0)
  const tl = pt(0, 0)
  const br = pt(w, h)
  const primitives: Primitive[] = [line(bl, tr)]
  const anchors: Anchor[] = []

  /** 從角落出發的輔助線，並把它與主對角線的交點記為錨點。 */
  const cross = (from: Pt, to: Pt) => {
    primitives.push(line(from, to))
    const hit = intersectLines(bl, tr, from, to)
    if (hit) anchors.push({ ...hit, label: '交點' })
  }

  switch (p.mode) {
    case 'golden':
      // 《最強構圖》的對角線構圖：輔助線落在 0.382 / 0.618 的位置
      cross(tl, pt(w / (PHI * PHI), h))
      cross(br, pt(w / PHI, 0))
      break
    case 'reciprocal':
      // 動態對稱：從另兩個角落對主對角線作垂線並延伸到邊緣
      cross(tl, rayToFrame(tl, Math.atan2(w, h), f))
      cross(br, rayToFrame(br, Math.atan2(-w, -h), f))
      break
    case 'x':
      cross(tl, br)
      break
    case 'single':
      anchors.push({ x: w / 3, y: (h * 2) / 3 }, { x: (w * 2) / 3, y: h / 3 })
      break
  }
  return { primitives, anchors }
})
