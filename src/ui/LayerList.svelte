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

  /** 選取並跳到該圖層所屬的步驟（已解鎖時） */
  function focus(stepId: string, select: () => void) {
    const i = stepIndex(stepId)
    if (i <= flow.reached && flow.current !== i && !(stepId === 'objects' && STEPS[flow.current].id === 'refine')) goToStep(i)
    select()
  }
</script>

<div class="layers">
  <div class="group">
    <label class="head"><input type="checkbox" bind:checked={v.composition} /> ① 構圖</label>
    {#each project.compositions.items as c (c.uid)}
      <div class="item" class:on={ui.selectedComposition === c.uid}>
        <input type="checkbox" bind:checked={c.visible} disabled={!v.composition} />
        <button class="name" onclick={() => focus('composition', () => (ui.selectedComposition = c.uid))}>
          {nameOf(compositionTemplates, c.templateId)}<small>{frameLabel(c.frame, project.blocks.items)}</small>
        </button>
      </div>
    {/each}
  </div>

  <div class="group">
    <label class="head"><input type="checkbox" bind:checked={v.guides} /> ② 視覺引導</label>
    {#each project.guides.items as g (g.uid)}
      <div class="item" class:on={ui.selectedGuide === g.uid}>
        <input type="checkbox" bind:checked={g.visible} disabled={!v.guides} />
        <button class="name" onclick={() => focus('guides', () => (ui.selectedGuide = g.uid))}>{nameOf(guideTemplates, g.templateId)}</button>
      </div>
    {:else}
      <p class="empty">（尚未加入）</p>
    {/each}
  </div>

  <div class="group">
    <label class="head"><input type="checkbox" bind:checked={v.blocks} /> ③ 區塊</label>
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
  </div>

  <div class="group">
    <label class="head"><input type="checkbox" bind:checked={v.objects} /> ④ 物件</label>
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
  </div>
  <p class="hint">清單上方＝最上層。點名稱會選取並切到該步驟。</p>
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
    font-weight: 700;
    margin-bottom: 2px;
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
  .hint {
    margin: 0;
    font-size: 11px;
    color: var(--muted);
  }
</style>
