<script lang="ts">
  // 版型範例縮圖：以目前畫布比例即時展開範例，畫出構圖線與區塊。
  import { roleOf } from '../core/blocks'
  import { resolveRecipe, type Recipe } from '../core/recipes'
  import { primitiveToSvg } from '../renderer/svg'
  import { compositionTemplates } from '../layers/1-composition/templates'
  import { guideTemplates } from '../layers/2-guides/templates'
  import theme from '../config/theme.json'

  let { recipe, aspect }: { recipe: Recipe; aspect: number } = $props()

  const frame = $derived(aspect >= 1 ? { w: 100, h: 100 / aspect } : { w: 100 * aspect, h: 100 })
  const r = $derived(resolveRecipe(recipe, frame, compositionTemplates, guideTemplates))
  const lines = $derived(
    r.outputs
      .flatMap((o) => o.primitives)
      .map((p) => primitiveToSvg(p, `stroke="${theme.guides.composition.mainColor}" stroke-width="0.6" stroke-dasharray="2 1.5" vector-effect="non-scaling-stroke" opacity="0.7"`))
      .join(''),
  )
  const pts = (ps: { x: number; y: number }[]) => ps.map((p) => `${p.x},${p.y}`).join(' ')
</script>

<svg viewBox="0 0 {frame.w} {frame.h}" preserveAspectRatio="xMidYMid meet">
  <rect width={frame.w} height={frame.h} fill="var(--paper)" />
  {#each r.blocks as b, i (i)}
    {@const color = roleOf(b.role).color}
    {#if b.shape === 'polygon' && b.points}
      <polygon points={pts(b.points)} fill={color} fill-opacity="0.35" stroke={color} stroke-width="0.8" vector-effect="non-scaling-stroke" />
    {:else if b.shape === 'ellipse'}
      <ellipse cx={b.rect.x + b.rect.w / 2} cy={b.rect.y + b.rect.h / 2} rx={b.rect.w / 2} ry={b.rect.h / 2} fill={color} fill-opacity="0.35" stroke={color} stroke-width="0.8" vector-effect="non-scaling-stroke" />
    {:else}
      <rect x={b.rect.x} y={b.rect.y} width={b.rect.w} height={b.rect.h} fill={color} fill-opacity="0.35" stroke={color} stroke-width="0.8" vector-effect="non-scaling-stroke" />
    {/if}
  {/each}
  {@html lines}
</svg>

<style>
  svg {
    width: 100%;
    height: 70px;
    display: block;
  }
</style>
