<script lang="ts" module>
  // 字型載入完成後重畫縮圖（文字寬度會改變）
  let fontTick = $state(0)
  if (typeof document !== 'undefined') document.fonts?.addEventListener('loadingdone', () => fontTick++)
</script>

<script lang="ts">
  // 圖表縮圖：用與畫布完全相同的 shape.ts 畫在小畫布上，所以縮圖就是實際的樣子。
  import Konva from 'konva'
  import { onDestroy, onMount } from 'svelte'
  import type { ParamValues } from '../../../core/params'
  import { objectTypeOf } from '../types'

  interface Props {
    type: string
    props: ParamValues
    fill: string
    palette?: string[]
    width?: number
    height?: number
  }
  let { type, props, fill, palette = [], width = 112, height = 72 }: Props = $props()

  // 以虛擬尺寸排版（基本字級 13），再整體縮小到縮圖大小
  const VW = 260
  const VH = 170
  const PAD = 12
  const CANVAS_H = 1000

  let el: HTMLDivElement
  let stage: Konva.Stage | undefined
  let layer: Konva.Layer | undefined

  onMount(() => {
    stage = new Konva.Stage({ container: el, width, height, listening: false })
    layer = new Konva.Layer({ listening: false })
    stage.add(layer)
    draw()
  })
  onDestroy(() => stage?.destroy())

  function draw() {
    const t = objectTypeOf(type)
    if (!t || !stage || !layer) return
    const shapes = t.build({
      w: VW,
      h: VH,
      props: { ...t.defaults, ...props, title: '', note: '', fontSize: 13 / CANVAS_H },
      fill,
      stroke: '',
      strokeWidth: 0,
      canvasH: CANVAS_H,
      palette,
    })
    const s = Math.min(width / (VW + PAD * 2), height / (VH + PAD * 2))
    const g = new Konva.Group({ x: width / 2, y: height / 2, scaleX: s, scaleY: s })
    g.add(...shapes)
    layer.destroyChildren()
    layer.add(g)
    layer.draw()
  }

  $effect(() => {
    // 追蹤所有會影響外觀的值
    void [type, JSON.stringify(props), fill, palette.join(), fontTick]
    draw()
  })
</script>

<div
  class="thumb"
  bind:this={el}
  style:width="{width}px"
  style:height="{height}px"
  style:background={props.ink === 'light' ? '#1a1a19' : '#ffffff'}
  aria-hidden="true"
></div>

<style>
  .thumb {
    border-radius: 3px;
    overflow: hidden;
    pointer-events: none;
  }
</style>
