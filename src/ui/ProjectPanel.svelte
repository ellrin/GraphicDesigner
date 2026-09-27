<script lang="ts">
  // 專案檔區域：把 .json 專案檔拖進來（或點選）即可繼續上次的編輯；也可以存成 .json。
  import { downloadProject, openProjectWithMessage as open, projectMessage as message, startNewProject } from '../core/persistence.svelte'

  let fileInput: HTMLInputElement
  let dragging = $state(false)
  let confirmingNew = $state(false)

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
    Object.assign(message, { kind: 'ok', text: '已下載專案檔，下次拖進上方區域即可繼續編輯' })
  }
</script>

<div class="project">
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
        <button onclick={() => { startNewProject(); confirmingNew = false; message.text = '' }}>確定</button>
        <button onclick={() => (confirmingNew = false)}>取消</button>
      </span>
    {:else}
      <button onclick={() => (confirmingNew = true)}>新專案</button>
    {/if}
  </div>

  {#if message.text}
    <p class="msg" class:error={message.kind === 'error'} role="status">{message.text}</p>
  {/if}
  <p class="note">瀏覽器會自動暫存目前進度；要換電腦、備份或分享，請儲存成專案檔。專案檔包含用到的圖片。</p>
</div>

<style>
  .drop {
    width: 100%;
    display: grid;
    gap: 4px;
    padding: 14px 10px;
    border: 1.5px dashed var(--line-strong);
    border-radius: 8px;
    background: var(--surface);
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
    color: var(--ok);
  }
  .msg.error {
    color: var(--danger);
  }
  .note {
    margin: 8px 0 0;
    font-size: 11px;
    color: var(--muted);
  }
</style>
