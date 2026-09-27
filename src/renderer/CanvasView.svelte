<script lang="ts" module>
  import type { GuideOutput, Pt } from '../core/geometry'
  import type { GuideStyle } from './konva'

  /** 一個要畫出來的引導圖層（構圖、各條視覺引導…）。 */
  export interface GuideLayerView {
    id: string
    output: GuideOutput
    style: GuideStyle
    visible: boolean
    anchorsVisible: boolean
  }
</script>

<script lang="ts">
  import Konva from 'konva'
  import { onMount } from 'svelte'
  import type { CanvasSpec } from '../core/canvas'
  import type { Handle } from '../core/compute'
  import { drawAnchors, drawPrimitives } from './konva'
  import { BlockLayer, type BlockLayerEvents, type BlockView, type GhostView } from './blockLayer'
  import type { SnapLines } from '../core/blocks'
  import theme from '../config/theme.json'

  interface Props {
    canvas: CanvasSpec
    layers: GuideLayerView[]
    /** 可拖曳的控制點（畫布座標） */
    handles?: Handle[]
    /** 控制點拖曳時會吸附的位置 */
    snapTargets?: Pt[]
    onhandlemove?: (key: string, p: Pt) => void
    blocks?: BlockView[]
    selectedBlock?: string | null
    blocksInteractive?: boolean
    blocksVisible?: boolean
    ghosts?: GhostView[]
    snapLines?: SnapLines
    blockEvents: BlockLayerEvents
  }
  let {
    canvas,
    layers,
    handles = [],
    snapTargets = [],
    onhandlemove,
    blocks = [],
    selectedBlock = null,
    blocksInteractive = false,
    blocksVisible = true,
    ghosts = [],
    snapLines = { xs: [], ys: [] },
    blockEvents,
  }: Props = $props()

  let host: HTMLDivElement
  let size = $state({ w: 0, h: 0 })

  let stage: Konva.Stage
  let blockLayer: BlockLayer
  const paper = new Konva.Group()
  const paperBg = new Konva.Rect({ name: 'paper-bg', fill: '#fff', shadowColor: '#000', shadowOpacity: 0.18, shadowBlur: 24 })
  // 內容裁切在畫布範圍內（例如畫面外的消失點射線）；控制點不裁切
  const content = new Konva.Group()
  const handleGroup = new Konva.Group()
  const layerGroups = new Map<string, { lines: Konva.Group; anchors: Konva.Group }>()
  const handleNodes = new Map<string, Konva.Circle>()

  const PAD = 48
  const HS = theme.guides.handle
  const view = $derived.by(() => {
    const s = Math.max(0.0001, Math.min((size.w - PAD * 2) / canvas.w, (size.h - PAD * 2) / canvas.h))
    return { s, x: (size.w - canvas.w * s) / 2, y: (size.h - canvas.h * s) / 2 }
  })

  onMount(() => {
    stage = new Konva.Stage({ container: host, width: host.clientWidth, height: host.clientHeight })
    const layer = new Konva.Layer()
    // 事件轉發：blockEvents 是 prop，可能在之後被替換
    blockLayer = new BlockLayer(stage, paper, {
      onSelect: (id) => blockEvents.onSelect(id),
      onChange: (id, r) => blockEvents.onChange(id, r),
      onCreate: (r) => blockEvents.onCreate(r),
      onAdopt: (i) => blockEvents.onAdopt(i),
    })
    // 疊放順序：紙 → 引導線 → 區塊 → 控制點
    paper.add(paperBg, content, blockLayer.group, handleGroup)
    layer.add(paper)
    stage.add(layer)

    const ro = new ResizeObserver(() => {
      size = { w: host.clientWidth, h: host.clientHeight }
    })
    ro.observe(host)
    return () => {
      ro.disconnect()
      stage.destroy()
    }
  })

  function groupsFor(id: string) {
    let g = layerGroups.get(id)
    if (!g) {
      g = { lines: new Konva.Group(), anchors: new Konva.Group() }
      content.add(g.lines, g.anchors)
      layerGroups.set(id, g)
    }
    return g
  }

  function snap(p: Pt): { p: Pt; snapped: boolean } {
    const limit = HS.snapDistance / view.s
    let best: Pt | null = null
    let bestD = limit
    for (const t of snapTargets) {
      const d = Math.hypot(t.x - p.x, t.y - p.y)
      if (d < bestD) [best, bestD] = [t, d]
    }
    return best ? { p: { x: best.x, y: best.y }, snapped: true } : { p, snapped: false }
  }

  function syncHandles() {
    for (const [key, node] of handleNodes) {
      if (!handles.some((h) => h.key === key)) {
        node.destroy()
        handleNodes.delete(key)
      }
    }
    for (const h of handles) {
      let node = handleNodes.get(h.key)
      if (!node) {
        node = new Konva.Circle({ draggable: true, strokeScaleEnabled: false, strokeWidth: 2, name: h.label })
        node.on('mouseenter', () => (stage.container().style.cursor = 'grab'))
        node.on('mouseleave', () => (stage.container().style.cursor = ''))
        node.on('dragmove', () => {
          const r = snap(node!.position())
          node!.position(r.p)
          node!.fill(r.snapped ? HS.snapColor : HS.color)
          onhandlemove?.(h.key, r.p)
        })
        node.on('dragend', () => node!.fill(HS.color))
        handleGroup.add(node)
        handleNodes.set(h.key, node)
      }
      node.radius(HS.radius / view.s)
      node.stroke(HS.stroke)
      if (!node.isDragging()) {
        node.position(h.pos)
        node.fill(HS.color)
      }
    }
  }

  $effect(() => {
    if (!stage || size.w === 0) return
    stage.size({ width: size.w, height: size.h })
    paper.position({ x: view.x, y: view.y })
    paper.scale({ x: view.s, y: view.s })
    paperBg.size({ width: canvas.w, height: canvas.h })
    content.clip({ x: 0, y: 0, width: canvas.w, height: canvas.h })

    const ids = new Set(layers.map((l) => l.id))
    for (const [id, g] of layerGroups) {
      if (!ids.has(id)) {
        g.lines.destroy()
        g.anchors.destroy()
        layerGroups.delete(id)
      }
    }
    // 依陣列順序疊放：先畫所有線，錨點統一在線的上方
    for (const l of layers) groupsFor(l.id).lines.moveToTop()
    for (const l of layers) groupsFor(l.id).anchors.moveToTop()
    for (const l of layers) {
      const g = groupsFor(l.id)
      drawPrimitives(g.lines, l.output.primitives, l.style, view.s)
      g.lines.visible(l.visible)
      drawAnchors(g.anchors, l.output.anchors, l.style.anchorColor, theme.guides.anchor.radius, view.s)
      g.anchors.visible(l.visible && l.anchorsVisible)
    }

    blockLayer.update({
      blocks,
      selected: selectedBlock,
      interactive: blocksInteractive,
      visible: blocksVisible,
      ghosts,
      snap: snapLines,
      scale: view.s,
    })

    syncHandles()
    stage.batchDraw()
  })

  /** 以指定像素尺寸匯出畫布區域為 PNG data URL（不含控制點、選取框、建議預覽）。 */
  export function toPng(pixelWidth: number): string {
    paperBg.shadowEnabled(false)
    handleGroup.visible(false)
    const restore = blockLayer.hideChrome()
    const url = stage.toDataURL({
      x: view.x,
      y: view.y,
      width: canvas.w * view.s,
      height: canvas.h * view.s,
      pixelRatio: pixelWidth / (canvas.w * view.s),
    })
    restore()
    handleGroup.visible(true)
    paperBg.shadowEnabled(true)
    return url
  }
</script>

<div class="host" bind:this={host}></div>

<style>
  .host {
    position: absolute;
    inset: 0;
  }
</style>
