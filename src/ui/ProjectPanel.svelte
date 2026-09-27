<script lang="ts">
  // 專案檔區域：把 .json 專案檔拖進來（或點選）即可繼續上次的編輯；也可以存成 .json。
  import { downloadProject, openProjectFile, startNewProject } from '../core/persistence.svelte'

  let fileInput: HTMLInputElement
  let dragging = $state(false)
  let confirmingNew = $state(false)
  let message = $state<{ kind: 'ok' | 'error'; text: string } | null>(null)

  export async function open(file: File) {
    try {
      await openProjectFile(file)
      message = { kind: 'ok', text: `已開啟「${file.name}」` }
    } catch (err) {
      message = { kind: 'error', text: err instanceof Error ? err.message : '無法開啟檔案' }
    }
  }

  function onPick(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (file) open(file)
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    dragging = false
    const file = e.dataTransfer?.files?.[0]
    if (file) open(file)
  }

  function save() {
    downloadProject()
    message = { kind: 'ok', text: '已下載專案檔，下次拖進上方區域即可繼續編輯' }
  }
</script>

<section class="project">
  <h3>專案檔</h3>
  <button
    class="drop"
    class:dragging
    onclick={() => fileInput.click()}
    ondragover={(e) => {
      e.preventDefault()
      dragging = true
    }}
    ondragleave={() => (dragging = false)}
    ondrop={onDrop}
  >
    <strong>開啟專案檔</strong>
    <span>把 .json 檔拖到這裡，或點一下選擇檔案</span>
  </button>
  <input bind:this={fileInput} type="file" accept=".json,application/json" hidden onchange={onPick} />

  <div class="actions">
    <button class="primary" onclick={save}>儲存專案檔（.json）</button>
    {#if confirmingNew}
      <span class="confirm">
        清空目前設計？
        <button onclick={() => { startNewProject(); confirmingNew = false; message = null }}>確定</button>
        <button onclick={() => (confirmingNew = false)}>取消</button>
      </span>
    {:else}
      <button onclick={() => (confirmingNew = true)}>新專案</button>
    {/if}
  </div>

  {#if message}
    <p class="msg" class:error={message.kind === 'error'} role="status">{message.text}</p>
  {/if}
  <p class="note">瀏覽器會自動暫存目前進度；要換電腦、備份或分享，請儲存成專案檔。專案檔包含用到的圖片。</p>
</section>

<style>
  .drop {
    width: 100%;
    display: grid;
    gap: 4px;
    padding: 14px 10px;
    border: 1.5px dashed #b9b3a9;
    border-radius: 8px;
    background: #fff;
    text-align: center;
  }
  .drop span {
    font-size: 12px;
    color: var(--muted);
  }
  .drop.dragging,
  .drop:hover {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
  }
  .confirm {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
  }
  .msg {
    margin: 8px 0 0;
    font-size: 12px;
    color: #1b7f4b;
  }
  .msg.error {
    color: #c62828;
  }
  .note {
    margin: 8px 0 0;
    font-size: 11px;
    color: var(--muted);
  }
</style>
