<script lang="ts" module>
  // 各區塊的開合狀態記在瀏覽器中（介面偏好，不寫進專案檔）
  const KEY = 'graphic-designer:sections'
  let saved: Record<string, boolean> = {}
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? '{}')
  } catch {
    saved = {}
  }
  function remember(id: string, open: boolean) {
    saved[id] = open
    try {
      localStorage.setItem(KEY, JSON.stringify(saved))
    } catch {
      // 略過
    }
  }
</script>

<script lang="ts">
  // 可收合的面板區塊：點標題展開／收合。
  import type { Snippet } from 'svelte'

  interface Props {
    /** 用來記住開合狀態的識別碼 */
    id: string
    title: string
    /** 第一次出現時預設展開 */
    defaultOpen?: boolean
    /** 這個值改變（且不為空）時自動展開，例如選取了新的物件 */
    reopen?: unknown
    children: Snippet
  }
  let { id, title, defaultOpen = true, reopen, children }: Props = $props()

  // svelte-ignore state_referenced_locally
  let open = $state(saved[id] ?? defaultOpen)

  $effect(() => {
    if (reopen) open = true
  })

  function toggle() {
    open = !open
    remember(id, open)
  }
</script>

<section class="sec" class:closed={!open}>
  <h3>
    <button class="head" onclick={toggle} aria-expanded={open}>
      <span class="title">{title}</span>
      <span class="chev" aria-hidden="true">{open ? '−' : '+'}</span>
    </button>
  </h3>
  {#if open}
    {@render children()}
  {/if}
</section>

<style>
  .head {
    flex: 1;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    border: none;
    background: none;
    padding: 0;
    font: inherit;
    color: inherit;
    text-align: left;
  }
  .head:hover:not(:disabled) {
    background: none;
    color: var(--accent);
  }
  .chev {
    font-family: var(--mono);
    font-size: 14px;
    color: var(--muted);
    width: 16px;
    text-align: center;
  }
  .closed :global(h3) {
    margin-bottom: 0;
  }
</style>
