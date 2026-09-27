// 第四層物件的繪製與互動：選取、拖曳、縮放、旋轉，拖曳時吸附到錨點、引導線與區塊邊緣。
// 每個物件是一個以中心為原點的 Konva.Group，形狀由各物件種類的 shape.ts 產生。

import Konva from 'konva'
import { paintTransformer, selectionColor } from './selection'
import { getImage } from '../core/assets'
import { snapOffset, traceShape, type BlockShape } from '../core/blocks'
import { projectToSegment, snapPoint as snapToGeometry, type SnapGeometry } from '../core/snap'
import { SizeSnapper } from './sizeSnap'
import type { DesignObject } from '../core/objects'
import { objectTypeOf } from '../layers/4-objects/types'

/** 裁切遮罩：區塊形狀（畫布座標） */
export interface MaskShape {
  shape: BlockShape
  rect: { x: number; y: number; w: number; h: number }
  points?: { x: number; y: number }[]
}

export interface ObjectLayerState {
  objects: DesignObject[]
  /** 區塊 uid → 形狀，給設定了 mask 的物件使用 */
  masks: Map<string, MaskShape>
  /** 選取中的物件（可多選） */
  selected: string[]
  interactive: boolean
  visible: boolean
  snap: SnapGeometry
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
  /** additive：按住 Shift 點選（加入／移出選取） */
  onSelect: (uid: string | null, additive: boolean) => void
  /** 框選 */
  onSelectMany: (uids: string[], additive: boolean) => void
  onChange: (uid: string, box: ObjectBox) => void
  /** 雙擊（例如編輯文字） */
  onEdit: (uid: string) => void
}

const SNAP_PX = 8

