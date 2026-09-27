<script lang="ts">
  // 右側面板：跨步驟的設定（專案檔、畫布、檢視、圖層與排序、匯出、介面主題）。
  // 可收合成一排圖示，讓畫布變寬。
  import type { Renderer } from '../core/exporter'
  import CanvasSettings from './CanvasSettings.svelte'
  import ExportPanel from './ExportPanel.svelte'
  import LayerList from './LayerList.svelte'
  import ProjectPanel from './ProjectPanel.svelte'
  import Section from './Section.svelte'
  import ThemeSwitcher from './ThemeSwitcher.svelte'
  import ViewSettings from './ViewSettings.svelte'

  interface Props {
    render: Renderer
    collapsed: boolean
    ontoggle: () => void
  }
  let { render, collapsed, ontoggle }: Props = $props()

  const RAIL = [
    { id: 'right-project', icon: '檔', label: '專案檔' },
    { id: 'right-canvas', icon: '布', label: '畫布' },
    { id: 'right-view', icon: '視', label: '檢視' },
    { id: 'right-layers', icon: '層', label: '圖層與排序' },
    { id: 'right-export', icon: '出', label: '匯出' },
    { id: 'right-theme', icon: '色', label: '介面主題' },
  ]

  function openSection(id: string) {
    ontoggle()
    // 展開後捲到該區塊
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }
</script>

{#if collapsed}
  <nav class="rail" aria-label="右側面板">
    <button class="toggle" onclick={ontoggle} title="展開右側面板">«</button>
    {#each RAIL as r (r.id)}
      <button onclick={() => openSection(r.id)} title={r.label}>{r.icon}</button>
    {/each}
  </nav>
{:else}
  <div class="panel">
    <div class="top">
      <span>全域設定</span>
      <button class="toggle" onclick={ontoggle} title="收合右側面板">»</button>
    </div>
    <div id="right-project"><Section id="right-project" title="專案檔"><ProjectPanel /></Section></div>
    <div id="right-canvas"><Section id="right-canvas" title="畫布"><CanvasSettings /></Section></div>
    <div id="right-view"><Section id="right-view" title="檢視"><ViewSettings /></Section></div>
    <div id="right-layers"><Section id="right-layers" title="圖層與排序"><LayerList /></Section></div>
    <div id="right-export"><Section id="right-export" title="匯出"><ExportPanel {render} /></Section></div>
    <div id="right-theme"><Section id="right-theme" title="介面主題" defaultOpen={false}><ThemeSwitcher /></Section></div>
  </div>
{/if}

<style>
  .panel {
    padding: 0 18px 24px;
    counter-reset: section;
  }
  .top {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 0 8px;
    background: var(--panel);
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.15em;
    color: var(--muted);
  }
  .toggle {
    font-family: var(--mono);
    padding: 2px 8px;
  }
  .rail {
    display: grid;
    align-content: start;
    gap: 6px;
    padding: 12px 6px;
  }
  .rail button {
    width: 36px;
    height: 36px;
    padding: 0;
    font-weight: 700;
  }
</style>
