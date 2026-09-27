// 第三層區塊的互動：選取、拖曳、縮放（吸附到錨點與引導線）、在空白處拖曳畫出新區塊、
// 以及建議區塊的預覽與採用。座標一律為畫布座標；與 Svelte 無關，只透過 callback 回報。

import Konva from 'konva'
import type { Rect } from '../core/geometry'
import { snapOffset, type SnapLines } from '../core/blocks'

export interface BlockView {
  uid: string
  rect: Rect
  label: string
  color: string
  filled: boolean
  opacity: number
  visible: boolean
}

export interface GhostView {
  rect: Rect
  label: string
  color: string
}

export interface BlockLayerState {
  blocks: BlockView[]
  selected: string | null
  /** 是否可編輯（只在「區塊分佈」步驟） */
  interactive: boolean
  visible: boolean
  ghosts: GhostView[]
  snap: SnapLines
  /** 畫布 → 螢幕的縮放倍率 */
  scale: number
}

export interface BlockLayerEvents {
  onSelect: (uid: string | null) => void
  onChange: (uid: string, rect: Rect) => void
  onCreate: (rect: Rect) => void
  onAdopt: (index: number) => void
}

const SNAP_PX = 8
const MIN_PX = 6
const LABEL_PX = 11

export class BlockLayer {
  readonly group = new Konva.Group()
  private ghostGroup = new Konva.Group()
  private blockGroup = new Konva.Group()
  private transformer: Konva.Transformer
  private drawing: { start: { x: number; y: number }; rect: Konva.Rect } | null = null
  private nodes = new Map<string, { rect: Konva.Rect; label: Konva.Text }>()
  private state: BlockLayerState = {
    blocks: [],
    selected: null,
    interactive: false,
    visible: true,
    ghosts: [],
    snap: { xs: [], ys: [] },
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
      borderStroke: '#3a6df0',
      anchorStroke: '#3a6df0',
      anchorDragBoundFunc: (_old, pos) => this.snapAbsolute(pos),
    })
    this.group.add(this.ghostGroup, this.blockGroup, this.transformer)
    this.bindDrawing()
  }

  // ── 座標換算與吸附 ─────────────────────────────────

  private get limit() {
    return SNAP_PX / this.state.scale
  }

  private toLocal(abs: { x: number; y: number }) {
    const t = this.paper.getAbsoluteTransform().copy().invert()
    return t.point(abs)
  }

  private toAbs(local: { x: number; y: number }) {
    return this.paper.getAbsoluteTransform().point(local)
  }

  private snapPoint(p: { x: number; y: number }) {
    return {
      x: p.x + snapOffset([p.x], this.state.snap.xs, this.limit),
      y: p.y + snapOffset([p.y], this.state.snap.ys, this.limit),
    }
  }

  /** 縮放控制點（絕對座標）吸附。 */
  private snapAbsolute(abs: { x: number; y: number }) {
    return this.toAbs(this.snapPoint(this.toLocal(abs)))
  }

  // ── 在空白處拖曳畫出新區塊 ───────────────────────────

  private isEmptyTarget(t: Konva.Node) {
    return t === this.stage || t.name() === 'paper-bg'
  }

  private bindDrawing() {
    this.stage.on('mousedown.blocks touchstart.blocks', (e) => {
      if (!this.state.interactive || !this.state.visible || !this.isEmptyTarget(e.target)) return
      const p = this.snapPoint(this.paper.getRelativePointerPosition()!)
      const rect = new Konva.Rect({
        ...p,
        width: 0,
        height: 0,
        stroke: '#3a6df0',
        strokeWidth: 1.5,
        dash: [6, 4],
        strokeScaleEnabled: false,
        fill: 'rgba(58,109,240,0.08)',
        listening: false,
      })
      this.blockGroup.add(rect)
      this.drawing = { start: p, rect }
    })
    this.stage.on('mousemove.blocks touchmove.blocks', () => {
      if (!this.drawing) return
      const p = this.snapPoint(this.paper.getRelativePointerPosition()!)
      const s = this.drawing.start
      this.drawing.rect.setAttrs({
        x: Math.min(s.x, p.x),
        y: Math.min(s.y, p.y),
        width: Math.abs(p.x - s.x),
        height: Math.abs(p.y - s.y),
      })
      this.stage.batchDraw()
    })
    this.stage.on('mouseup.blocks touchend.blocks', (e) => {
      if (!this.drawing) {
        if (this.state.interactive && this.isEmptyTarget(e.target)) this.events.onSelect(null)
        return
      }
      const r = this.drawing.rect
      const rect = { x: r.x(), y: r.y(), w: r.width(), h: r.height() }
      r.destroy()
      this.drawing = null
      const min = MIN_PX / this.state.scale
      if (rect.w > min && rect.h > min) this.events.onCreate(rect)
      else this.events.onSelect(null)
    })
  }

  // ── 區塊節點 ─────────────────────────────────────────

  private createNode(uid: string) {
    const rect = new Konva.Rect({ strokeScaleEnabled: false, name: 'block' })
    const label = new Konva.Text({ fontStyle: 'bold', listening: false })
    rect.on('mousedown touchstart', () => this.state.interactive && this.events.onSelect(uid))
    rect.on('mouseenter', () => this.state.interactive && (this.stage.container().style.cursor = 'move'))
    rect.on('mouseleave', () => (this.stage.container().style.cursor = ''))
    rect.dragBoundFunc((abs) => {
      // 左、中、右（上、中、下）任一邊靠近吸附線就對齊
      const p = this.toLocal(abs)
      const w = rect.width() * rect.scaleX()
      const h = rect.height() * rect.scaleY()
      const dx = snapOffset([p.x, p.x + w / 2, p.x + w], this.state.snap.xs, this.limit)
      const dy = snapOffset([p.y, p.y + h / 2, p.y + h], this.state.snap.ys, this.limit)
      return this.toAbs({ x: p.x + dx, y: p.y + dy })
    })
    rect.on('dragmove', () => this.placeLabel(rect, label))
    rect.on('dragend', () => this.events.onChange(uid, this.rectOf(rect)))
    rect.on('transform', () => this.placeLabel(rect, label))
    rect.on('transformend', () => {
      const r = this.rectOf(rect)
      rect.setAttrs({ scaleX: 1, scaleY: 1, width: r.w, height: r.h })
      this.events.onChange(uid, r)
    })
    this.blockGroup.add(rect, label)
    const node = { rect, label }
    this.nodes.set(uid, node)
    return node
  }

  private rectOf(r: Konva.Rect): Rect {
    return { x: r.x(), y: r.y(), w: r.width() * r.scaleX(), h: r.height() * r.scaleY() }
  }

  private placeLabel(rect: Konva.Rect, label: Konva.Text) {
    const k = 1 / this.state.scale
    label.position({ x: rect.x() + 5 * k, y: rect.y() + 4 * k })
  }

  private isBusy(rect: Konva.Rect) {
    return rect.isDragging() || this.transformer.isTransforming()
  }

  update(state: BlockLayerState) {
    this.state = state
    const k = 1 / state.scale
    this.group.visible(state.visible)

    // 建議區塊（虛線預覽，點一下採用）
    this.ghostGroup.destroyChildren()
    state.ghosts.forEach((g, i) => {
      const r = new Konva.Rect({
        x: g.rect.x,
        y: g.rect.y,
        width: g.rect.w,
        height: g.rect.h,
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
        n.rect.destroy()
        n.label.destroy()
        this.nodes.delete(uid)
      }
    }
    for (const b of state.blocks) {
      const n = this.nodes.get(b.uid) ?? this.createNode(b.uid)
      if (!this.isBusy(n.rect)) {
        n.rect.setAttrs({ x: b.rect.x, y: b.rect.y, width: b.rect.w, height: b.rect.h, scaleX: 1, scaleY: 1 })
      }
      n.rect.setAttrs({
        stroke: b.color,
        strokeWidth: b.uid === state.selected ? 2 : 1.5,
        dash: b.filled ? undefined : [6, 4],
        // 不填色時仍保留極淡的底色，讓整塊都能點選
        fill: hexWithAlpha(b.color, b.filled ? b.opacity : 0.04),
        draggable: state.interactive,
        listening: state.interactive,
        visible: b.visible,
      })
      n.label.setAttrs({ text: b.label, fontSize: LABEL_PX, fill: b.color, scaleX: k, scaleY: k, visible: b.visible })
      this.placeLabel(n.rect, n.label)
      n.rect.moveToTop()
      n.label.moveToTop()
    }

    // 選取框
    const sel = state.interactive && state.selected ? this.nodes.get(state.selected) : undefined
    this.transformer.nodes(sel && sel.rect.visible() ? [sel.rect] : [])
    this.transformer.moveToTop()
  }

  /** 匯出前隱藏選取框與建議預覽；回傳還原函式。 */
  hideChrome(): () => void {
    const t = this.transformer.visible()
    const g = this.ghostGroup.visible()
    this.transformer.visible(false)
    this.ghostGroup.visible(false)
    return () => {
      this.transformer.visible(t)
      this.ghostGroup.visible(g)
    }
  }
}

function hexWithAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}
