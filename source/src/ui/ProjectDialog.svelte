<script lang="ts">
  // 專案視窗（頂部「專案」按鈕）：我的專案（切換）、新專案（建立設計的精靈）、專案檔（開啟／儲存 .json）。
  import type { SlotSource } from '../core/autolayout'
  import type { Pt } from '../core/geometry'
  import { openStoredProject, removeProject } from '../core/persistence.svelte'
  import { projects } from '../core/projects.svelte'
  import { project } from '../core/store.svelte'
  import ProjectPanel from './ProjectPanel.svelte'
  import Wizard from './wizard/Wizard.svelte'

  /** wizard：對目前的專案重新打開精靈 */
  export type ProjectTab = 'projects' | 'new' | 'file' | 'wizard'

  interface Props {
    open: boolean
    tab: ProjectTab
    regions: SlotSource[]
    path: Pt[]
  }
  let { open = $bindable(), tab = $bindable(), regions, path }: Props = $props()

  let dialog: HTMLDialogElement
  let deleting = $state<string | null>(null)
  let wizardStep = $state(1)

  $effect(() => {
    if (open && !dialog.open) {
      deleting = null
      dialog.showModal()
    } else if (!open && dialog.open) dialog.close()
  })

  const inWizard = $derived(tab === 'wizard' || tab === 'new' || (tab === 'projects' && !projects.list.length))
  const sorted = $derived([...projects.list].sort((a, b) => b.updatedAt - a.updatedAt))
  function when(t: number) {
    const d = new Date(t)
    return d.toDateString() === new Date().toDateString()
      ? d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })
  }
  function openOne(id: string) {
    openStoredProject(id)
    open = false
  }
</script>

<dialog bind:this={dialog} class:wide={inWizard} oncancel={() => (open = false)} onclose={() => (open = false)}>
  {#if !(inWizard && (wizardStep > 1 || tab === 'wizard'))}
    <header>
      <nav class="tabs">
        {#if projects.list.length}<button class:on={tab === 'projects'} onclick={() => (tab = 'projects')}>我的專案</button>{/if}
        <button class:on={tab === 'new'} onclick={() => (tab = 'new')}>新專案</button>
        <button class:on={tab === 'file'} onclick={() => (tab = 'file')}>專案檔</button>
      </nav>
      <button class="close" onclick={() => (open = false)} title="關閉">✕</button>
    </header>
  {/if}

  {#if open && inWizard}
    {#key tab}
      <Wizard mode={tab === 'wizard' ? 'edit' : 'create'} {regions} {path} bind:step={wizardStep} onclose={() => (open = false)} />
    {/key}
  {:else}
    <div class="body">
      {#if tab === 'projects'}
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
  dialog.wide {
    width: min(980px, calc(100vw - 32px));
    height: min(86vh, 900px);
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
  .name {
    width: 100%;
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
</style>
