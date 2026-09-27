<script lang="ts">
  import Section from '../../ui/Section.svelte'
  import { align, boundsOf, distribute, type AlignEdge, type Axis } from '../../core/align'
  import type { AnchorOption } from '../../core/objects'
  import { project, ui, updateObjects } from '../../core/store.svelte'
  import ObjectEditor from '../4-objects/ObjectEditor.svelte'

  let { anchors }: { anchors: AnchorOption[] } = $props()

    const selected = $derived(project.objects.items.filter((o) => ui.selectedObjects.includes(o.uid)))
  const multi = $derived(selected.length > 1)

  // ── 對齊與分佈 ────────────────────────────────────
  let alignTo = $state<'selection' | 'canvas'>('selection')
  const target = $derived(multi && alignTo === 'selection' ? boundsOf(selected) : { x: 0, y: 0, w: 1, h: 1 })

  const EDGES: { edge: AlignEdge; label: string; icon: string }[] = [
    { edge: 'left', label: '靠左', icon: '⇤' },
    { edge: 'hcenter', label: '水平置中', icon: '↔' },
    { edge: 'right', label: '靠右', icon: '⇥' },
    { edge: 'top', label: '靠上', icon: '⤒' },
    { edge: 'vcenter', label: '垂直置中', icon: '↕' },
    { edge: 'bottom', label: '靠下', icon: '⤓' },
  ]

  function doAlign(edge: AlignEdge) {
    updateObjects(align(selected, edge, target))
  }

  function doDistribute(axis: Axis) {
    updateObjects(distribute(selected, axis))
  }

  function setOpacity(v: number) {
    updateObjects(new Map(selected.map((o) => [o.uid, { opacity: v }])))
  }

</script>

<Section id="refine-1" title="選取">
  <p class="tip">
    {#if selected.length === 0}
      點選物件；按住 Shift 可多選，或在空白處拖曳框選。⌘A 全選。
    {:else}
      已選取 {selected.length} 個物件
    {/if}
  </p>
  <div class="tools">
    <button onclick={() => (ui.selectedObjects = project.objects.items.filter((o) => o.visible).map((o) => o.uid))}>全選</button>
    <button onclick={() => (ui.selectedObjects = [])} disabled={!selected.length}>取消選取</button>
  </div>
</Section>

<Section id="refine-2" title="對齊">
  {#if multi}
    <div class="seg" role="radiogroup" aria-label="對齊基準">
      <button class:on={alignTo === 'selection'} onclick={() => (alignTo = 'selection')}>對齊選取範圍</button>
      <button class:on={alignTo === 'canvas'} onclick={() => (alignTo = 'canvas')}>對齊畫布</button>
    </div>
  {:else if selected.length === 1}
    <p class="muted">單一物件會對齊到畫布。</p>
  {/if}
  <div class="grid6">
    {#each EDGES as e (e.edge)}
      <button onclick={() => doAlign(e.edge)} disabled={!selected.length} title={e.label}>
        <span class="icon">{e.icon}</span>{e.label}
      </button>
    {/each}
  </div>

  <h3>等距分佈</h3>
  <div class="tools">
    <button onclick={() => doDistribute('x')} disabled={selected.length < 3}>水平等距</button>
    <button onclick={() => doDistribute('y')} disabled={selected.length < 3}>垂直等距</button>
  </div>
  {#if selected.length > 0 && selected.length < 3}
    <p class="muted">等距分佈需要選取 3 個以上的物件。</p>
  {/if}

  {#if multi}
    <label class="row">
      <span>統一不透明度</span>
      <input type="range" min="0" max="1" step="0.05" value={selected[0].opacity} onchange={(e) => setOpacity(Number(e.currentTarget.value))} />
    </label>
  {/if}
</Section>

<ObjectEditor {anchors} />



<style>
  .tip {
    margin: 0 0 8px;
    font-size: 12px;
    color: var(--accent);
  }
  .muted {
    margin: 6px 0;
    font-size: 12px;
    color: var(--muted);
  }
  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .seg {
    display: flex;
    margin-bottom: 8px;
  }
  .seg button {
    flex: 1;
    font-size: 12px;
    border-radius: 0;
  }
  .seg button:first-child {
    border-radius: 6px 0 0 6px;
  }
  .seg button:last-child {
    border-radius: 0 6px 6px 0;
    border-left: none;
  }
  .seg button.on {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
  }
  .grid6 {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .grid6 button {
    display: grid;
    gap: 2px;
    font-size: 11px;
    padding: 6px 2px;
  }
  .icon {
    font-size: 15px;
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .row {
    display: grid;
    gap: 4px;
    font-size: 13px;
    margin-top: 8px;
  }
</style>
