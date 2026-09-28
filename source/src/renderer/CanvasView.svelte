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
  import { EMPTY_SNAP, snapPoint, type SnapGeometry } from '../core/snap'
  import { ObjectLayer, type ObjectLayerEvents } from './objectLayer'
  import { DEFAULT_BACKGROUND, fitImage, type Background, type DesignObject } from '../core/objects'
  import { getImage } from '../core/assets'
  import theme from '../config/theme.json'

  interface Props {
    canvas: CanvasSpec
    layers: GuideLayerView[]
    /** 可拖曳的控制點（畫布座標） */
    handles?: Handle[]
    /** 控制點拖曳時的吸附資料（不含控制點自己所屬的線） */
    handleSnap?: SnapGeometry
    onhandlemove?: (key: string, p: Pt) => void
    blocks?: BlockView[]
    selectedBlock?: string | null
    blocksInteractive?: boolean
    blocksVisible?: boolean
    ghosts?: GhostView[]
    /** 區塊與物件的吸附資料 */
    snap?: SnapGeometry
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
    /** 目前配色（裝飾圖形的多色效果使用） */
    palette?: string[]
    /** 「點一下選位置」模式（例如標記照片主體） */
    picking?: boolean
    onpick?: (p: Pt) => void
  }
  let {
    canvas,
    layers,
    handles = [],
    handleSnap = EMPTY_SNAP,
    onhandlemove,
    blocks = [],
    selectedBlock = null,
    blocksInteractive = false,
    blocksVisible = true,
    ghosts = [],
    snap = EMPTY_SNAP,
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
    palette = [],
    picking = false,
    onpick,
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
  // 縮放：zoom = 相對「符合視窗」的倍率；pan = 畫布中心相對視窗中心的位移（螢幕像素）
  const ZOOM_MIN = 0.25
  const ZOOM_MAX = 8
  let zoom = $state(1)
  let pan = $state({ x: 0, y: 0 })
  const fit = $derived(Math.max(0.0001, Math.min((size.w - PAD * 2) / canvas.w, (size.h - PAD * 2) / canvas.h)))
  const view = $derived.by(() => {
    const s = fit * zoom
    return { s, x: (size.w - canvas.w * s) / 2 + pan.x, y: (size.h - canvas.h * s) / 2 + pan.y }
  })

  // 換畫布尺寸（換專案）時回到符合視窗
  $effect(() => {
    void canvas.w
    void canvas.h
    zoom = 1
    pan = { x: 0, y: 0 }
  })

  /** 平移限制：畫布至少有一部分留在視窗內 */
  function clampPan(p: { x: number; y: number }, s: number) {
    const mx = Math.max(0, (canvas.w * s - size.w) / 2) + size.w * 0.4
    const my = Math.max(0, (canvas.h * s - size.h) / 2) + size.h * 0.4
    return { x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) }
  }

  /** 以螢幕上的某一點為中心縮放（那一點下的畫布位置不動） */
  function zoomAt(next: number, at = { x: size.w / 2, y: size.h / 2 }) {
    const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next))
    const u = (at.x - view.x) / view.s
    const v = (at.y - view.y) / view.s
    const s = fit * z
    zoom = z
    pan = clampPan({ x: at.x - u * s - (size.w - canvas.w * s) / 2, y: at.y - v * s - (size.h - canvas.h * s) / 2 }, s)
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault()
    const r = host.getBoundingClientRect()
    // 觸控板雙指縮放（瀏覽器會帶 ctrlKey）或按住 ⌘／Ctrl 滾輪：縮放；其他：平移
    if (e.ctrlKey || e.metaKey) zoomAt(zoom * Math.exp(-e.deltaY * 0.01), { x: e.clientX - r.left, y: e.clientY - r.top })
    else pan = clampPan({ x: pan.x - e.deltaX, y: pan.y - e.deltaY }, view.s)
  }

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

    stage.on('click.pick tap.pick', () => {
      if (!picking) return
      const p = paper.getRelativePointerPosition()
      if (p) onpick?.(p)
    })

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

  function snapHandle(p: Pt): { p: Pt; snapped: boolean } {
    const r = snapPoint(p, handleSnap, HS.snapDistance / view.s)
    return { p: r.p, snapped: r.kind !== null }
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
          const r = snapHandle(node!.position())
          node!.position(r.p)
          node!.fill(r.snapped ? HS.snapColor : HS.color)
          onhandlemove?.(h.key, r.p)
        })
        node.on('dragend', () => {
          node!.fill(HS.color)
          // 放開後回到實際位置（例如照片已移到邊界、主體到不了拖曳的位置）
          const cur = handles.find((x) => x.key === h.key)
          if (cur) node!.position(cur.pos)
          stage.batchDraw()
        })
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
    objectLayer.clipTo({ x: 0, y: 0, width: canvas.w, height: canvas.h })

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
      const r = fitImage(bgImage.naturalWidth, bgImage.naturalHeight, canvas.w, canvas.h, background.fit, background)
      bgImageNode.setAttrs({ image: bgImage, x: r.x, y: r.y, width: r.w, height: r.h, visible: true })
    } else {
      bgImageNode.visible(false)
    }

    void imageTick
    void uiThemeId
    stage.container().style.cursor = picking ? 'crosshair' : ''
    objectLayer.update({
      objects,
      masks: new Map(blocks.map((b) => [b.uid, { shape: b.shape, rect: b.rect, points: b.points, radius: b.radius }])),
      selected: selectedObjects,
      interactive: objectsInteractive,
      visible: objectsVisible,
      snap,
      canvas,
      scale: view.s,
      fontVersion,
      palette,
    })

    blockLayer.update({
      blocks,
      selected: selectedBlock,
      interactive: blocksInteractive,
      visible: blocksVisible,
      ghosts,
      snap,
      canvas,
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
    objectLayer.clipTo(full)
    if (bgImage && background.assetId) {
      const r = fitImage(bgImage.naturalWidth, bgImage.naturalHeight, full.width, full.height, background.fit, background)
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
    objectLayer.clipTo({ x: 0, y: 0, width: canvas.w, height: canvas.h })
    restoreObjects()
    for (const [n, v] of hidden) n.visible(v)
    imageTick++ // 讓 $effect 重新套用背景圖位置
    return url
  }
</script>

<div class="host" bind:this={host} onwheel={onWheel}></div>

<!-- 縮放條：拖曳縮放；點百分比回到符合視窗 -->
<div class="zoom">
  <input
    type="range"
    min={Math.log2(ZOOM_MIN)}
    max={Math.log2(ZOOM_MAX)}
    step="0.01"
    value={Math.log2(zoom)}
    oninput={(e) => zoomAt(2 ** Number(e.currentTarget.value))}
    aria-label="縮放"
  />
  <button onclick={() => ((zoom = 1), (pan = { x: 0, y: 0 }))} title="符合視窗">{Math.round(zoom * 100)}%</button>
</div>

<style>
  .host {
    position: absolute;
    inset: 0;
  }
  .zoom {
    position: absolute;
    right: 16px;
    bottom: 12px;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--panel);
  }
  .zoom input {
    width: 160px;
  }
  .zoom button {
    min-width: 52px;
    padding: 2px 8px;
    font-family: var(--mono);
    font-size: 12px;
  }
</style>
