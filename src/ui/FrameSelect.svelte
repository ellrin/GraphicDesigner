<script lang="ts" module>
  import type { Rect } from '../core/geometry'

  /** 可選的套用範圍（例如其他構圖切出的區域），rect 為 0–1 相對座標 */
  export interface RegionOption {
    label: string
    rect: Rect
    /** 來源實例的 uid（避免把實例套到自己切出的區域上） */
    source: string
    /** 區域在來源版型中的名稱，用來追蹤來源的變動 */
    region: string
  }
</script>

<script lang="ts">
  // 版型實例的「套用範圍」選擇器：整張畫布、某個區塊、其他構圖的區域、或自訂範圍。
  import { frameLabel, type FrameRef } from '../core/instances'
  import { project } from '../core/store.svelte'

  interface Props {
    frame: FrameRef
    regions: RegionOption[]
    onchange: (f: FrameRef) => void
  }
  let { frame, regions, onchange }: Props = $props()

  const blocks = $derived(project.blocks.items)
  const value = $derived(
    frame.kind === 'canvas' ? 'canvas' : frame.kind === 'block' ? `block:${frame.blockId}` : 'current',
  )

  function pick(v: string) {
    if (v === 'canvas') onchange({ kind: 'canvas' })
    else if (v.startsWith('block:')) onchange({ kind: 'block', blockId: v.slice(6) })
    else if (v.startsWith('region:')) {
      const r = regions[Number(v.slice(7))]
      if (r) onchange({ kind: 'region', source: r.source, region: r.region, rect: { ...r.rect }, label: r.label })
    } else if (v === 'custom') onchange({ kind: 'rect', rect: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }, label: '自訂範圍' })
  }

  const pct = (n: number) => Math.round(n * 1000) / 10

  function setRect(axis: keyof Rect, v: number) {
    if (frame.kind !== 'rect' || !Number.isFinite(v)) return
    const rect = { ...frame.rect, [axis]: Math.min(1, Math.max(axis === 'w' || axis === 'h' ? 0.01 : 0, v / 100)) }
    onchange({ kind: 'rect', rect, label: '自訂範圍' })
  }
</script>

<div class="frame">
  <select {value} onchange={(e) => pick(e.currentTarget.value)} aria-label="套用範圍">
    <option value="canvas">整張畫布</option>
    {#if frame.kind === 'rect' || frame.kind === 'region'}
      <option value="current">目前：{frameLabel(frame, blocks)}</option>
    {/if}
    {#if blocks.length}
      <optgroup label="區塊（跟著區塊移動）">
        {#each blocks as b (b.uid)}
          <option value="block:{b.uid}">{b.name}</option>
        {/each}
      </optgroup>
    {/if}
    {#if regions.length}
      <optgroup label="其他構圖切出的區域">
        {#each regions as r, i (i)}
          <option value="region:{i}">{r.label}</option>
        {/each}
      </optgroup>
    {/if}
    <option value="custom">自訂範圍…</option>
  </select>

  {#if frame.kind === 'rect'}
    <div class="dims">
      {#each [['x', 'X'], ['y', 'Y'], ['w', '寬'], ['h', '高']] as const as [axis, label] (axis)}
        <label>
          <span>{label}</span>
          <input type="number" step="0.1" value={pct(frame.rect[axis])} onchange={(e) => setRect(axis, Number(e.currentTarget.value))} />
        </label>
      {/each}
      <small>單位：畫布的 %</small>
    </div>
  {/if}
</div>

<style>
  .frame {
    display: grid;
    gap: 8px;
  }
  .dims {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .dims label {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }
  .dims input {
    min-width: 0;
  }
  small {
    grid-column: 1 / -1;
    color: var(--muted);
    font-size: 11px;
  }
</style>
