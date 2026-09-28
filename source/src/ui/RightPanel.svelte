<script lang="ts">
  // 右側面板：跨步驟的設定（檢視、圖層與排序、匯出、介面主題）。專案檔與畫布在頂部的「專案」視窗。
  // 可收合成一排圖示，讓畫布變寬。
  import type { Renderer } from '../core/exporter'
  import ExportPanel from './ExportPanel.svelte'
  import LayerList from './LayerList.svelte'
  import PaletteSection from './PaletteSection.svelte'
  import Section from './Section.svelte'
  import Accordion from './Accordion.svelte'
  import { setOpen } from './accordionState.svelte'
  import ThemeSwitcher from './ThemeSwitcher.svelte'
  import ViewSettings from './ViewSettings.svelte'

  interface Props {
    render: Renderer
    collapsed: boolean
    ontoggle: () => void
  }
  let { render, collapsed, ontoggle }: Props = $props()

  const RAIL = [
    { id: 'right-view', icon: '視', label: '檢視' },
    { id: 'right-palette', icon: '配', label: '配色' },
    { id: 'right-layers', icon: '層', label: '圖層與排序' },
    { id: 'right-export', icon: '出', label: '匯出' },
    { id: 'right-theme', icon: '色', label: '介面主題' },
  ]

  const mod = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+'

  function openSection(id: string) {
    setOpen('right', id)
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
    <Accordion name="right">
    <div id="right-view">
      <Section id="right-view" title="檢視" help="{mod}; 一鍵切換全部輔助線。輔助線可以放在物件上層（方便對位）或下層（接近成品）。">
        <ViewSettings />
      </Section>
    </div>
    <div id="right-palette">
      <Section id="right-palette" title="配色" help="選一組配色後，新物件會自動使用這組顏色，文字會依底色自動選深或淺；也可以一鍵替整個設計上色。">
        <PaletteSection />
      </Section>
    </div>
    <div id="right-layers">
      <Section id="right-layers" title="圖層與排序" help="清單上方＝最上層。點名稱會選取並切到該步驟；↑↓ 調整上下順序。">
        <LayerList />
      </Section>
    </div>
    <div id="right-export">
      <Section id="right-export" title="匯出" help="只輸出作品本身（背景與物件），不含輔助線與區塊。印刷品建議 300 dpi 並加 3mm 出血。">
        <ExportPanel {render} />
      </Section>
    </div>
    <div id="right-theme"><Section id="right-theme" title="介面主題" defaultOpen={false}><ThemeSwitcher /></Section></div>
    </Accordion>
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
