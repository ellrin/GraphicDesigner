<script lang="ts">
  // 檢視設定（跨步驟，放在右側）：各種輔助線的顯示、輔助線在上層或下層、不透明度。
  import { project } from '../core/store.svelte'
  import theme from '../config/theme.json'

  const v = $derived(project.visibility)
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

  const rows = $derived([
    { key: 'composition', label: '構圖線', swatch: theme.guides.composition.mainColor, kind: 'line' },
    { key: 'anchors', label: '錨點', swatch: theme.guides.composition.anchorColor, kind: 'dot' },
    { key: 'guides', label: '視覺引導', swatch: theme.guides.visual.mainColor, kind: 'line' },
    { key: 'blocks', label: '區塊', swatch: '#7c5cff', kind: 'box' },
    { key: 'objects', label: '物件', swatch: '', kind: 'none' },
  ] as const)
</script>

<div class="view">
  {#each rows as r (r.key)}
    <label class="row">
      <input type="checkbox" bind:checked={v[r.key]} />
      {#if r.kind === 'line'}<span class="sw" style:border-color={r.swatch}></span>
      {:else if r.kind === 'dot'}<span class="pt" style:background={r.swatch}></span>
      {:else if r.kind === 'box'}<span class="bk"></span>
      {:else}<span class="none"></span>{/if}
      {r.label}
    </label>
  {/each}
  <p class="hint">{isMac ? '⌘' : 'Ctrl+'}; 一鍵切換全部輔助線</p>

  <div class="seg" role="radiogroup" aria-label="輔助線位置">
    <button class:on={v.guidesOnTop} onclick={() => (v.guidesOnTop = true)}>輔助線在物件上層</button>
    <button class:on={!v.guidesOnTop} onclick={() => (v.guidesOnTop = false)}>在下層</button>
  </div>
  <label class="opacity">
    <span>輔助線不透明度 {Math.round(v.guideOpacity * 100)}%</span>
    <input type="range" min="0.15" max="1" step="0.05" bind:value={v.guideOpacity} />
  </label>
</div>

<style>
  .view {
    display: grid;
    gap: 6px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }
  .sw {
    width: 16px;
    border-top: 2px dashed;
  }
  .pt {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin: 0 4px;
  }
  .bk {
    width: 13px;
    height: 9px;
    border: 1.5px dashed #7c5cff;
    border-radius: 2px;
    margin: 0 1px;
  }
  .none {
    width: 16px;
  }
  .hint {
    margin: 2px 0 6px;
    font-size: 11px;
    color: var(--muted);
  }
  .seg {
    display: flex;
  }
  .seg button {
    flex: 1;
    font-size: 12px;
    border-radius: 0;
    padding: 5px 6px;
  }
  .seg button + button {
    border-left: none;
  }
  .seg button:first-child {
    border-radius: var(--radius) 0 0 var(--radius);
  }
  .seg button:last-child {
    border-radius: 0 var(--radius) var(--radius) 0;
  }
  .seg button.on {
    background: var(--accent-soft);
    border-color: var(--accent);
  }
  .opacity {
    display: grid;
    gap: 4px;
    font-size: 12px;
    color: var(--muted);
    margin-top: 6px;
  }
</style>
