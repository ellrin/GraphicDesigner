<script lang="ts">
  // 說明小圖示：平常只顯示一個圓形問號，滑鼠移上去（或鍵盤聚焦）才顯示說明文字。
  // 說明框使用固定定位並限制在視窗內，不會被側欄的捲動區域裁掉。
  let { text }: { text: string } = $props()

  let icon: HTMLButtonElement
  let pos = $state<{ top: number; left: number } | null>(null)
  const WIDTH = 260

  function show() {
    const r = icon.getBoundingClientRect()
    const left = Math.min(Math.max(8, r.left + r.width / 2 - WIDTH / 2), window.innerWidth - WIDTH - 8)
    const below = r.bottom + 8
    pos = { top: below + 120 > window.innerHeight ? Math.max(8, r.top - 8 - 120) : below, left }
  }
</script>

<button
  type="button"
  class="help"
  bind:this={icon}
  aria-label={text}
  onmouseenter={show}
  onmouseleave={() => (pos = null)}
  onfocus={show}
  onblur={() => (pos = null)}
>?</button>
{#if pos}
  <span class="bubble" role="tooltip" style:top="{pos.top}px" style:left="{pos.left}px" style:width="{WIDTH}px">{text}</span>
{/if}

<style>
  .help {
    padding: 0;
    background: none;
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 1px solid var(--line-strong);
    color: var(--muted);
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 600;
    line-height: 1;
    cursor: help;
    user-select: none;
  }
  .help:hover:not(:disabled),
  .help:focus-visible {
    background: none;
    border-color: var(--accent);
    color: var(--accent);
    outline: none;
  }
  .bubble {
    position: fixed;
    z-index: 100;
    padding: 8px 10px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    color: var(--text);
    font-family: var(--font);
    font-size: 12px;
    font-weight: 400;
    line-height: 1.6;
    letter-spacing: 0;
    white-space: normal;
    pointer-events: none;
  }
</style>
