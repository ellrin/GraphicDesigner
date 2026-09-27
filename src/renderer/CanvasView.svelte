<script lang="ts">
  import Konva from 'konva'
  import { onMount } from 'svelte'
  import type { GuideOutput } from '../core/geometry'
  import type { CanvasSpec } from '../core/canvas'
  import { drawAnchors, drawPrimitives } from './konva'
  import theme from '../config/theme.json'

  interface Props {
    canvas: CanvasSpec
    composition: GuideOutput
    showComposition: boolean
    showAnchors: boolean
  }
  let { canvas, composition, showComposition, showAnchors }: Props = $props()

  let host: HTMLDivElement
  let size = $state({ w: 0, h: 0 })

  let stage: Konva.Stage
  const paper = new Konva.Group()
  const paperBg = new Konva.Rect({ fill: '#fff', shadowColor: '#000', shadowOpacity: 0.18, shadowBlur: 24 })
  // 每一層各自一個 group，對應設計流程中的圖層
  const compositionGroup = new Konva.Group()
  const anchorGroup = new Konva.Group()

  const PAD = 48
  const view = $derived.by(() => {
    const s = Math.max(0.0001, Math.min((size.w - PAD * 2) / canvas.w, (size.h - PAD * 2) / canvas.h))
    return { s, x: (size.w - canvas.w * s) / 2, y: (size.h - canvas.h * s) / 2 }
  })

  onMount(() => {
    stage = new Konva.Stage({ container: host, width: host.clientWidth, height: host.clientHeight })
    const layer = new Konva.Layer()
    paper.add(paperBg, compositionGroup, anchorGroup)
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

  $effect(() => {
    if (!stage || size.w === 0) return
    stage.size({ width: size.w, height: size.h })
    paper.position({ x: view.x, y: view.y })
    paper.scale({ x: view.s, y: view.s })
    paperBg.size({ width: canvas.w, height: canvas.h })

    drawPrimitives(compositionGroup, composition.primitives, theme.guides.composition)
    compositionGroup.visible(showComposition)
    drawAnchors(anchorGroup, composition.anchors, theme.guides.anchor.color, theme.guides.anchor.radius, view.s)
    anchorGroup.visible(showComposition && showAnchors)

    stage.batchDraw()
  })

  /** 以指定像素尺寸匯出畫布區域為 PNG data URL。 */
  export function toPng(pixelWidth: number): string {
    paperBg.shadowEnabled(false)
    const url = stage.toDataURL({
      x: view.x,
      y: view.y,
      width: canvas.w * view.s,
      height: canvas.h * view.s,
      pixelRatio: pixelWidth / (canvas.w * view.s),
    })
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
