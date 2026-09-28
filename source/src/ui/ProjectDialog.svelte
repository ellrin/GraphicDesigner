<script lang="ts">
  // 專案視窗（頂部「專案」按鈕）：我的專案（切換）、新專案（尺寸、起點、沿用）、專案檔（開啟／儲存 .json）。
  // 畫布尺寸只在建立專案時決定，設計途中不再更改。
  import { untrack } from 'svelte'
  import { CANVAS_PRESETS, type CanvasSpec } from '../core/canvas'
  import type { Recipe } from '../core/recipes'
  import { roleDef } from '../core/autolayout'
  import { createProject, openStoredProject, removeProject, storedProjectData } from '../core/persistence.svelte'
  import { projects } from '../core/projects.svelte'
  import { contentText, isContent, project, type ProjectData } from '../core/store.svelte'
  import CanvasSettings from './CanvasSettings.svelte'
  import Help from './Help.svelte'
  import ProjectPanel from './ProjectPanel.svelte'
  import RecipeGallery from './RecipeGallery.svelte'

  export type ProjectTab = 'projects' | 'new' | 'file'

  interface Props {
    open: boolean
    tab: ProjectTab
  }
  let { open = $bindable(), tab = $bindable() }: Props = $props()

  let dialog: HTMLDialogElement
  let draft = $state<CanvasSpec>({ ...project.canvas })
  let start = $state<'blank' | 'recipe'>('blank')
  let recipe = $state<Recipe | null>(null)
  let name = $state('')
  let useRecipeSize = $state(false)
  let deleting = $state<string | null>(null)

  // 沿用：來源專案與要帶過來的項目
  let carryOn = $state(false)
  let sourceId = $state<string | null>(null)
  let carryPalette = $state(true)
  let carryLogo = $state(true)
  let carryTexts = $state<string[]>([])

  $effect(() => {
    if (open && !dialog.open) {
      untrack(() => {
        draft = { ...project.canvas }
        start = 'blank'
        recipe = null
        name = ''
        useRecipeSize = false
        deleting = null
        carryOn = false
        sourceId = projects.current
      })
      dialog.showModal()
    } else if (!open && dialog.open) dialog.close()
  })

  const aspect = $derived(draft.w / draft.h)

  // ── 我的專案 ──
  const sorted = $derived([...projects.list].sort((a, b) => b.updatedAt - a.updatedAt))
  function when(t: number) {
    const d = new Date(t)
    const today = new Date()
    return d.toDateString() === today.toDateString()
      ? d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })
  }
  function openOne(id: string) {
    openStoredProject(id)
    open = false
  }

  // ── 新專案：沿用 ──
  const source = $derived<ProjectData | null>(carryOn && sourceId ? storedProjectData(sourceId) : null)
  const sourceTexts = $derived(source ? source.objects.items.filter((o) => isContent(o) && o.type === 'text') : [])
  const sourceHasLogo = $derived(!!source?.objects.items.some((o) => isContent(o) && o.type === 'image'))
  // 換來源時：預設只帶標題
  $effect(() => {
    const list = sourceTexts
    untrack(() => (carryTexts = list.filter((o) => o.props.role === 'title').map((o) => o.uid)))
  })
  const toggleText = (uid: string) => (carryTexts = carryTexts.includes(uid) ? carryTexts.filter((x) => x !== uid) : [...carryTexts, uid])

  /** 範例建議的畫布（與目前選的尺寸不同時才列出；預設不使用，避免蓋掉已選的尺寸） */
  const recipeCanvas = $derived.by((): (CanvasSpec & { label: string }) | null => {
    const p = recipe?.canvas ? CANVAS_PRESETS.find((q) => q.id === recipe!.canvas) : undefined
    if (!p || !recipe) return null
    const [w, h] = recipe.portrait ? [Math.min(p.w, p.h), Math.max(p.w, p.h)] : [p.w, p.h]
    if (w === draft.w && h === draft.h && p.unit === draft.unit) return null
    return { presetId: p.id, w, h, unit: p.unit, label: p.name }
  })

  const ready = $derived(start === 'blank' || recipe !== null)

  function create() {
    if (!ready) return
    const canvas = useRecipeSize && recipeCanvas ? recipeCanvas : draft
    createProject({ presetId: canvas.presetId, w: canvas.w, h: canvas.h, unit: canvas.unit }, start === 'recipe' ? recipe : null, {
      name: name.trim(),
      carry: source ? { source, palette: carryPalette, logo: carryLogo, texts: carryTexts } : undefined,
    })
    open = false
  }
</script>

