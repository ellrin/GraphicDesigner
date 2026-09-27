<script lang="ts" module>
  // 區塊內的小分組開合狀態記在瀏覽器中（介面偏好，不寫進專案檔）
  const KEY = 'graphic-designer:folds'
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
  // 區塊內可收合的小分組（預設收合），讓細項不會一次全部攤開。
  import type { Snippet } from 'svelte'

  interface Props {
    title: string
    /** 用來記住開合狀態；沒有時不記 */
    id?: string
    /** 標題旁的數量 */
    count?: number
    children: Snippet
  }
  let { title, id, count, children }: Props = $props()

  // svelte-ignore state_referenced_locally
  let open = $state(id ? (saved[id] ?? false) : false)

  function toggle() {
    open = !open
    if (id) remember(id, open)
  }
</script>

<div class="fold" class:open>
  <button class="fold-head" onclick={toggle} aria-expanded={open}>
    <span class="caret" aria-hidden="true">▸</span>
    {title}
    {#if count !== undefined}<small>{count}</small>{/if}
  </button>
  {#if open}
    <div class="fold-body">{@render children()}</div>
  {/if}
</div>

<style>
  .fold {
    border-top: 1px dashed var(--line);
  }
  .fold-head {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 0;
    border: none;
    border-radius: 0;
    background: none;
    font-size: 13px;
    color: var(--muted);
    text-align: left;
  }
  .fold-head:hover:not(:disabled) {
    background: none;
    color: var(--text);
  }
  .open .fold-head {
    color: var(--text);
  }
  .caret {
    font-size: 10px;
    transition: transform 0.15s;
  }
  .open .caret {
    transform: rotate(90deg);
    color: var(--accent);
  }
  small {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--faint);
  }
  .fold-body {
    display: grid;
    gap: 10px;
    padding: 2px 0 12px;
  }
</style>
