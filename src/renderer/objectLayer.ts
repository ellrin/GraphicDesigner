// 第四層物件的繪製與互動：選取、拖曳、縮放、旋轉，拖曳時吸附到錨點、引導線與區塊邊緣。
// 每個物件是一個以中心為原點的 Konva.Group，形狀由各物件種類的 shape.ts 產生。

import Konva from 'konva'
import { getImage } from '../core/assets'
import { snapOffset, type SnapLines } from '../core/blocks'
import type { DesignObject } from '../core/objects'
import { objectTypeOf } from '../layers/4-objects/types'

export interface ObjectLayerState {
  objects: DesignObject[]
  selected: string | null
  interactive: boolean
  visible: boolean
  snap: SnapLines
  /** 畫布尺寸（物件以 0–1 儲存，需換算） */
  canvas: { w: number; h: number }
  /** 畫布 → 螢幕的縮放倍率 */
  scale: number
  /** 字型載入後遞增，用來觸發重繪 */
  fontVersion: number
}

/** 畫布座標下的物件框：x、y 為未旋轉時的左上角 */
export interface ObjectBox {
  x: number
  y: number
  w: number
  h: number
  rotation: number
  /** 文字從四個角縮放時，字級跟著放大縮小的倍率 */
  fontScale?: number
}

const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

export interface ObjectLayerEvents {
  onSelect: (uid: string | null) => void
  onChange: (uid: string, box: ObjectBox) => void
  /** 雙擊（例如編輯文字） */
  onEdit: (uid: string) => void
}

const SNAP_PX = 8

export class ObjectLayer {
  readonly group = new Konva.Group()
  private body = new Konva.Group()
  private transformer: Konva.Transformer
  private nodes = new Map<string, Konva.Group>()
  private images = new Map<string, HTMLImageElement>()
  private state: ObjectLayerState | null = null

  constructor(
    private stage: Konva.Stage,
    private paper: Konva.Group,
    private events: ObjectLayerEvents,
    private redraw: () => void,
  ) {
    this.transformer = new Konva.Transformer({
      flipEnabled: false,
      ignoreStroke: true,
      anchorSize: 8,
      borderStroke: '#3a6df0',
      anchorStroke: '#3a6df0',
      rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
      rotationSnapTolerance: 4,
      anchorDragBoundFunc: (_old, pos) => this.snapAbsolute(pos),
    })
    this.group.add(this.body, this.transformer)
    // 用 click（按下與放開在同一處）判斷點空白處；拖曳縮放後在空白處放開滑鼠不會取消選取
    this.stage.on('click.objects tap.objects', (e) => {
      if (this.state?.interactive && (e.target === this.stage || e.target.name() === 'paper-bg')) this.events.onSelect(null)
    })
  }

  private get limit() {
    return SNAP_PX / (this.state?.scale ?? 1)
  }

  private snapAbsolute(abs: { x: number; y: number }) {
    if (!this.state) return abs
    const t = this.paper.getAbsoluteTransform()
    const p = t.copy().invert().point(abs)
    const q = {
      x: p.x + snapOffset([p.x], this.state.snap.xs, this.limit),
      y: p.y + snapOffset([p.y], this.state.snap.ys, this.limit),
    }
    return t.point(q)
  }

  private boxOf(g: Konva.Group, o: DesignObject): ObjectBox {
    const c = this.state!.canvas
    const w = o.w * c.w * g.scaleX()
    const h = o.h * c.h * g.scaleY()
    return { x: g.x() - w / 2, y: g.y() - h / 2, w, h, rotation: g.rotation() }
  }

