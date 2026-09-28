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
  import { onDestroy, type Snippet } from 'svelte'
  import Help from './Help.svelte'
  import { accordionGroup, openIn, register, setOpen } from './accordionState.svelte'

  interface Props {
    /** 用來記住開合狀態的識別碼 */
    id: string
    title: string
    /** 第一次出現時預設展開 */
    defaultOpen?: boolean
    /** 這個值改變（且不為空）時自動展開，例如選取了新的物件 */
    reopen?: unknown
    /** 說明文字：顯示成標題旁的問號，滑鼠移上去才看得到 */
    help?: string
    children: Snippet
  }
  let { id, title, defaultOpen = true, reopen, help, children }: Props = $props()

  // 在手風琴組裡：由組決定展開哪一個；否則各自記住開合
  const group = accordionGroup()
  // svelte-ignore state_referenced_locally
  const groupName = group?.()
  // svelte-ignore state_referenced_locally
  if (groupName) onDestroy(register(groupName, id))

  // svelte-ignore state_referenced_locally
  let own = $state(saved[id] ?? defaultOpen)
  const open = $derived(groupName ? openIn(groupName) === id : own)

  $effect(() => {
    if (!reopen) return
    if (groupName) setOpen(groupName, id)
    else own = true
  })

  function toggle() {
    if (groupName) {
      setOpen(groupName, open ? null : id)
      return
    }
    own = !own
    remember(id, own)
  }
</script>

<section class="sec" class:closed={!open}>
  <!-- 整列都可以點：點標題、空白處或右邊的按鈕都會開合；問號只顯示說明 -->
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <h3 class="bar" onclick={toggle}>
    <button class="head" onclick={(e) => (e.stopPropagation(), toggle())} aria-expanded={open}>{title}</button>
    {#if help}<span class="help-wrap" onclick={(e) => e.stopPropagation()} role="presentation"><Help text={help} /></span>{/if}
    <span class="chev" aria-hidden="true">{open ? '−' : '+'}</span>
  </h3>
  {#if open}
    {@render children()}
  {/if}
</section>

<style>
  h3 {
    align-items: center;
    cursor: pointer;
    user-select: none;
  }
  h3:hover .head,
  h3:hover .chev {
    color: var(--accent);
  }
  h3:hover .chev {
    border-color: var(--accent);
  }
  .help-wrap {
    display: inline-flex;
  }
  .head {
    display: flex;
    align-items: baseline;
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
    /* 右邊的開合按鈕：有邊框的方形，看得出是按鈕 */
  .chev {
    margin-left: auto;
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    flex: none;
    border: 1px solid var(--line-strong);
    border-radius: 6px;
    background: var(--surface);
    font-family: var(--mono);
    font-size: 16px;
    line-height: 1;
    color: var(--muted);
  }
  .closed :global(h3) {
    margin-bottom: 0;
  }
</style>
