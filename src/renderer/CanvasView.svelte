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

  export interface RenderOptions {
    /** 輸出影像的寬度（像素，不含出血） */
    pixelWidth: number
    /** 出血（畫布單位）：背景向外延伸，物件超出畫布的部分也會保留 */
    bleed?: number
    mime?: 'image/png' | 'image/jpeg'
    quality?: number
  }
</script>

<script lang="ts">
  import Konva from 'konva'
  import { onMount } from 'svelte'
  import type { CanvasSpec } from '../core/canvas'
  import type { Handle } from '../core/compute'
  import { drawAnchors, drawPrimitives } from './konva'
  import { BlockLayer, type BlockLayerEvents, type BlockTool, type BlockView, type GhostView } from './blockLayer'
  import type { SnapLines } from '../core/blocks'
  import { ObjectLayer, type ObjectLayerEvents } from './objectLayer'
  import { DEFAULT_BACKGROUND, fitImage, type Background, type DesignObject } from '../core/objects'
  import { getImage } from '../core/assets'
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
    /** 區塊頂點吸附的點（錨點、交點） */
    snapPoints?: Pt[]
    blockTool?: BlockTool
    blockEvents: BlockLayerEvents
    objects?: DesignObject[]
    selectedObjects?: string[]
    objectsInteractive?: boolean
    objectsVisible?: boolean
    background?: Background
    fontVersion?: number
    objectEvents: ObjectLayerEvents
    /** 輔助線（構圖、引導、區塊）疊在物件上方或下方 */
    guidesOnTop?: boolean
    guideOpacity?: number
    /** 介面主題 id；改變時重繪以套用選取框顏色 */
    uiThemeId?: string
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
    snapPoints = [],
    blockTool = 'rect',
    blockEvents,
    objects = [],
    selectedObjects = [],
    objectsInteractive = false,
    objectsVisible = true,
    background = DEFAULT_BACKGROUND,
    fontVersion = 0,
    objectEvents,
    guidesOnTop = true,
    guideOpacity = 1,
    uiThemeId = '',
  }: Props = $props()

  /** 圖片載入完成時遞增，觸發重繪 */
  let imageTick = $state(0)
  let bgImage = $state<HTMLImageElement | null>(null)
  let bgImageId: string | null = null

  let host: HTMLDivElement
  let size = $state({ w: 0, h: 0 })

  let stage: Konva.Stage
  let blockLayer: BlockLayer
  let objectLayer: ObjectLayer
  const paper = new Konva.Group()
  const paperBg = new Konva.Rect({ name: 'paper-bg', fill: '#fff', shadowColor: '#000', shadowOpacity: 0.55, shadowBlur: 40, shadowOffsetY: 8 })
  // 背景圖片：裁切在畫布內，且不接收滑鼠事件（點背景 = 點空白處）
  const bgGroup = new Konva.Group({ listening: false })
  const bgImageNode = new Konva.Image({ image: undefined, listening: false })
  bgGroup.add(bgImageNode)
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
      onPoints: (id, pts) => blockEvents.onPoints(id, pts),
      onCreate: (r, geo) => blockEvents.onCreate(r, geo),
      onAdopt: (i) => blockEvents.onAdopt(i),
    })
    objectLayer = new ObjectLayer(
      stage,
      paper,
      {
        onSelect: (id, additive) => objectEvents.onSelect(id, additive),
        onSelectMany: (ids, additive) => objectEvents.onSelectMany(ids, additive),
        onChange: (id, b) => objectEvents.onChange(id, b),
        onEdit: (id) => objectEvents.onEdit(id),
      },
      () => imageTick++,
    )
    // 初始疊放順序；物件與輔助線的上下關係在 $effect 中依設定調整
    paper.add(paperBg, bgGroup, objectLayer.group, content, blockLayer.group, handleGroup)
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

    // 疊放順序：紙 → 背景 →（物件、輔助線依設定上下對調）→ 控制點
    const order = guidesOnTop
      ? [objectLayer.group, content, blockLayer.group]
      : [content, blockLayer.group, objectLayer.group]
    for (const node of order) node.moveToTop()
    handleGroup.moveToTop()
    content.opacity(guideOpacity)
    blockLayer.group.opacity(guideOpacity)

    // 背景
    paperBg.fill(background.color || '#ffffff')
    bgGroup.clip({ x: 0, y: 0, width: canvas.w, height: canvas.h })
    bgGroup.opacity(background.opacity)
    if (bgImage && background.assetId) {
      const r = fitImage(bgImage.naturalWidth, bgImage.naturalHeight, canvas.w, canvas.h, background.fit)
      bgImageNode.setAttrs({ image: bgImage, x: r.x, y: r.y, width: r.w, height: r.h, visible: true })
    } else {
      bgImageNode.visible(false)
    }

    void imageTick
    void uiThemeId
    objectLayer.update({
      objects,
      masks: new Map(blocks.map((b) => [b.uid, { shape: b.shape, rect: b.rect, points: b.points }])),
      selected: selectedObjects,
      interactive: objectsInteractive,
      visible: objectsVisible,
      snap: snapLines,
      canvas,
      scale: view.s,
      fontVersion,
    })

    blockLayer.update({
      blocks,
      selected: selectedBlock,
      interactive: blocksInteractive,
      visible: blocksVisible,
      ghosts,
      snap: snapLines,
      snapPoints,
      tool: blockTool,
      scale: view.s,
    })

    syncHandles()
    stage.batchDraw()
  })

  // 背景圖片換掉時重新載入
  $effect(() => {
    const id = background.assetId
    void fontVersion // 圖片庫讀回（啟動時）也會遞增，屆時再試一次
    if (id === bgImageId) return
    bgImage = null
    const p = id ? getImage(id) : undefined
    // 圖片庫還沒讀回時先不記下 id，下次再試
    bgImageId = !id || p ? id : null
    p?.then((img) => bgImageId === id && (bgImage = img)).catch(() => {})
  })

  /**
   * 把作品輸出成影像 data URL。
   * 只輸出作品本身（背景與物件）；引導線、錨點、區塊、控制點、選取框都不輸出。
   */
  export function renderImage({ pixelWidth, bleed = 0, mime = 'image/png', quality }: RenderOptions): string {
    const s = view.s
    const b = Math.max(0, bleed)
    const hidden = [content, blockLayer.group, handleGroup].map((n) => [n, n.visible()] as const)
    for (const [n] of hidden) n.visible(false)
    const restoreObjects = objectLayer.hideChrome()
    paperBg.shadowEnabled(false)

    // 出血：背景色與背景圖延伸到出血範圍
    const full = { x: -b, y: -b, width: canvas.w + 2 * b, height: canvas.h + 2 * b }
    paperBg.setAttrs(full)
    bgGroup.clip(full)
    if (bgImage && background.assetId) {
      const r = fitImage(bgImage.naturalWidth, bgImage.naturalHeight, full.width, full.height, background.fit)
      bgImageNode.position({ x: r.x - b, y: r.y - b }).size({ width: r.w, height: r.h })
    }

    const url = stage.toDataURL({
      x: view.x - b * s,
      y: view.y - b * s,
      width: full.width * s,
      height: full.height * s,
      pixelRatio: pixelWidth / (canvas.w * s),
      mimeType: mime,
      quality,
    })

    // 還原
    paperBg.setAttrs({ x: 0, y: 0, width: canvas.w, height: canvas.h })
    paperBg.shadowEnabled(true)
    restoreObjects()
    for (const [n, v] of hidden) n.visible(v)
    imageTick++ // 讓 $effect 重新套用背景圖位置
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