<dialog bind:this={dialog} oncancel={() => (open = false)} onclose={() => (open = false)}>
  <header>
    <nav class="tabs">
      {#if projects.list.length}<button class:on={tab === 'projects'} onclick={() => (tab = 'projects')}>我的專案</button>{/if}
      <button class:on={tab === 'new'} onclick={() => (tab = 'new')}>新專案</button>
      <button class:on={tab === 'file'} onclick={() => (tab = 'file')}>專案檔</button>
    </nav>
    <button class="close" onclick={() => (open = false)} title="關閉">✕</button>
  </header>

  <div class="body">
    {#if tab === 'projects' && projects.list.length}
      <div class="projects">
        {#each sorted as p (p.id)}
          <div class="proj" class:current={p.id === projects.current}>
            <button class="pick" onclick={() => openOne(p.id)} title="開啟">
              <span class="thumb" style:aspect-ratio="{p.w} / {p.h}">{#if p.thumb}<img src={p.thumb} alt="" />{/if}</span>
              <span class="pname">{p.name || '未命名設計'}</span>
              <small>{p.w} × {p.h} {p.unit}・{when(p.updatedAt)}{p.id === projects.current ? '・目前' : ''}</small>
            </button>
            {#if deleting === p.id}
              <span class="confirm">
                <button class="danger" onclick={() => ((deleting = null), removeProject(p.id))}>刪除</button>
                <button onclick={() => (deleting = null)}>取消</button>
              </span>
            {:else}
              <button class="del" onclick={() => (deleting = p.id)} title="刪除專案">✕</button>
            {/if}
          </div>
        {/each}
      </div>
    {:else if tab === 'new' || (tab === 'projects' && !projects.list.length)}
      <section>
        <h3>名稱</h3>
        <input class="name" type="text" bind:value={name} placeholder="未命名設計" />
      </section>

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
            <span>構圖、引導與區塊都已配置好，直接從插入物件開始</span>
          </button>
        </div>
      </section>

      {#if start === 'recipe'}
        <section>
          <RecipeGallery {aspect} selected={recipe} onpick={(r) => (recipe = r)} />
          {#if recipeCanvas}
            <label class="check"><input type="checkbox" bind:checked={useRecipeSize} /> 改用範例的尺寸（{recipeCanvas.label}　{recipeCanvas.w} × {recipeCanvas.h} {recipeCanvas.unit}）</label>
          {/if}
        </section>
      {/if}

      {#if projects.list.length}
        <section>
          <label class="check"><input type="checkbox" bind:checked={carryOn} /> 沿用其他專案（系列作品）</label>
          {#if carryOn}
            <div class="carry">
              <select bind:value={sourceId} aria-label="沿用的專案">
                {#each sorted as p (p.id)}<option value={p.id}>{p.name || '未命名設計'}（{p.w} × {p.h} {p.unit}）</option>{/each}
              </select>
              {#if source}
                <div class="chips">
                  {#if source.palette}<label><input type="checkbox" bind:checked={carryPalette} /> 配色</label>{/if}
                  {#if sourceHasLogo}<label><input type="checkbox" bind:checked={carryLogo} /> Logo</label>{/if}
                </div>
                {#if sourceTexts.length}
                  <ul class="texts">
                    {#each sourceTexts as o (o.uid)}
                      <li>
                        <label>
                          <input type="checkbox" checked={carryTexts.includes(o.uid)} onchange={() => toggleText(o.uid)} />
                          <small>{roleDef(String(o.props.role)).label}</small>
                          <span>{contentText(o).split('\n')[0]}</span>
                        </label>
                      </li>
                    {/each}
                  </ul>
                {/if}
              {/if}
            </div>
          {/if}
        </section>
      {/if}
    {:else}
      <section>
        <label class="field">
          <span>專案名稱</span>
          <input class="name" type="text" bind:value={project.name} placeholder="未命名設計" />
        </label>
        <p class="current">目前畫布：{project.canvas.w} × {project.canvas.h} {project.canvas.unit}</p>
        <ProjectPanel onopened={() => (open = false)} />
      </section>
    {/if}
  </div>

  {#if tab === 'new' || (tab === 'projects' && !projects.list.length)}
    <footer>
      <button onclick={() => (open = false)}>取消</button>
      <button class="primary" disabled={!ready} onclick={create}>建立</button>
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
  .start.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .name {
    width: 100%;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
    font-size: 13px;
  }
  .field {
    display: grid;
    gap: 6px;
    margin-bottom: 12px;
    font-size: 13px;
  }
  .field > span {
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
  footer button:disabled {
    opacity: 0.4;
  }
  @media (max-width: 600px) {
    .starts {
      grid-template-columns: 1fr;
    }
  }
  .projects {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 10px;
    padding: 14px 0;
  }
  .proj {
    position: relative;
    display: grid;
  }
  .pick {
    display: grid;
    gap: 5px;
    padding: 8px;
    text-align: left;
  }
  .proj.current .pick {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .thumb {
    display: block;
    width: 100%;
    max-height: 140px;
    border-radius: 4px;
    background: var(--surface);
    box-shadow: 0 0 0 1px var(--line);
    overflow: hidden;
  }
  .thumb img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .pname {
    font-size: 13px;
    font-weight: 700;
  }
  .pick small {
    font-size: 11px;
    color: var(--muted);
  }
  .del {
    position: absolute;
    top: 4px;
    right: 4px;
    padding: 0 6px;
    border: none;
    background: rgb(0 0 0 / 0.45);
    color: #fff;
    font-size: 12px;
  }
  .confirm {
    position: absolute;
    top: 4px;
    right: 4px;
    display: flex;
    gap: 4px;
  }
  .confirm button {
    padding: 2px 8px;
    font-size: 12px;
  }
  .danger {
    border-color: var(--danger);
    background: var(--danger);
    color: #fff;
  }
  .carry {
    display: grid;
    gap: 8px;
    margin: 8px 0 0 26px;
  }
  .carry .chips {
    display: flex;
    gap: 16px;
    font-size: 13px;
  }
  .texts {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
    font-size: 13px;
  }
  .texts label {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .texts small {
    color: var(--muted);
    min-width: 3em;
  }
  .texts span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
