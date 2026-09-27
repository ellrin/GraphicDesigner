<script lang="ts">
  import type { Template } from '../../core/registry'
  import type { Orientation } from '../../core/transform'
  import { primitiveToSvg } from '../../renderer/svg'
  import { computeComposition } from './compute'
  import theme from '../../config/theme.json'

  interface Props {
    template: Template
    aspect: number
    orientation: Orientation
  }
  let { template, aspect, orientation }: Props = $props()

  // 以目前畫布比例即時生成縮圖，版型不需要另外準備圖片
  const frame = $derived(aspect >= 1 ? { w: 100, h: 100 / aspect } : { w: 100 * aspect, h: 100 })
  const svg = $derived.by(() => {
    const out = computeComposition(template, frame, template.defaults, orientation)
    const s = theme.guides.composition
    return out.primitives
      .map((p) => {
        const sub = p.weight === 'sub'
        return primitiveToSvg(
          p,
          `stroke="${sub ? s.subColor : s.mainColor}" stroke-width="${sub ? 0.8 : 1.2}" stroke-dasharray="3 2" vector-effect="non-scaling-stroke"`,
        )
      })
      .join('')
  })
</script>

<svg viewBox="0 0 {frame.w} {frame.h}" preserveAspectRatio="xMidYMid meet">
  <rect width={frame.w} height={frame.h} fill="var(--paper)" stroke="var(--line)" vector-effect="non-scaling-stroke" />
  {@html svg}
</svg>

<style>
  svg {
    width: 100%;
    height: 56px;
    display: block;
    overflow: visible;
  }
</style>
