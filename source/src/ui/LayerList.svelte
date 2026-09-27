<script lang="ts">
  // 圖層與排序（跨步驟，放在右側）：所有構圖、引導、區塊、物件的顯示開關、選取、疊放順序與刪除。
  import { STEPS } from '../config/steps'
  import { roleOf } from '../core/blocks'
  import { frameLabel } from '../core/instances'
  import { flow, goToStep, moveBlock, moveObject, project, removeBlock, removeObject, selectObject, ui } from '../core/store.svelte'
  import { compositionTemplates } from '../layers/1-composition/templates'
  import { guideTemplates } from '../layers/2-guides/templates'
  import { objectTypeOf } from '../layers/4-objects/types'

  const v = $derived(project.visibility)
  const nameOf = (list: { id: string; meta: { name: string } }[], id: string) => list.find((t) => t.id === id)?.meta.name ?? id
  const stepIndex = (id: string) => STEPS.findIndex((s) => s.id === id)

  // 分組收合：預設只展開目前步驟對應的那一組；手動開合在切換步驟後重設
  type Group = 'composition' | 'guides' | 'blocks' | 'objects'
  const stepGroup = $derived<Group>(
    STEPS[flow.current].id === 'refine' ? 'objects' : (STEPS[flow.current].id as Group),
  )
  let manual = $state<Partial<Record<Group, boolean>>>({})
  $effect(() => {
    void flow.current
    manual = {}
  })
  const isOpen = (g: Group) => manual[g] ?? stepGroup === g
  const toggle = (g: Group) => (manual[g] = !isOpen(g))

  /** 選取並跳到該圖層所屬的步驟（已解鎖時） */
  function focus(stepId: string, select: () => void) {
    const i = stepIndex(stepId)
    if (i <= flow.reached && flow.current !== i && !(stepId === 'objects' && STEPS[flow.current].id === 'refine')) goToStep(i)
    select()
  }
</script>

<div class="layers">
  <div class="group">
    <div class="head">
      <input type="checkbox" bind:checked={v.composition} aria-label="顯示構圖" />
      <button class="toggle" onclick={() => toggle('composition')} aria-expanded={isOpen('composition')}>
        <span class="caret" class:open={isOpen('composition')}>▸</span>① 構圖<small>{project.compositions.items.length}</small>
      </button>
    </div>
    {#if isOpen('composition')}
      {#each project.compositions.items as c (c.uid)}
        <div class="item" class:on={ui.selectedComposition === c.uid}>
          <input type="checkbox" bind:checked={c.visible} disabled={!v.composition} />
          <button class="name" onclick={() => focus('composition', () => (ui.selectedComposition = c.uid))}>
            {nameOf(compositionTemplates, c.templateId)}<small>{frameLabel(c.frame, project.blocks.items)}</small>
          </button>
        </div>
      {/each}
    {/if}
  </div>

  <div class="group">
    <div class="head">
      <input type="checkbox" bind:checked={v.guides} aria-label="顯示視覺引導" />
      <button class="toggle" onclick={() => toggle('guides')} aria-expanded={isOpen('guides')}>
        <span class="caret" class:open={isOpen('guides')}>▸</span>② 視覺引導<small>{project.guides.items.length}</small>
      </button>
    </div>
    {#if isOpen('guides')}
      {#each project.guides.items as g (g.uid)}
        <div class="item" class:on={ui.selectedGuide === g.uid}>
          <input type="checkbox" bind:checked={g.visible} disabled={!v.guides} />
          <button class="name" onclick={() => focus('guides', () => (ui.selectedGuide = g.uid))}>{nameOf(guideTemplates, g.templateId)}</button>
        </div>
      {:else}
        <p class="empty">（尚未加入）</p>
      {/each}
    {/if}
  </div>

  <div class="group">
    <div class="head">
      <input type="checkbox" bind:checked={v.blocks} aria-label="顯示區塊" />
      <button class="toggle" onclick={() => toggle('blocks')} aria-expanded={isOpen('blocks')}>
        <span class="caret" class:open={isOpen('blocks')}>▸</span>③ 區塊<small>{project.blocks.items.length}</small>
      </button>
    </div>
    {#if isOpen('blocks')}
      {#each [...project.blocks.items].reverse() as b (b.uid)}
        <div class="item" class:on={ui.selectedBlock === b.uid}>
          <input type="checkbox" bind:checked={b.visible} disabled={!v.blocks} />
          <span class="dot" style:background={b.color}></span>
          <button class="name" onclick={() => focus('blocks', () => (ui.selectedBlock = b.uid))}>
            {b.name}<small>{roleOf(b.role).label}</small>
          </button>
          <button class="icon" onclick={() => moveBlock(b.uid, 1)} title="上移一層">↑</button>
          <button class="icon" onclick={() => moveBlock(b.uid, -1)} title="下移一層">↓</button>
          <button class="icon" onclick={() => removeBlock(b.uid)} title="刪除">✕</button>
        </div>
      {:else}
        <p class="empty">（尚未加入）</p>
      {/each}
    {/if}
  </div>

  <div class="group">
    <div class="head">
      <input type="checkbox" bind:checked={v.objects} aria-label="顯示物件" />
      <button class="toggle" onclick={() => toggle('objects')} aria-expanded={isOpen('objects')}>
        <span class="caret" class:open={isOpen('objects')}>▸</span>④ 物件<small>{project.objects.items.length}</small>
      </button>
    </div>
    {#if isOpen('objects')}
      {#each [...project.objects.items].reverse() as o (o.uid)}
        <div class="item" class:on={ui.selectedObjects.includes(o.uid)}>
          <input type="checkbox" bind:checked={o.visible} disabled={!v.objects} />
          <button class="name" onclick={(e) => focus('objects', () => selectObject(o.uid, e.shiftKey))}>
            {o.name}<small>{objectTypeOf(o.type)?.meta.name}</small>
          </button>
          <button class="icon" onclick={() => moveObject(o.uid, 1)} title="上移一層">↑</button>
          <button class="icon" onclick={() => moveObject(o.uid, -1)} title="下移一層">↓</button>
          <button class="icon" onclick={() => removeObject(o.uid)} title="刪除">✕</button>
        </div>
      {:else}
        <p class="empty">（尚未加入）</p>
      {/each}
    {/if}
  </div>
</div>

<style>
  .layers {
    display: grid;
    gap: 12px;
    font-size: 13px;
  }
  .group {
    display: grid;
    gap: 3px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 2px;
  }
  .toggle {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    border: none;
    background: none;
    padding: 0;
    font-weight: 700;
    text-align: left;
  }
  .toggle:hover:not(:disabled) {
    background: none;
    color: var(--accent);
  }
  .toggle small {
    font-family: var(--mono);
    font-weight: 400;
    font-size: 11px;
    color: var(--faint);
  }
  .caret {
    font-size: 10px;
    color: var(--muted);
    transition: transform 0.15s;
  }
  .caret.open {
    transform: rotate(90deg);
    color: var(--accent);
  }
  .item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 4px 2px 20px;
    border: 1px solid transparent;
    border-radius: var(--radius);
  }
  .item.on {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 2px;
    flex: none;
  }
  .name {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 6px;
    border: none;
    background: none;
    padding: 1px 2px;
    text-align: left;
    overflow: hidden;
    white-space: nowrap;
  }
  .name small {
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .icon {
    border: none;
    background: none;
    color: var(--muted);
    padding: 0 3px;
    font-size: 12px;
  }
  .empty {
    margin: 0;
    padding-left: 20px;
    font-size: 12px;
    color: var(--faint);
  }
</style>
