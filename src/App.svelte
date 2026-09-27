<script lang="ts">
  import { STEPS } from './config/steps'
  import { exportPixelSize } from './core/canvas'
  import { completeStep, flow, project } from './core/store.svelte'
  import CompositionPanel from './layers/1-composition/Panel.svelte'
  import { computeComposition } from './layers/1-composition/compute'
  import { compositionTemplates } from './layers/1-composition/templates'
  import CanvasView from './renderer/CanvasView.svelte'
  import CanvasSettings from './ui/CanvasSettings.svelte'
  import FontLibrary from './ui/FontLibrary.svelte'
  import LayerList from './ui/LayerList.svelte'
  import Stepper from './ui/Stepper.svelte'

  let view: CanvasView

  const step = $derived(STEPS[flow.current])
  const composition = $derived.by(() => {
    const c = project.composition
    const t = compositionTemplates.find((x) => x.id === c.templateId)!
    return computeComposition(t, project.canvas, c.params[t.id], c.orientation)
  })

  function exportPng() {
    const { w } = exportPixelSize(project.canvas)
    const a = document.createElement('a')
    a.href = view.toPng(w)
    a.download = `design-${project.composition.templateId}.png`
    a.click()
  }
</script>

<div class="app">
  <header>
    <strong class="brand">GraphicDesigner</strong>
    <Stepper />
    <button class="primary" onclick={exportPng}>匯出 PNG</button>
  </header>

  <aside>
    <section>
      <h3>畫布</h3>
      <CanvasSettings bind:canvas={project.canvas} />
    </section>

    {#if step.id === 'composition'}
      <CompositionPanel />
    {:else if step.id === 'objects'}
      <section>
        <h3>字型庫</h3>
        <p class="muted">文字物件開發中，可先瀏覽字型。</p>
        <FontLibrary />
      </section>
    {:else}
      <section>
        <h3>{step.label}</h3>
        <p class="muted">這一步還在開發中（見 PLAN.md 的里程碑）。</p>
      </section>
    {/if}

    <section>
      <h3>圖層</h3>
      <LayerList />
    </section>

    {#if flow.current < STEPS.length - 1}
      <button class="primary next" onclick={completeStep}>
        完成「{step.label}」→ 下一步
      </button>
    {/if}
  </aside>

  <main>
    <CanvasView
      bind:this={view}
      canvas={project.canvas}
      {composition}
      showComposition={project.visibility.composition}
      showAnchors={project.visibility.anchors}
    />
  </main>
</div>

<style>
  .app {
    height: 100vh;
    display: grid;
    grid-template-rows: auto 1fr;
    grid-template-columns: 300px 1fr;
    grid-template-areas: 'header header' 'aside main';
  }
  header {
    grid-area: header;
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--line);
    background: var(--panel);
  }
  header .primary {
    margin-left: auto;
  }
  .brand {
    font-size: 15px;
  }
  aside {
    grid-area: aside;
    overflow-y: auto;
    border-right: 1px solid var(--line);
    background: var(--panel);
    padding: 4px 16px 24px;
  }
  main {
    grid-area: main;
    position: relative;
    background: var(--bg);
    overflow: hidden;
  }
  .next {
    width: 100%;
    margin-top: 16px;
  }
  .muted {
    color: var(--muted);
    font-size: 13px;
  }
  @media (max-width: 720px) {
    .app {
      grid-template-columns: 1fr;
      grid-template-rows: auto 50vh 1fr;
      grid-template-areas: 'header' 'main' 'aside';
    }
  }
</style>
