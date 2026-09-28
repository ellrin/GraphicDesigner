// 從目前的專案整理出自動排版需要的資料（區塊、要避開的圖片、內容）。
// 第四步的「文字內容」與「沿用到新專案」共用。

import type { LayoutInput, SlotSource } from './autolayout'
import { toCanvasPoints, toCanvasRect } from './blocks'
import type { Pt } from './geometry'
import { contentItems, isContent, project } from './store.svelte'

/** regions：構圖與引導切出的區域（畫布座標）；path：視覺動線上的點（依順序） */
export function projectLayoutInput(regions: SlotSource[] = [], path: Pt[] = []): LayoutInput {
  const c = project.canvas
  const blocks = project.blocks.items.filter((b) => b.visible)
  const shapeOf = (b: (typeof blocks)[number]) => ({ rect: toCanvasRect(b, c), shape: b.shape, points: b.points ? toCanvasPoints(b.points, c) : undefined })
  return {
    canvas: { w: c.w, h: c.h },
    items: contentItems(),
    blocks: blocks.map((b) => ({ ...shapeOf(b), role: b.role })),
    regions,
    path,
    obstacles: [
      ...blocks.filter((b) => b.role === 'image' || b.role === 'logo').map(shapeOf),
      ...project.objects.items.filter((o) => o.visible && o.type === 'image' && !isContent(o)).map((o) => ({ rect: toCanvasRect(o, c) })),
    ],
    panels: project.objects.items
      .filter((o) => o.visible && o.type === 'panel')
      .map((o) => {
        const rect = toCanvasRect(o, c)
        const pts = o.props.points as unknown as { x: number; y: number }[] | undefined
        return {
          rect,
          shape: o.props.shape === 'ellipse' ? ('ellipse' as const) : o.props.shape === 'polygon' ? ('polygon' as const) : ('rect' as const),
          points: pts?.map((q) => ({ x: rect.x + q.x * rect.w, y: rect.y + q.y * rect.h })),
        }
      }),
  }
}
