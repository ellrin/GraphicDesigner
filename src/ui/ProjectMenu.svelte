<script lang="ts">
  import { history, redo, undo } from '../core/history.svelte'
  import { downloadProject, openProjectFile, startNewProject } from '../core/persistence.svelte'

  let fileInput: HTMLInputElement
  let confirmingNew = $state(false)
  let error = $state('')

  async function onFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0]
    if (!file) return
    try {
      await openProjectFile(file)
      error = ''
    } catch (err) {
      error = err instanceof Error ? err.message : '無法開啟檔案'
    }
    fileInput.value = ''
  }

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  const mod = isMac ? '⌘' : 'Ctrl+'
</script>

<div class="menu">
  <button onclick={undo} disabled={!history.canUndo} title="復原（{mod}Z）">↶</button>
  <button onclick={redo} disabled={!history.canRedo} title="重做（{mod}⇧Z）">↷</button>
  <span class="sep"></span>
  {#if confirmingNew}
    <span class="confirm">
      清空目前設計？
      <button onclick={() => { startNewProject(); confirmingNew = false }}>確定</button>
      <button onclick={() => (confirmingNew = false)}>取消</button>
    </span>
  {:else}
    <button onclick={() => (confirmingNew = true)}>新專案</button>
  {/if}
  <button onclick={() => fileInput.click()}>開啟</button>
  <button onclick={downloadProject}>儲存</button>
  <input bind:this={fileInput} type="file" accept=".json,application/json" hidden onchange={onFile} />
  {#if error}<span class="error" role="alert">{error}</span>{/if}
</div>

<style>
  .menu {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }
  .sep {
    width: 1px;
    height: 20px;
    background: var(--line);
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .confirm {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }
  .error {
    color: #c62828;
    font-size: 12px;
  }
</style>
