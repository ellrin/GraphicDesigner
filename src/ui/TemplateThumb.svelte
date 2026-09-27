<script lang="ts">
  // 版型縮圖：以目前畫布比例即時生成，版型不需要另外準備圖片。
  import { computeTemplate } from '../core/compute'
  import type { Template } from '../core/registry'
  import type { Orientation } from '../core/transform'
  import { primitiveToSvg } from '../renderer/svg'

  interface Props {
    template: Template
    aspect: number
    orientation: Orientation
    colors: { main: string; sub: string }
  }
  let { template, aspect, orientation, colors }: Props = $props()

  const frame = $derived(aspect >= 1 ? { w: 100, h: 100 / aspect } : { w: 100 * aspect, h: 100 })
  const svg = $derived.by(() => {
    const out = computeTemplate(template, frame, template.defaults, orientation)
    return out.primitives
      .map((p) => {
        const sub = p.weight === 'sub'
        return primitiveToSvg(
          p,
          `stroke="${sub ? colors.sub : colors.main}" stroke-width="${sub ? 0.8 : 1.2}" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"`,
        )
      })
      .join('')
  })
</script>

<svg viewBox="0 0 {frame.w} {frame.h}" preserveAspectRatio="xMidYMid meet">
  <defs>
    <clipPath id="clip-{template.id}"><rect width={frame.w} height={frame.h} /></clipPath>
  </defs>
  <rect width={frame.w} height={frame.h} fill="var(--paper)" stroke="var(--line)" vector-effect="non-scaling-stroke" />
  <g clip-path="url(#clip-{template.id})">{@html svg}</g>
</svg>

<style>
  svg {
    width: 100%;
    height: 56px;
    display: block;
    overflow: visible;
  }
</style>
