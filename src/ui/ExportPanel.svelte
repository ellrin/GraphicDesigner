<script lang="ts">
  // 匯出設定（跨步驟，放在右側）：PNG、PDF、專案檔。
  import exportConfig from '../config/export.json'
  import { exportPdf, exportPng, pngWidth, type Renderer } from '../core/exporter'
  import { downloadProject } from '../core/persistence.svelte'
  import { project } from '../core/store.svelte'

  let { render }: { render: Renderer } = $props()

  const c = $derived(project.canvas)
  const isMm = $derived(c.unit === 'mm')
  let dpi = $state(exportConfig.printDpi)
  let scale = $state(1)
  let bleed = $state(3)
  let cropMarks = $state(true)
  const outW = $derived(pngWidth(c, { dpi, scale }))
  const outH = $derived(Math.round((outW * c.h) / c.w))
  const name = () => `design-${new Date().toISOString().slice(0, 10)}`
</script>

<div class="export">
  <p class="muted">只輸出作品本身（背景與物件），不含輔助線與區塊。</p>

  {#if isMm}
    <label class="row">
      <span>解析度</span>
      <select bind:value={dpi}>
        <option value={150}>150 dpi（螢幕、預覽）</option>
        <option value={300}>300 dpi（一般印刷）</option>
        <option value={600}>600 dpi（高品質印刷）</option>
      </select>
    </label>
  {:else}
    <label class="row">
      <span>倍率</span>
      <select bind:value={scale}>
        <option value={1}>1×</option>
        <option value={2}>2×（高解析螢幕）</option>
        <option value={3}>3×</option>
      </select>
    </label>
  {/if}
  <button class="primary wide" onclick={() => exportPng(render, c, { dpi, scale }, name())}>
    下載 PNG（{outW} × {outH} px）
  </button>

  {#if isMm}
    <div class="two">
      <label class="row">
        <span>出血（mm）</span>
        <input type="number" min="0" max="10" step="0.5" bind:value={bleed} />
      </label>
      <label class="inline">
        <input type="checkbox" bind:checked={cropMarks} disabled={bleed <= 0} /> 裁切標記
      </label>
    </div>
  {/if}
  <button class="wide" onclick={() => exportPdf(render, c, { dpi, bleedMm: bleed, cropMarks }, name())}>
    下載 PDF（{c.w} × {c.h} {c.unit}{isMm && bleed > 0 ? `，含 ${bleed}mm 出血` : ''}）
  </button>

  <button class="wide" onclick={downloadProject}>儲存專案檔（.json，可再開啟繼續編輯）</button>
</div>

<style>
  .export {
    display: grid;
    gap: 8px;
  }
  .muted {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }
  .row {
    display: grid;
    gap: 4px;
    font-size: 13px;
  }
  .inline {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    margin-top: 22px;
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .two input {
    min-width: 0;
    width: 100%;
  }
  .wide {
    width: 100%;
  }
</style>
