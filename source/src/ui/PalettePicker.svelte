<script lang="ts">
  // 色彩庫視窗：依類別瀏覽配色，選用後可一鍵上色（淺色底／深色底）。
  import { PALETTE_CATEGORIES, PALETTES, type Palette } from '../core/palettes'
  import { applyPalette, project } from '../core/store.svelte'

  let { open = $bindable() }: { open: boolean } = $props()

  let dialog: HTMLDialogElement
  let category = $state(PALETTE_CATEGORIES[0])
  let picked = $state<Palette | null>(null)

  $effect(() => {
    if (open && !dialog.open) {
      picked = PALETTES.find((p) => p.id === project.palette) ?? null
      if (picked) category = picked.category
      dialog.showModal()
      dialog.querySelector<HTMLElement>('.close')?.focus()
    } else if (!open && dialog.open) dialog.close()
  })

  const list = $derived(PALETTES.filter((p) => p.category === category))

  function choose(mode?: 'light' | 'dark') {
    if (!picked) return
    if (mode) applyPalette(picked.id, mode)
    else project.palette = picked.id
    open = false
  }
</script>

<dialog bind:this={dialog} oncancel={() => (open = false)} onclose={() => (open = false)}>
  <header>
    <div class="chips">
      {#each PALETTE_CATEGORIES as c (c)}
        <button class:on={category === c} onclick={() => (category = c)}>{c}</button>
      {/each}
    </div>
    <button class="close" onclick={() => (open = false)} title="關閉">✕</button>
  </header>

  <div class="grid">
    {#each list as p (p.id)}
      <button class="card" class:on={picked?.id === p.id} onclick={() => (picked = p)} ondblclick={() => ((picked = p), choose())}>
        <span class="strip">
          {#each p.colors as c, i (i)}<span style:background={c}></span>{/each}
        </span>
        <span class="name">{p.name}</span>
      </button>
    {/each}
  </div>

  <footer>
    {#if picked}
      <span class="strip big">
        {#each picked.colors as c, i (i)}<span style:background={c} title={c}></span>{/each}
      </span>
    {/if}
    <div class="tools">
      <button disabled={!picked} onclick={() => choose()}>只選用色票</button>
      <button class="primary" disabled={!picked} onclick={() => choose('light')}>一鍵上色・淺底</button>
      <button class="primary" disabled={!picked} onclick={() => choose('dark')}>一鍵上色・深底</button>
    </div>
  </footer>
</dialog>

<style>
  dialog {
    width: min(820px, calc(100vw - 32px));
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
    align-items: flex-start;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--line);
  }
  .chips {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chips button {
    padding: 3px 12px;
    font-size: 13px;
    border-radius: 999px;
  }
  .chips button.on {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--text);
  }
  .close {
    border: none;
    background: none;
    color: var(--muted);
  }
  .grid {
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
    gap: 8px;
    padding: 16px;
  }
  .card {
    display: grid;
    gap: 6px;
    padding: 8px;
    text-align: left;
  }
  .card.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .strip {
    display: flex;
    height: 26px;
    border-radius: 4px;
    overflow: hidden;
  }
  .strip span {
    flex: 1;
  }
  .strip.big {
    height: 30px;
    flex: 1;
    min-width: 160px;
  }
  .name {
    font-size: 12px;
  }
  footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-top: 1px solid var(--line);
  }
  .tools {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }
  footer button:disabled {
    opacity: 0.4;
  }
</style>