export class ObjectLayer {
  readonly group = new Konva.Group()
  private body = new Konva.Group()
  private transformer: Konva.Transformer
  private sizeSnap: SizeSnapper
  private nodes = new Map<string, Konva.Group>()
  /** 每個物件外面包一層不受變形影響的群組，用來套用區塊形狀的裁切 */
  private holders = new Map<string, Konva.Group>()
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
      rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
      rotationSnapTolerance: 4,
      anchorDragBoundFunc: (_old, pos) => this.snapAbsolute(pos),
    })
    this.sizeSnap = new SizeSnapper(this.transformer, this.group, () => ({
      scale: this.state?.scale ?? 1,
      canvas: this.state?.canvas ?? { w: 1, h: 1 },
      paper: this.paper,
    }))
    this.group.add(this.body, this.transformer)
    this.bindMarquee()
  }

  private isEmpty(t: Konva.Node) {
    return t === this.stage || t.name() === 'paper-bg'
  }

  /**
   * 在空白處拖曳 = 框選（碰到框的物件都會被選取）；在空白處單擊 = 取消選取。
   * 用 click 判斷單擊，所以拖曳縮放後在空白處放開滑鼠不會誤取消選取。
   */
  private bindMarquee() {
    let start: { x: number; y: number } | null = null
    let marquee: Konva.Rect | null = null
    let justSelected = false

    this.stage.on('mousedown.objects touchstart.objects', (e) => {
      if (!this.state?.interactive || !this.isEmpty(e.target)) return
      start = this.paper.getRelativePointerPosition()
    })
    this.stage.on('mousemove.objects touchmove.objects', () => {
      if (!start) return
      const p = this.paper.getRelativePointerPosition()!
      if (!marquee) {
        if (Math.hypot(p.x - start.x, p.y - start.y) * (this.state?.scale ?? 1) < 4) return
        marquee = new Konva.Rect({
          stroke: selectionColor(),
          strokeWidth: 1,
          dash: [4, 3],
          strokeScaleEnabled: false,
          fill: selectionColor(0.08),
          listening: false,
        })
        this.group.add(marquee)
      }
      marquee.setAttrs({
        x: Math.min(start.x, p.x),
        y: Math.min(start.y, p.y),
        width: Math.abs(p.x - start.x),
        height: Math.abs(p.y - start.y),
      })
      this.stage.batchDraw()
    })
    this.stage.on('mouseup.objects touchend.objects', (e) => {
      if (marquee) {
        const box = marquee.getClientRect()
        const hits = [...this.nodes]
          .filter(([, g]) => g.visible() && Konva.Util.haveIntersection(box, g.getClientRect()))
          .map(([uid]) => uid)
        marquee.destroy()
        marquee = null
        justSelected = true
        this.events.onSelectMany(hits, !!(e.evt as MouseEvent).shiftKey)
      }
      start = null
    })
    this.stage.on('click.objects tap.objects', (e) => {
      if (justSelected) {
        justSelected = false
        return
      }
      if (this.state?.interactive && this.isEmpty(e.target)) this.events.onSelect(null, false)
    })
  }

  private get limit() {
    return SNAP_PX / (this.state?.scale ?? 1)
  }

  /** 縮放把手吸附：錨點與交點 → 任意角度的線 → 水平／垂直線 */
  private snapAbsolute(abs: { x: number; y: number }) {
    if (!this.state) return abs
    const t = this.paper.getAbsoluteTransform()
    const p = t.copy().invert().point(abs)
    return t.point(snapToGeometry(p, this.state.snap, this.limit).p)
  }

  private boxOf(g: Konva.Group, o: DesignObject): ObjectBox {
    const c = this.state!.canvas
    const w = o.w * c.w * g.scaleX()
    const h = o.h * c.h * g.scaleY()
    return { x: g.x() - w / 2, y: g.y() - h / 2, w, h, rotation: g.rotation() }
  }

  private createNode(o: DesignObject): Konva.Group {
    const g = new Konva.Group({ name: 'object' })
    g.on('mousedown touchstart', (e) => {
      if (!this.state?.interactive) return
      const shift = !!(e.evt as MouseEvent).shiftKey
      // 已在多選中的物件：直接拖曳整組，不改變選取
      if (!shift && this.state.selected.includes(o.uid)) return
      this.events.onSelect(o.uid, shift)
    })
    g.on('dblclick dbltap', () => this.state?.interactive && this.events.onEdit(o.uid))
    g.on('mouseenter', () => this.state?.interactive && (this.stage.container().style.cursor = 'move'))
    g.on('mouseleave', () => (this.stage.container().style.cursor = ''))
    g.on('dragmove', () => {
      // 物件的外框（含旋轉）任一邊或中線靠近吸附線就對齊（多選拖曳時不吸附，避免整組錯位）
      if (!this.state || this.state.selected.length > 1) return
      const r = g.getClientRect({ relativeTo: this.paper, skipStroke: true })
      const dx = snapOffset([r.x, r.x + r.width / 2, r.x + r.width], this.state.snap.xs, this.limit)
      const dy = snapOffset([r.y, r.y + r.height / 2, r.y + r.height], this.state.snap.ys, this.limit)
      if (dx || dy) {
        g.position({ x: g.x() + dx, y: g.y() + dy })
        return
      }
      // 沒有對齊到水平／垂直線時：物件中心靠近斜線或曲線就吸到線上（例如沿著對角線排列）
      const c = { x: g.x(), y: g.y() }
      let best: { x: number; y: number } | null = null
      let bestD = this.limit
      for (const s of this.state.snap.segments) {
        const q = projectToSegment(c, s)
        const d = Math.hypot(q.x - c.x, q.y - c.y)
        if (d < bestD) [best, bestD] = [q, d]
      }
      if (best) g.position(best)
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
    g.on('dragend', () => {
      // 多選時拖曳一個會帶著整組移動，所以整組都要回報新位置
      const s = this.state
      if (s && s.selected.length > 1 && s.selected.includes(o.uid)) {
        for (const id of s.selected) {
          const node = this.nodes.get(id)
          const cur = s.objects.find((x) => x.uid === id)
          if (node && cur) this.events.onChange(id, this.boxOf(node, cur))
        }
      } else commit()
    })
    g.on('transformend', commit)
    const holder = new Konva.Group()
    holder.add(g)
    this.body.add(holder)
    this.holders.set(o.uid, holder)
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
    // 旋轉時吸附到 45° 倍數與所有引導線的角度（例如斜排文字對齊對角線）
    const angles = new Set([0, 45, 90, 135, 180, 225, 270, 315])
    for (const a of state.snap.angles) {
      angles.add(Math.round(a * 10) / 10)
      angles.add(Math.round(((a + 180) % 360) * 10) / 10)
    }
    this.transformer.rotationSnaps([...angles])

    const ids = new Set(state.objects.map((o) => o.uid))
    for (const [uid] of this.nodes) {
      if (!ids.has(uid)) {
        this.holders.get(uid)?.destroy()
        this.holders.delete(uid)
        this.nodes.delete(uid)
      }
    }
    const busy = this.transformer.isTransforming()
    for (const o of state.objects) {
      const g = this.nodes.get(o.uid) ?? this.createNode(o)
      if (!g.isDragging() && !(busy && this.transformer.nodes().includes(g))) this.build(g, o)
      g.draggable(state.interactive)
      g.listening(state.interactive)
      const holder = this.holders.get(o.uid)!
      const mask = o.mask ? state.masks.get(o.mask) : undefined
      holder.clipFunc(
        mask
          ? (ctx) => {
              ctx.beginPath()
              traceShape(ctx, mask.shape, mask.rect, mask.points)
            }
          : undefined,
      )
      holder.moveToTop()
    }

    const selNodes = state.interactive
      ? state.selected.map((id) => this.nodes.get(id)).filter((g): g is Konva.Group => !!g && g.visible())
      : []
    const selObjs = state.objects.filter((o) => state.selected.includes(o.uid))
    // 多選時一律等比例縮放；單選時依物件種類設定
    const keep = selObjs.length > 1 || (selObjs.length === 1 && !!objectTypeOf(selObjs[0].type)?.meta.keepRatio)
    this.transformer.keepRatio(keep)
    this.transformer.nodes(selNodes)
    paintTransformer(this.transformer)
    this.transformer.moveToTop()
  }

  hideChrome(): () => void {
    const v = this.transformer.visible()
    this.transformer.visible(false)
    return () => this.transformer.visible(v)
  }
}
