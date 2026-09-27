<script lang="ts">
  import { onMount } from 'svelte'
  import { STEPS } from './config/steps'
  import theme from './config/theme.json'
  import { exportPixelSize } from './core/canvas'
  import { computeTemplate, handlesOf, pointParamFromCanvas, type Handle } from './core/compute'
  import type { Pt } from './core/geometry'
  import { initHistory, redo, undo } from './core/history.svelte'
  import { initAutosave } from './core/persistence.svelte'
  import { completeStep, flow, project, ui } from './core/store.svelte'
  import CompositionPanel from './layers/1-composition/Panel.svelte'
  import { compositionTemplates } from './layers/1-composition/templates'
  import GuidesPanel from './layers/2-guides/Panel.svelte'
  import { guideTemplates } from './layers/2-guides/templates'
  import CanvasView, { type GuideLayerView } from './renderer/CanvasView.svelte'
  import CanvasSettings from './ui/CanvasSettings.svelte'
  import FontLibrary from './ui/FontLibrary.svelte'
  import LayerList from './ui/LayerList.svelte'
  import ProjectMenu from './ui/ProjectMenu.svelte'
  import Stepper from './ui/Stepper.svelte'

  let view: CanvasView

  onMount(() => {
    // 先讀回暫存，再開始記錄復原歷史
    const stopAutosave = initAutosave()
    const stopHistory = initHistory()
    return () => {
      stopAutosave()
      stopHistory()
    }
  })

  const step = $derived(STEPS[flow.current])

  const composition = $derived.by(() => {
    const c = project.composition
    const t = compositionTemplates.find((x) => x.id === c.templateId)!
    return computeTemplate(t, project.canvas, c.params[t.id], c.orientation)
  })

  const layers = $derived.by((): GuideLayerView[] => [
    {
      id: 'composition',
      output: composition,
      style: theme.guides.composition,
      visible: project.visibility.composition,
      anchorsVisible: project.visibility.anchors,
    },
    ...project.guides.items.map((g) => ({
      id: `guide:${g.uid}`,
      output: computeTemplate(guideTemplates.find((t) => t.id === g.templateId)!, project.canvas, g.params, g.orientation),
      style: theme.guides.visual,
      visible: project.visibility.guides && g.visible,
      anchorsVisible: project.visibility.anchors,
    })),
  ])

  // 只有在「視覺引導」步驟、且選取的引導有位置參數時，才顯示可拖曳的控制點
  const editing = $derived.by(() => {
    if (step.id !== 'guides') return null
    const g = project.guides.items.find((x) => x.uid === ui.selectedGuide)
    const t = g && guideTemplates.find((x) => x.id === g.templateId)
    return g && t && g.visible && project.visibility.guides ? { g, t } : null
  })

  const handles = $derived.by((): Handle[] =>
    editing ? handlesOf(editing.t, project.canvas, editing.g.params, editing.g.orientation) : [],
  )

  const snapTargets = $derived.by((): Pt[] => [
    ...(project.visibility.composition ? composition.anchors : []),
    { x: project.canvas.w / 2, y: project.canvas.h / 2 },
  ])

  function onHandleMove(key: string, p: Pt) {
    if (!editing) return
    editing.g.params[key] = pointParamFromCanvas(editing.t, key, p, project.canvas, editing.g.orientation)
  }

  function exportPng() {
    const { w } = exportPixelSize(project.canvas)
    const a = document.createElement('a')
    a.href = view.toPng(w)
    a.download = `design-${project.composition.templateId}.png`
    a.click()
  }

  function onKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement
    if (target.matches('input[type="text"], input[type="number"], input:not([type]), textarea, select')) return
    if (!(e.metaKey || e.ctrlKey)) return
    const key = e.key.toLowerCase()
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault()
      undo()
    } else if ((key === 'z' && e.shiftKey) || key === 'y') {
      e.preventDefault()
      redo()
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="app">
  <header>
    <strong class="brand">GraphicDesigner</strong>
    <Stepper />
    <div class="right">
      <ProjectMenu />
      <button class="primary" onclick={exportPng}>匯出 PNG</button>
    </div>
  </header>

  <aside>
    <section>
      <h3>畫布</h3>
      <CanvasSettings bind:canvas={project.canvas} />
    </section>

    {#if step.id === 'composition'}
      <CompositionPanel />
    {:else if step.id === 'guides'}
      <GuidesPanel />
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
      {layers}
      {handles}
      {snapTargets}
      onhandlemove={onHandleMove}
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
    flex-wrap: wrap;
  }
  .right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
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
