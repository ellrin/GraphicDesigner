// 將圖元轉成 SVG 元素字串：用於版型縮圖，之後也可作為 SVG 匯出的基礎。

import type { Primitive } from '../core/geometry'

const fmt = (n: number) => Math.round(n * 100) / 100

export function primitiveToSvg(p: Primitive, attrs: string): string {
  switch (p.kind) {
    case 'line':
      return `<line x1="${fmt(p.a.x)}" y1="${fmt(p.a.y)}" x2="${fmt(p.b.x)}" y2="${fmt(p.b.y)}" ${attrs}/>`
    case 'polyline': {
      const pts = p.points.map((q) => `${fmt(q.x)},${fmt(q.y)}`).join(' ')
      return `<${p.closed ? 'polygon' : 'polyline'} points="${pts}" fill="none" ${attrs}/>`
    }
    case 'circle':
      return `<circle cx="${fmt(p.c.x)}" cy="${fmt(p.c.y)}" r="${fmt(p.r)}" fill="none" ${attrs}/>`
  }
}
