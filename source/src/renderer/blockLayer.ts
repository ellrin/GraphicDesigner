// 第三層區塊的互動：選取、拖曳、縮放（吸附到錨點與引導線）、畫出新區塊（矩形、橢圓、多邊形）、
// 編輯多邊形頂點，以及建議區塊的預覽與採用。
// 座標一律為畫布座標；與 Svelte 無關，只透過 callback 回報。

import Konva from 'konva'
import { paintTransformer, selectionColor } from './selection'
import type { Pt, Rect } from '../core/geometry'
import { boundsOfPoints, snapOffset, traceShape, type BlockShape } from '../core/blocks'
import { EMPTY_SNAP, snapPoint as snapToGeometry, type SnapGeometry } from '../core/snap'
import { SizeSnapper } from './sizeSnap'

export interface BlockView {
  uid: string
  rect: Rect
  shape: BlockShape
  /** 多邊形頂點（畫布座標） */
  points?: Pt[]
  label: string
  color: string
  filled: boolean
  opacity: number
  visible: boolean
  radius?: number
}

export interface GhostView {
  rect: Rect
  shape?: BlockShape
  points?: Pt[]
  label: string
  color: string
}

export type BlockTool = 'rect' | 'ellipse' | 'polygon'

export interface BlockLayerState {
  blocks: BlockView[]
  selected: string | null
  /** 是否可編輯（只在「區塊分佈」步驟） */
  interactive: boolean
  visible: boolean
  ghosts: GhostView[]
  /** 吸附資料：點、任意角度的線、水平／垂直線 */
  snap: SnapGeometry
  /** 畫布尺寸（尺寸比例吸附用） */
  canvas: { w: number; h: number }
  /** 在空白處拖曳（或點擊）時畫出的形狀 */
  tool: BlockTool
  /** 畫布 → 螢幕的縮放倍率 */
  scale: number
}

export interface BlockLayerEvents {
  onSelect: (uid: string | null) => void
  onChange: (uid: string, rect: Rect) => void
  /** 多邊形頂點改變（畫布座標） */
  onPoints: (uid: string, points: Pt[]) => void
  onCreate: (rect: Rect, geo: { shape: BlockShape; points?: Pt[] }) => void
  onAdopt: (index: number) => void
}

const SNAP_PX = 8
const MIN_PX = 6
const LABEL_PX = 11
const CLOSE_PX = 12

/** 以外框為座標系畫出形狀：多邊形頂點存成 0–1 的相對位置，縮放外框時頂點自然跟著縮放 */
function shapeScene(ctx: Konva.Context, shape: Konva.Shape) {
  const w = shape.width()
  const h = shape.height()
  const kind = shape.getAttr('blockShape') as BlockShape
  const norm = shape.getAttr('normPoints') as Pt[] | undefined
  ctx.beginPath()
  traceShape(ctx, kind, { x: 0, y: 0, w, h }, norm?.map((p) => ({ x: p.x * w, y: p.y * h })), shape.getAttr('blockRadius') ?? 0)
  ctx.fillStrokeShape(shape)
}

export class BlockLayer {
  readonly group = new Konva.Group()
  private ghostGroup = new Konva.Group()
  private blockGroup = new Konva.Group()
  private vertexGroup = new Konva.Group()
  private transformer: Konva.Transformer
  private sizeSnap: SizeSnapper
  private drawing: { start: Pt; preview: Konva.Shape } | null = null
  /** 繪製中的多邊形 */
  private poly: { points: Pt[]; preview: Konva.Line } | null = null
  private nodes = new Map<string, { shape: Konva.Shape; label: Konva.Text }>()
  private vertexNodes: Konva.Circle[] = []
  private state: BlockLayerState = {
    blocks: [],
    selected: null,
    interactive: false,
    visible: true,
    ghosts: [],
    snap: EMPTY_SNAP,
    canvas: { w: 1, h: 1 },
    tool: 'rect',
    scale: 1,
  }