  private createNode(o: DesignObject): Konva.Group {
    const g = new Konva.Group({ name: 'object' })
    g.on('mousedown touchstart', () => this.state?.interactive && this.events.onSelect(o.uid))
    g.on('dblclick dbltap', () => this.state?.interactive && this.events.onEdit(o.uid))
    g.on('mouseenter', () => this.state?.interactive && (this.stage.container().style.cursor = 'move'))
    g.on('mouseleave', () => (this.stage.container().style.cursor = ''))
    g.on('dragmove', () => {
      // 物件的外框（含旋轉）任一邊或中線靠近吸附線就對齊
      if (!this.state) return
      const r = g.getClientRect({ relativeTo: this.paper, skipStroke: true })
      const dx = snapOffset([r.x, r.x + r.width / 2, r.x + r.width], this.state.snap.xs, this.limit)
      const dy = snapOffset([r.y, r.y + r.height / 2, r.y + r.height], this.state.snap.ys, this.limit)
      g.position({ x: g.x() + dx, y: g.y() + dy })
    })
    let anchor: string | null = null
    g.on('transformstart', () => (anchor = this.transformer.getActiveAnchor()))
    const commit = () => {
      const cur = this.state?.objects.find((x) => x.uid === o.uid)
      if (!cur) return
      const box = this.boxOf(g, cur)
      // 文字：拖四個角 = 連字級一起縮放；拖邊 = 只改文字框
      if (cur.type === 'text' && anchor && CORNERS.includes(anchor)) box.fontScale = g.scaleY()
      anchor = null
      this.events.onChange(o.uid, box)
    }
    g.on('dragend', commit)
    g.on('transformend', commit)
    this.body.add(g)
    this.nodes.set(o.uid, g)
    return g
  }

  private imageFor(o: DesignObject): HTMLImageElement | undefined {
    const id = o.props.assetId as string | undefined
    if (!id) return undefined
    const img = this.images.get(id)
    if (img) return img
    getImage(id)
      ?.then((loaded) => {
        this.images.set(id, loaded)
        this.redraw()
      })
      .catch(() => {})
    return undefined
  }

  private build(g: Konva.Group, o: DesignObject) {
    const s = this.state!
    const t = objectTypeOf(o.type)
    if (!t) return
    const w = o.w * s.canvas.w
    const h = o.h * s.canvas.h
    g.destroyChildren()
    const shapes = t.build({
      w,
      h,
      props: o.props,
      fill: o.fill,
      stroke: o.stroke,
      strokeWidth: o.strokeWidth * Math.min(s.canvas.w, s.canvas.h),
      canvasH: s.canvas.h,
      image: o.type === 'image' ? this.imageFor(o) : undefined,
    })
    for (const shape of shapes) g.add(shape)
    // 圖片以物件框裁切（cover 時超出的部分不顯示）
    g.clipFunc(o.type === 'image' ? (ctx) => ctx.rect(-w / 2, -h / 2, w, h) : undefined)
    g.setAttrs({
      x: (o.x + o.w / 2) * s.canvas.w,
      y: (o.y + o.h / 2) * s.canvas.h,
      rotation: o.rotation,
      scaleX: 1,
      scaleY: 1,
      opacity: o.opacity,
      visible: o.visible,
    })
  }

  update(state: ObjectLayerState) {
    this.state = state
    this.group.visible(state.visible)

    const ids = new Set(state.objects.map((o) => o.uid))
    for (const [uid, g] of this.nodes) {
      if (!ids.has(uid)) {
        g.destroy()
        this.nodes.delete(uid)
      }
    }
    const busy = this.transformer.isTransforming()
    for (const o of state.objects) {
      const g = this.nodes.get(o.uid) ?? this.createNode(o)
      if (!g.isDragging() && !(busy && this.transformer.nodes().includes(g))) this.build(g, o)
      g.draggable(state.interactive)
      g.listening(state.interactive)
      g.moveToTop()
    }

    const sel = state.interactive && state.selected ? this.nodes.get(state.selected) : undefined
    const selObj = state.objects.find((o) => o.uid === state.selected)
    this.transformer.keepRatio(!!(selObj && objectTypeOf(selObj.type)?.meta.keepRatio))
    this.transformer.nodes(sel && sel.visible() ? [sel] : [])
    this.transformer.moveToTop()
  }

  hideChrome(): () => void {
    const v = this.transformer.visible()
    this.transformer.visible(false)
    return () => this.transformer.visible(v)
  }
}
