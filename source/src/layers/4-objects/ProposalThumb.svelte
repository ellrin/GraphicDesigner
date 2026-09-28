<script lang="ts">
  // 排版提案的縮圖：畫出背景、其他物件的大致位置，以及文字實際排出來的樣子。
  import { inkCenter, roleDef, type Proposal } from '../../core/autolayout'
  import { contentColor, isContent, panelColor, project } from '../../core/store.svelte'
  import { getAssetUrl } from '../../core/assets'
  import { isPriceNote, splitPrice } from '../../core/textfit'

  import type { ResolvedBlock } from '../../core/recipes'
  import { roleOf } from '../../core/blocks'
  import { readableOn } from '../../core/color'

  interface Props {
    proposal: Proposal
    /** 範本預覽：先畫出範本的區塊（畫布座標） */
    blocks?: ResolvedBlock[]
    height?: number
  }
  let { proposal, blocks = [], height = 120 }: Props = $props()
  const pts = (ps: { x: number; y: number }[]) => ps.map((p) => `${p.x},${p.y}`).join(' ')

  const c = $derived(project.canvas)
  // 範本預覽（有 blocks）：只畫這個範本自己的色塊，不畫目前專案裡上一個範本留下的色塊
  const others = $derived(project.objects.items.filter((o) => o.visible && !isContent(o) && !(blocks.length && o.type === 'panel')))
  // 範本預覽：文字顏色依範本的色塊與照片判斷（專案裡還沒有這些色塊）
  function insideBlock(b: ResolvedBlock, p: { x: number; y: number }): boolean {
    const r = b.rect
    if (p.x < r.x || p.x > r.x + r.w || p.y < r.y || p.y > r.y + r.h) return false
    if (b.shape === 'ellipse') return ((p.x - r.x - r.w / 2) / (r.w / 2)) ** 2 + ((p.y - r.y - r.h / 2) / (r.h / 2)) ** 2 <= 1
    if (b.shape === 'polygon' && b.points) {
      let hit = false
      const ps = b.points
      for (let i = 0, j = ps.length - 1; i < ps.length; j = i++)
        if (ps[i].y > p.y !== ps[j].y > p.y && p.x < ((ps[j].x - ps[i].x) * (p.y - ps[i].y)) / (ps[j].y - ps[i].y) + ps[i].x) hit = !hit
      return hit
    }
    return true
  }
  function colorAt(role: string, at: { x: number; y: number }, index: number): string {
    const under = [...blocks].reverse().find((b) => (b.panel || b.role === 'image' || b.role === 'background') && insideBlock(b, at))
    if (under?.panel) return readableOn(panelColor(under.panel))
    if (under) return '#ffffff'
    // 不在範本色塊或照片上：只看背景（index 0 = 忽略專案裡的物件）
    return contentColor(role, { x: at.x / c.w, y: at.y / c.h }, 0)
  }

  const texts = $derived(
    proposal.placements.map((pl) => {
      const index = project.objects.items.findIndex((o) => o.uid === pl.uid)
      const o = project.objects.items[index]
      const ink = inkCenter(pl)
      const cx = ink.x / c.w
      const cy = ink.y / c.h
      const weight = roleDef(pl.role).weight === 'regular' ? 400 : roleDef(pl.role).weight === 'bold' ? 700 : 900
      return { pl, fill: blocks.length ? colorAt(pl.role, ink, index) : contentColor(pl.role, { x: cx, y: cy }, index), family: String(o?.props.fontFamily ?? 'Noto Sans TC'), weight }
    }),
  )
  const anchorOf = (a: string) => (a === 'center' ? 'middle' : a === 'right' ? 'end' : 'start')
  const xOf = (r: { x: number; w: number }, a: string) => (a === 'center' ? r.x + r.w / 2 : a === 'right' ? r.x + r.w : r.x)
</script>

<svg viewBox="0 0 {c.w} {c.h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" style:max-height="{height}px">
  <rect width={c.w} height={c.h} fill={project.background.color} />
  {#if project.background.assetId}<rect width={c.w} height={c.h} fill="#8a8f98" opacity="0.5" />{/if}
  {#each blocks as b, i (i)}
    {@const photo = b.role === 'image' || b.role === 'background'}
    {@const color = b.panel ? panelColor(b.panel) : photo ? '#9aa0a8' : roleOf(b.role).color}
    {@const op = b.panel ? 1 : photo ? 0.55 : 0.12}
    {#if b.shape === 'polygon' && b.points}
      <polygon points={pts(b.points)} fill={color} fill-opacity={op} stroke={color} stroke-opacity="0.5" stroke-width={c.w / 300} />
    {:else if b.shape === 'ellipse'}
      <ellipse cx={b.rect.x + b.rect.w / 2} cy={b.rect.y + b.rect.h / 2} rx={b.rect.w / 2} ry={b.rect.h / 2} fill={color} fill-opacity={op} stroke={color} stroke-opacity="0.5" stroke-width={c.w / 300} />
    {:else}
      <rect x={b.rect.x} y={b.rect.y} width={b.rect.w} height={b.rect.h} fill={color} fill-opacity={op} stroke={color} stroke-opacity="0.5" stroke-width={c.w / 300} />
    {/if}
  {/each}
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
    {#if pl.role === 'logo'}
      {@const o = project.objects.items.find((x) => x.uid === pl.uid)}
      {@const url = o ? getAssetUrl(String(o.props.assetId)) : undefined}
      {#if url}<image href={url} x={pl.rect.x} y={pl.rect.y} width={pl.rect.w} height={pl.rect.h} preserveAspectRatio="xMidYMid meet" />{:else}<rect x={pl.rect.x} y={pl.rect.y} width={pl.rect.w} height={pl.rect.h} fill="#9aa0a8" />{/if}
    {:else if pl.role === 'price'}
      {#each pl.lines as line, i (i)}
        {@const [name, price] = splitPrice(line)}
        {@const y = pl.rect.y + i * pl.size * pl.lineHeight + pl.size * (0.88 + (pl.lineHeight - 1) / 2)}
        <text x={pl.rect.x + (isPriceNote(line) ? pl.size * 0.2 : 0)} {y} font-size={isPriceNote(line) ? pl.size * 0.78 : pl.size} opacity={isPriceNote(line) ? 0.72 : 1} font-family={family} {fill}>{name}</text>
        {#if price}<text x={pl.rect.x + pl.rect.w} {y} font-size={pl.size} font-family={family} text-anchor="end" {fill}>{price}</text>{/if}
      {/each}
    {:else if pl.direction === 'vertical'}
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
    border-radius: 3px;
    box-shadow: 0 0 0 1px var(--line);
  }
</style>
