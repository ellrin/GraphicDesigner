<script lang="ts">
  // 專案檔：把 .json 專案檔拖進來（或點選）即可繼續上次的編輯；也可以存成 .json。
  import { downloadProject, openProjectWithMessage, projectMessage as message } from '../core/persistence.svelte'

  let { onopened }: { onopened?: () => void } = $props()

  let fileInput: HTMLInputElement
  let dragging = $state(false)

  async function open(file: File) {
    if (await openProjectWithMessage(file)) onopened?.()
  }

  function onPick(e: Event) {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (file) open(file)
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    dragging = false
    const file = e.dataTransfer?.files?.[0]
    if (file) open(file)
  }

  function save() {
    downloadProject()
    Object.assign(message, { kind: 'ok', text: '已下載專案檔' })
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

  <button class="primary save" onclick={save}>儲存目前專案（.json）</button>

  {#if message.text}
    <p class="msg" class:error={message.kind === 'error'} role="status">{message.text}</p>
  {/if}
</div>

<style>
  .project {
    display: grid;
    gap: 10px;
  }
  .drop {
    width: 100%;
    display: grid;
    gap: 4px;
    padding: 22px 10px;
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
  .msg {
    margin: 0;
    font-size: 12px;
    color: var(--ok);
  }
  .msg.error {
    color: var(--danger);
  }
</style>