  constructor(
    private stage: Konva.Stage,
    private paper: Konva.Group,
    private events: BlockLayerEvents,
  ) {
    this.transformer = new Konva.Transformer({
      rotateEnabled: false,
      flipEnabled: false,
      keepRatio: false,
      ignoreStroke: true,
      anchorSize: 8,
      anchorDragBoundFunc: (_old, pos) => this.snapAbsolute(pos),
    })
    this.sizeSnap = new SizeSnapper(this.transformer, this.group, () => ({ scale: this.state.scale, canvas: this.state.canvas, paper: this.paper }))
    this.group.add(this.ghostGroup, this.blockGroup, this.transformer, this.vertexGroup)
    this.bindDrawing()
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.poly) this.cancelPolygon()
      if (e.key === 'Enter' && this.poly) this.finishPolygon()
    })
  }

  // ── 座標換算與吸附 ─────────────────────────────────

  private get limit() {
    return SNAP_PX / this.state.scale
  }

  private toLocal(abs: Pt) {
    return this.paper.getAbsoluteTransform().copy().invert().point(abs)
  }

  private toAbs(local: Pt) {
    return this.paper.getAbsoluteTransform().point(local)
  }

  /** 吸附：錨點與交點 → 任意角度的線與曲線 → 水平／垂直線 */
  private snapPoint(p: Pt): Pt {
    return snapToGeometry(p, this.state.snap, this.limit).p
  }

  private snapAbsolute(abs: Pt) {
    return this.toAbs(this.snapPoint(this.toLocal(abs)))
  }

  // ── 畫出新區塊 ─────────────────────────────────────

  private isEmptyTarget(t: Konva.Node) {
    return t === this.stage || t.name() === 'paper-bg'
  }

  private pointer(): Pt {
    return this.snapPoint(this.paper.getRelativePointerPosition()!)
  }

  private bindDrawing() {
    this.stage.on('mousedown.blocks touchstart.blocks', (e) => {
      if (!this.state.interactive || !this.state.visible) return
      if (this.state.tool === 'polygon') {
        this.addPolygonPoint(this.pointer())
        return
      }
      if (!this.isEmptyTarget(e.target)) return
      const p = this.pointer()
      const preview = new Konva.Shape<Konva.ShapeConfig>({
        ...p,
        width: 0,
        height: 0,
        blockShape: this.state.tool,
        sceneFunc: shapeScene,
        stroke: selectionColor(),
        strokeWidth: 1.5,
        dash: [6, 4],
        strokeScaleEnabled: false,
        fill: selectionColor(0.08),
        listening: false,
      })
      this.blockGroup.add(preview)
      this.drawing = { start: p, preview }
    })
    this.stage.on('mousemove.blocks touchmove.blocks', () => {
      if (this.poly) {
        const p = this.pointer()
        this.poly.preview.points([...this.poly.points, p].flatMap((q) => [q.x, q.y]))
        this.stage.batchDraw()
        return
      }
      if (!this.drawing) return
      const p = this.pointer()
      const s = this.drawing.start
      this.drawing.preview.setAttrs({
        x: Math.min(s.x, p.x),
        y: Math.min(s.y, p.y),
        width: Math.abs(p.x - s.x),
        height: Math.abs(p.y - s.y),
      })
      this.stage.batchDraw()
    })
    // 只有「在空白處按下」才會開始畫；放開時太小就當作點空白處（取消選取）。
    this.stage.on('mouseup.blocks touchend.blocks', () => {
      if (!this.drawing) return
      const r = this.drawing.preview
      const rect = { x: r.x(), y: r.y(), w: r.width(), h: r.height() }
      r.destroy()
      this.drawing = null
      const min = MIN_PX / this.state.scale
      if (rect.w > min && rect.h > min) this.events.onCreate(rect, { shape: this.state.tool })
      else this.events.onSelect(null)
    })
  }

  // ── 多邊形：逐點點擊，點回第一點、雙擊或 Enter 完成，Esc 取消 ──

  private addPolygonPoint(p: Pt) {
    if (!this.poly) {
      const preview = new Konva.Line({
        points: [p.x, p.y],
        stroke: selectionColor(),
        strokeWidth: 1.5,
        dash: [6, 4],
        strokeScaleEnabled: false,
        fill: selectionColor(0.08),
        closed: true,
        listening: false,
      })
      this.blockGroup.add(preview)
      this.poly = { points: [p], preview }
      return
    }
    const first = this.poly.points[0]
    if (this.poly.points.length >= 3 && Math.hypot(p.x - first.x, p.y - first.y) * this.state.scale < CLOSE_PX) {
      this.finishPolygon()
      return
    }
    // 在同一點連點兩下（雙擊）＝完成；只看位置，不看點擊速度，快速點不同位置不會誤判
    const last = this.poly.points[this.poly.points.length - 1]
    if (Math.hypot(p.x - last.x, p.y - last.y) * this.state.scale < 3) {
      if (this.poly.points.length >= 3) this.finishPolygon()
      return
    }
    this.poly.points.push(p)
  }

  private finishPolygon() {
    if (!this.poly) return
    const points = this.poly.points
    this.cancelPolygon()
    if (points.length >= 3) this.events.onCreate(boundsOfPoints(points), { shape: 'polygon', points })
  }

  private cancelPolygon() {
    this.poly?.preview.destroy()
    this.poly = null
    this.stage.batchDraw()
  }

  // ── 區塊節點 ─────────────────────────────────────────

  private createNode(uid: string) {
    const shape = new Konva.Shape<Konva.ShapeConfig>({ sceneFunc: shapeScene, strokeScaleEnabled: false, name: 'block' })
    const label = new Konva.Text({ fontStyle: 'bold', listening: false })
    shape.on('mousedown touchstart', () => this.state.interactive && this.state.tool !== 'polygon' && this.events.onSelect(uid))
    shape.on('mouseenter', () => this.state.interactive && (this.stage.container().style.cursor = 'move'))
    shape.on('mouseleave', () => (this.stage.container().style.cursor = ''))
    shape.dragBoundFunc((abs) => {
      // 左、中、右（上、中、下）任一邊靠近吸附線就對齊
      const p = this.toLocal(abs)
      const w = shape.width() * shape.scaleX()
      const h = shape.height() * shape.scaleY()
      const dx = snapOffset([p.x, p.x + w / 2, p.x + w], this.state.snap.xs, this.limit)
      const dy = snapOffset([p.y, p.y + h / 2, p.y + h], this.state.snap.ys, this.limit)
      return this.toAbs({ x: p.x + dx, y: p.y + dy })
    })
    shape.on('dragmove', () => this.placeLabel(shape, label))
    shape.on('dragend', () => this.events.onChange(uid, this.rectOf(shape)))
    shape.on('transform', () => this.placeLabel(shape, label))
    shape.on('transformend', () => {
      const r = this.rectOf(shape)
      shape.setAttrs({ scaleX: 1, scaleY: 1, width: r.w, height: r.h })
      this.events.onChange(uid, r)
    })
    this.blockGroup.add(shape, label)
    const node = { shape, label }
    this.nodes.set(uid, node)
    return node
  }

  private rectOf(r: Konva.Shape): Rect {
    return { x: r.x(), y: r.y(), w: r.width() * r.scaleX(), h: r.height() * r.scaleY() }
  }

  private placeLabel(shape: Konva.Shape, label: Konva.Text) {
    const k = 1 / this.state.scale
    label.position({ x: shape.x() + 5 * k, y: shape.y() + 4 * k })
  }

  private isBusy(shape: Konva.Shape) {
    return shape.isDragging() || this.transformer.isTransforming()
  }

  /** 選取的多邊形：每個頂點一個可拖曳的控制點 */
  private syncVertices(b: BlockView | undefined) {
    const points = b && b.shape === 'polygon' && this.state.interactive && this.state.tool !== 'polygon' ? (b.points ?? []) : []
    while (this.vertexNodes.length > points.length) this.vertexNodes.pop()!.destroy()
    points.forEach((p, i) => {
      let node = this.vertexNodes[i]
      if (!node) {
        node = new Konva.Circle({ draggable: true, strokeScaleEnabled: false, strokeWidth: 2, fill: '#fff' })
        node.on('mouseenter', () => (this.stage.container().style.cursor = 'grab'))
        node.on('mouseleave', () => (this.stage.container().style.cursor = ''))
        node.on('dragmove', () => {
          const cur = this.state.blocks.find((x) => x.uid === this.state.selected)
          if (!cur?.points) return
          const q = this.snapPoint(node!.position())
          node!.position(q)
          this.events.onPoints(cur.uid, cur.points.map((pp, j) => (j === i ? q : pp)))
        })
        this.vertexGroup.add(node)
        this.vertexNodes[i] = node
      }
      node.radius(6 / this.state.scale)
      node.stroke(selectionColor())
      if (!node.isDragging()) node.position(p)
    })
  }

  update(state: BlockLayerState) {
    this.state = state
    const k = 1 / state.scale
    this.group.visible(state.visible)
    if (state.tool !== 'polygon' || !state.interactive) this.cancelPolygon()

    // 建議區塊（虛線預覽，點一下採用）
    this.ghostGroup.destroyChildren()
    state.ghosts.forEach((g, i) => {
      const shape = g.points ? 'polygon' : (g.shape ?? 'rect')
      const r = new Konva.Shape<Konva.ShapeConfig>({
        sceneFunc: (ctx, s) => {
          ctx.beginPath()
          traceShape(ctx, shape, g.rect, g.points)
          ctx.fillStrokeShape(s)
        },
        stroke: g.color,
        strokeWidth: 1.25,
        dash: [3, 3],
        strokeScaleEnabled: false,
        fill: 'rgba(0,0,0,0)',
        opacity: 0.8,
        listening: state.interactive,
      })
      r.on('mouseenter', () => {
        r.setAttrs({ fill: g.color, opacity: 0.25 })
        this.stage.container().style.cursor = 'copy'
        this.stage.batchDraw()
      })
      r.on('mouseleave', () => {
        r.setAttrs({ fill: 'rgba(0,0,0,0)', opacity: 0.8 })
        this.stage.container().style.cursor = ''
        this.stage.batchDraw()
      })
      r.on('click tap', () => this.events.onAdopt(i))
      const t = new Konva.Text({
        x: g.rect.x + 4 * k,
        y: g.rect.y + g.rect.h - 4 * k,
        text: `＋ ${g.label}`,
        fontSize: LABEL_PX,
        fill: g.color,
        scaleX: k,
        scaleY: k,
        listening: false,
      })
      t.offsetY(t.height())
      this.ghostGroup.add(r, t)
    })

    // 區塊
    const ids = new Set(state.blocks.map((b) => b.uid))
    for (const [uid, n] of this.nodes) {
      if (!ids.has(uid)) {
        n.shape.destroy()
        n.label.destroy()
        this.nodes.delete(uid)
      }
    }
    const drawingPolygon = state.tool === 'polygon'
    for (const b of state.blocks) {
      const n = this.nodes.get(b.uid) ?? this.createNode(b.uid)
      if (!this.isBusy(n.shape)) {
        n.shape.setAttrs({ x: b.rect.x, y: b.rect.y, width: b.rect.w, height: b.rect.h, scaleX: 1, scaleY: 1 })
      }
      const norm =
        b.shape === 'polygon' && b.points
          ? b.points.map((p) => ({ x: b.rect.w ? (p.x - b.rect.x) / b.rect.w : 0, y: b.rect.h ? (p.y - b.rect.y) / b.rect.h : 0 }))
          : undefined
      n.shape.setAttrs({
        blockShape: b.shape,
        normPoints: norm,
        blockRadius: b.radius ?? 0,
        stroke: b.color,
        strokeWidth: b.uid === state.selected ? 2 : 1.5,
        dash: b.filled ? undefined : [6, 4],
        // 不填色時仍保留極淡的底色，讓整塊都能點選
        fill: hexWithAlpha(b.color, b.filled ? b.opacity : 0.04),
        draggable: state.interactive && !drawingPolygon,
        listening: state.interactive && !drawingPolygon,
        visible: b.visible,
      })
      n.label.setAttrs({ text: b.label, fontSize: LABEL_PX, fill: b.color, scaleX: k, scaleY: k, visible: b.visible })
      this.placeLabel(n.shape, n.label)
      n.shape.moveToTop()
      n.label.moveToTop()
    }

    // 選取框與多邊形頂點
    const sel = state.interactive && state.selected ? this.nodes.get(state.selected) : undefined
    this.transformer.nodes(sel && sel.shape.visible() && !drawingPolygon ? [sel.shape] : [])
    paintTransformer(this.transformer)
    this.transformer.moveToTop()
    this.syncVertices(state.blocks.find((b) => b.uid === state.selected))
    // 頂點控制點要在選取框之上，否則外框角落的縮放把手會蓋住頂點
    this.vertexGroup.moveToTop()
  }

  /** 匯出前隱藏選取框、頂點與建議預覽；回傳還原函式。 */
  hideChrome(): () => void {
    const nodes = [this.transformer, this.ghostGroup, this.vertexGroup]
    const vis = nodes.map((n) => n.visible())
    for (const n of nodes) n.visible(false)
    return () => nodes.forEach((n, i) => n.visible(vis[i]))
  }
}

function hexWithAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}
