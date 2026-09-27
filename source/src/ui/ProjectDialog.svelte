<script lang="ts">
  // 專案視窗（頂部「專案」按鈕）：建立新專案（畫布尺寸、起點）與開啟／儲存專案檔。
  // 畫布尺寸只在建立專案時決定，設計途中不再更改。
  import { untrack } from 'svelte'
  import { CANVAS_PRESETS, type CanvasSpec } from '../core/canvas'
  import { RECIPES, type Recipe } from '../core/recipes'
  import { createProject } from '../core/persistence.svelte'
  import { project } from '../core/store.svelte'
  import { compositionTemplates } from '../layers/1-composition/templates'
  import CanvasSettings from './CanvasSettings.svelte'
  import Help from './Help.svelte'
  import ProjectPanel from './ProjectPanel.svelte'
  import RecipeThumb from './RecipeThumb.svelte'

  interface Props {
    open: boolean
    tab: 'new' | 'file'
  }
  let { open = $bindable(), tab = $bindable() }: Props = $props()

  let dialog: HTMLDialogElement
  let draft = $state<CanvasSpec>({ ...project.canvas })
  let start = $state<'blank' | 'recipe'>('blank')
  let recipe = $state<Recipe | null>(null)
  let group = $state('all')
  let confirming = $state(false)

  $effect(() => {
    if (open && !dialog.open) {
      untrack(() => {
        draft = { ...project.canvas }
        start = 'blank'
        recipe = null
        confirming = false
      })
      dialog.showModal()
    } else if (!open && dialog.open) dialog.close()
  })

  const groups = [...new Set(RECIPES.map((r) => r.group))]
  const groupName = (id: string) => compositionTemplates.find((t) => t.id === id)?.meta.name ?? id
  const list = $derived(group === 'all' ? RECIPES : RECIPES.filter((r) => r.group === group))
  const aspect = $derived(draft.w / draft.h)
  const hasWork = $derived(
    project.compositions.items.length > 0 ||
      project.guides.items.length > 0 ||
      project.blocks.items.length > 0 ||
      project.objects.items.length > 0 ||
      !!project.background.assetId,
  )

  /** 選範例時，畫布改成範例建議的尺寸（之後仍可自行修改） */
  function pick(r: Recipe) {
    recipe = r
    const p = r.canvas ? CANVAS_PRESETS.find((q) => q.id === r.canvas) : undefined
    if (!p) return
    const [w, h] = r.portrait ? [Math.min(p.w, p.h), Math.max(p.w, p.h)] : [p.w, p.h]
    draft = { presetId: p.id, w, h, unit: p.unit }
  }

  const ready = $derived(start === 'blank' || recipe !== null)

  function create() {
    if (!ready) return
    if (hasWork && !confirming) {
      confirming = true
      return
    }
    createProject(draft, start === 'recipe' ? recipe : null)
    open = false
  }
</script>

