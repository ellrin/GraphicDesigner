<script lang="ts">
  // 排版提案的縮圖：畫出背景、其他物件的大致位置，以及文字實際排出來的樣子。
  import { roleDef, type Proposal } from '../../core/autolayout'
  import { contentColor, isContent, project } from '../../core/store.svelte'

  let { proposal }: { proposal: Proposal } = $props()

  const c = $derived(project.canvas)
  const others = $derived(project.objects.items.filter((o) => o.visible && !isContent(o)))
  const texts = $derived(
    proposal.placements.map((pl) => {
      const index = project.objects.items.findIndex((o) => o.uid === pl.uid)
      const o = project.objects.items[index]
      const cx = (pl.rect.x + pl.rect.w / 2) / c.w
      const cy = (pl.rect.y + pl.rect.h / 2) / c.h
      const weight = roleDef(pl.role).weight === 'regular' ? 400 : roleDef(pl.role).weight === 'bold' ? 700 : 900
      return { pl, fill: contentColor(pl.role, { x: cx, y: cy }, index), family: String(o?.props.fontFamily ?? 'Noto Sans TC'), weight }
    }),
  )
  const anchorOf = (a: string) => (a === 'center' ? 'middle' : a === 'right' ? 'end' : 'start')
  const xOf = (r: { x: number; w: number }, a: string) => (a === 'center' ? r.x + r.w / 2 : a === 'right' ? r.x + r.w : r.x)
</script>

<svg viewBox="0 0 {c.w} {c.h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
  <rect width={c.w} height={c.h} fill={project.background.color} />
  {#if project.background.assetId}<rect width={c.w} height={c.h} fill="#8a8f98" opacity="0.5" />{/if}
  {#each others as o (o.uid)}
    {#if o.type === 'image'}
      <rect x={o.x * c.w} y={o.y * c.h} width={o.w * c.w} height={o.h * c.h} fill="#9aa0a8" />
    {:else if o.type === 'ellipse'}
      <ellipse cx={(o.x + o.w / 2) * c.w} cy={(o.y + o.h / 2) * c.h} rx={(o.w * c.w) / 2} ry={(o.h * c.h) / 2} fill={o.fill || 'none'} opacity={o.opacity} />
    {:else if o.type !== 'text' && o.type !== 'line'}
      <rect x={o.x * c.w} y={o.y * c.h} width={o.w * c.w} height={o.h * c.h} fill={o.fill || 'none'} opacity={o.opacity} />
    {/if}
  {/each}
  {#each texts as { pl, fill, family, weight } (pl.uid)}
    {#if pl.direction === 'vertical'}
      {#each pl.lines as line, i (i)}
        <text
          x={pl.rect.x + pl.rect.w - (i + 0.5) * pl.size * pl.lineHeight}
          y={pl.rect.y}
          font-size={pl.size}
          font-family={family}
          font-weight={weight}
          {fill}
          writing-mode="vertical-rl">{line}</text
        >
      {/each}
    {:else}
      {#each pl.lines as line, i (i)}
        <text
          x={xOf(pl.rect, pl.align)}
          y={pl.rect.y + i * pl.size * pl.lineHeight + pl.size * (0.88 + (pl.lineHeight - 1) / 2)}
          font-size={pl.size}
          font-family={family}
          font-weight={weight}
          text-anchor={anchorOf(pl.align)}
          {fill}>{line}</text
        >
      {/each}
    {/if}
  {/each}
</svg>

<style>
  svg {
    display: block;
    width: 100%;
    aspect-ratio: auto;
    max-height: 120px;
    border-radius: 3px;
    box-shadow: 0 0 0 1px var(--line);
  }
</style>
