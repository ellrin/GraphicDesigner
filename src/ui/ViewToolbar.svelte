<script lang="ts">
  // 浮在畫布上的「檢視」工具列：像繪圖軟體一樣隨時切換各種輔助線的顯示。
  import { project } from '../core/store.svelte'
  import theme from '../config/theme.json'

  let { showSuggestionsToggle = false }: { showSuggestionsToggle?: boolean } = $props()

  const v = $derived(project.visibility)
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
</script>

<div class="bar" role="toolbar" aria-label="檢視" title="{isMac ? '⌘' : 'Ctrl+'}; 一鍵切換全部輔助線">
  <span class="label">檢視</span>
  <button class:on={v.composition} onclick={() => (v.composition = !v.composition)} title="構圖線">
    <span class="sw" style:border-color={theme.guides.composition.mainColor}></span>構圖線
  </button>
  <button class:on={v.anchors} onclick={() => (v.anchors = !v.anchors)} title="錨點">
    <span class="pt" style:background={theme.guides.composition.anchorColor}></span>錨點
  </button>
  <button class:on={v.guides} onclick={() => (v.guides = !v.guides)} title="視覺引導">
    <span class="sw" style:border-color={theme.guides.visual.mainColor}></span>視覺引導
  </button>
  <button class:on={v.blocks} onclick={() => (v.blocks = !v.blocks)} title="區塊">
    <span class="bk"></span>區塊
  </button>
  <button class:on={v.objects} onclick={() => (v.objects = !v.objects)} title="物件">物件</button>
  {#if showSuggestionsToggle}
    <button class:on={v.suggestions} onclick={() => (v.suggestions = !v.suggestions)} title="建議區塊">建議</button>
  {/if}
  <span class="sep"></span>
  <button
    class="order on"
    onclick={() => (v.guidesOnTop = !v.guidesOnTop)}
    title="切換輔助線在物件的上方或下方"
  >
    輔助線在{v.guidesOnTop ? '上層' : '下層'} ⇅
  </button>
  <label class="opacity" title="輔助線不透明度">
    <input type="range" min="0.15" max="1" step="0.05" bind:value={v.guideOpacity} aria-label="輔助線不透明度" />
    {Math.round(v.guideOpacity * 100)}%
  </label>
</div>

<style>
  .bar {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px;
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    z-index: 2;
    flex-wrap: wrap;
    max-width: calc(100% - 20px);
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: none;
    background: none;
    font-size: 12px;
    padding: 4px 8px;
    color: var(--muted);
    text-decoration: line-through;
  }
  button.on {
    color: var(--text);
    text-decoration: none;
    background: var(--accent-soft);
  }
  .sw {
    width: 14px;
    border-top: 2px dashed;
  }
  .pt {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }
  .bk {
    width: 11px;
    height: 8px;
    border: 1.5px dashed #7c5cff;
    border-radius: 2px;
  }
  .sep {
    width: 1px;
    height: 18px;
    background: var(--line);
    margin: 0 4px;
  }
  .order {
    font-weight: 600;
  }
  .opacity {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .opacity input {
    width: 70px;
  }
  .label {
    font-size: 11px;
    color: var(--muted);
    padding: 0 4px;
  }
</style>