<dialog bind:this={dialog} oncancel={() => (open = false)} onclose={() => (open = false)}>
  <header>
    <nav class="tabs">
      <button class:on={tab === 'new'} onclick={() => (tab = 'new')}>新專案</button>
      <button class:on={tab === 'file'} onclick={() => (tab = 'file')}>專案檔</button>
    </nav>
    <button class="close" onclick={() => (open = false)} title="關閉">✕</button>
  </header>

  <div class="body">
    {#if tab === 'new'}
      <section>
        <h3>畫布尺寸 <Help text="畫布尺寸在建立專案時決定。" /></h3>
        <CanvasSettings bind:spec={draft} />
      </section>

      <section>
        <h3>起點</h3>
        <div class="starts">
          <button class="start" class:on={start === 'blank'} onclick={() => (start = 'blank')}>
            <strong>空白開始</strong>
            <span>從第一步自行選擇構圖</span>
          </button>
          <button class="start" class:on={start === 'recipe'} onclick={() => (start = 'recipe')}>
            <strong>從版型範例開始</strong>
            <span>構圖、引導與區塊都已配置好，可再逐步調整</span>
          </button>
        </div>
      </section>

      {#if start === 'recipe'}
        <section>
          <div class="chips">
            <button class:on={group === 'all'} onclick={() => (group = 'all')}>全部</button>
            {#each groups as g (g)}
              <button class:on={group === g} onclick={() => (group = g)}>{groupName(g)}</button>
            {/each}
          </div>
          <div class="grid">
            {#each list as r (r.id)}
              <button class="card" class:on={recipe?.id === r.id} onclick={() => pick(r)} title={r.description}>
                <RecipeThumb recipe={r} {aspect} />
                <span class="name">{r.name}</span>
                <small>{groupName(r.group)}</small>
              </button>
            {/each}
          </div>
        </section>
      {/if}
    {:else}
      <section>
        <p class="current">目前畫布：{project.canvas.w} × {project.canvas.h} {project.canvas.unit}</p>
        <ProjectPanel onopened={() => (open = false)} />
      </section>
    {/if}
  </div>

  {#if tab === 'new'}
    <footer>
      {#if confirming}
        <span class="warn">目前的設計會被取代，未儲存的內容無法復原。</span>
        <button onclick={() => (tab = 'file')}>先儲存</button>
        <button class="primary" onclick={create}>確定建立</button>
      {:else}
        <button onclick={() => (open = false)}>取消</button>
        <button class="primary" disabled={!ready} onclick={create}>建立</button>
      {/if}
    </footer>
  {/if}
</dialog>

<style>
  dialog {
    width: min(760px, calc(100vw - 32px));
    max-height: min(86vh, 900px);
    padding: 0;
    border: 1px solid var(--line-strong);
    border-radius: 12px;
    background: var(--panel);
    color: var(--text);
    display: none;
    flex-direction: column;
    overflow: hidden;
  }
  dialog[open] {
    display: flex;
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.55);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px 0;
    border-bottom: 1px solid var(--line);
  }
  .tabs {
    display: flex;
    gap: 4px;
  }
  .tabs button {
    border: none;
    border-radius: 0;
    background: none;
    padding: 8px 14px 10px;
    color: var(--muted);
    border-bottom: 2px solid transparent;
    font-size: 14px;
  }
  .tabs button.on {
    color: var(--text);
    font-weight: 700;
    border-bottom-color: var(--accent);
  }
  .close {
    border: none;
    background: none;
    color: var(--muted);
  }
  .body {
    counter-reset: section;
    overflow-y: auto;
    padding: 8px 20px 16px;
  }
  section {
    padding: 12px 0;
  }
  h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 10px;
    font-size: 14px;
  }
  .starts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .start {
    display: grid;
    gap: 4px;
    padding: 12px;
    text-align: left;
  }
  .start span {
    font-size: 12px;
    color: var(--muted);
  }
  .start.on,
  .card.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 10px;
  }
  .chips button {
    padding: 3px 10px;
    font-size: 12px;
    border-radius: 999px;
  }
  .chips button.on {
    border-color: var(--accent);
    color: var(--text);
    background: var(--accent-soft);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 8px;
  }
  .card {
    display: grid;
    gap: 6px;
    padding: 8px;
    text-align: left;
    align-content: start;
  }
  .card .name {
    font-size: 12px;
    line-height: 1.35;
  }
  .card small {
    font-size: 11px;
    color: var(--muted);
  }
  .current {
    margin: 0 0 12px;
    font-size: 13px;
    color: var(--muted);
  }
  footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 20px;
    border-top: 1px solid var(--line);
  }
  .warn {
    margin-right: auto;
    font-size: 12px;
    color: var(--highlight);
  }
  footer button:disabled {
    opacity: 0.4;
  }
  @media (max-width: 600px) {
    .starts {
      grid-template-columns: 1fr;
    }
  }
</style>
