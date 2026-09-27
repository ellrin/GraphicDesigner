<script lang="ts">
  import { onMount } from 'svelte'
  import { STEPS } from './config/steps'
  import theme from './config/theme.json'
  import { exportPixelSize } from './core/canvas'
  import { computeTemplate, handlesOf, pointParamFromCanvas, type Handle } from './core/compute'
  import type { Pt, Rect } from './core/geometry'
  import { collectSuggestions, roleOf, snapLinesFrom, toCanvasRect, toRelativeRect, type Suggestion } from './core/blocks'
  import { initHistory, redo, undo } from './core/history.svelte'
  import { initAutosave } from './core/persistence.svelte'
  import {
    addBlock,
    completeStep,
    duplicateBlock,
    flow,
    project,
    removeBlock,
    ui,
    updateBlock,
  } from './core/store.svelte'
  import BlocksPanel from './layers/3-blocks/Panel.svelte'
  import ViewToolbar from './ui/ViewToolbar.svelte'
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

  const guideOutputs = $derived(
    project.guides.items.map((g) => {
      const t = guideTemplates.find((x) => x.id === g.templateId)!
      return { g, name: t.meta.name, output: computeTemplate(t, project.canvas, g.params, g.orientation) }
    }),
  )

  const layers = $derived.by((): GuideLayerView[] => [
    {
      id: 'composition',
      output: composition,
      style: theme.guides.composition,
      visible: project.visibility.composition,
      anchorsVisible: project.visibility.anchors,
    },
    ...guideOutputs.map(({ g, output }) => ({
      id: `guide:${g.uid}`,
      output,
      style: theme.guides.visual,
      visible: project.visibility.guides && g.visible,
      anchorsVisible: project.visibility.anchors,
    })),
  ])

  // ── 第三層：區塊 ──────────────────────────────────
  /** 目前顯示中的構圖與引導（吸附與建議只看得到的線） */
  const activeOutputs = $derived([
    ...(project.visibility.composition
      ? [{ name: compositionTemplates.find((t) => t.id === project.composition.templateId)!.meta.name, output: composition }]
      : []),
    ...(project.visibility.guides ? guideOutputs.filter(({ g }) => g.visible) : []),
  ])

  const snapLines = $derived(snapLinesFrom(activeOutputs.map((o) => o.output), project.canvas))
  const suggestions = $derived(collectSuggestions(activeOutputs, project.canvas))

  const blockViews = $derived(
    project.blocks.items.map((b) => ({
      uid: b.uid,
      rect: toCanvasRect(b, project.canvas),
      label: b.name,
      color: b.color,
      filled: b.filled,
      opacity: b.opacity,
      visible: b.visible,
    })),
  )

  // 建議區塊的畫布預覽：預設只顯示滑鼠指到的那一個，勾選「顯示全部」才全部顯示
  const ghosts = $derived.by(() => {
    if (step.id !== 'blocks' || !project.visibility.blocks) return []
    const hovered = ui.hoverSuggestion !== null ? suggestions[ui.hoverSuggestion] : undefined
    const shown = project.visibility.suggestions ? suggestions : hovered ? [hovered] : []
    return shown.map((s) => ({ rect: s, label: s.label, color: roleOf(s.role ?? 'other').color, index: suggestions.indexOf(s) }))
  })

  function adopt(s: Suggestion) {
    ui.hoverSuggestion = null
    addBlock(toRelativeRect(s, project.canvas), s.role ?? 'other', s.label)
  }

  const blockEvents = {
    onSelect: (id: string | null) => (ui.selectedBlock = id),
    onChange: (id: string, r: Rect) => updateBlock(id, toRelativeRect(r, project.canvas)),
    onCreate: (r: Rect) => addBlock(toRelativeRect(r, project.canvas)),
    onAdopt: (i: number) => adopt(suggestions[ghosts[i].index]),
  }

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
    const mod = e.metaKey || e.ctrlKey
    const key = e.key.toLowerCase()

    if (mod && key === 'z' && !e.shiftKey) {
      e.preventDefault()
      undo()
    } else if (mod && ((key === 'z' && e.shiftKey) || key === 'y')) {
      e.preventDefault()
      redo()
    } else if (mod && key === ';') {
      // 像繪圖軟體一樣：一鍵切換所有輔助線
      e.preventDefault()
      const v = project.visibility
      const show = !(v.composition || v.guides || v.anchors)
      v.composition = v.guides = v.anchors = show
    } else if (step.id === 'blocks' && ui.selectedBlock) {
      const b = project.blocks.items.find((x) => x.uid === ui.selectedBlock)
      if (!b) return
      if (key === 'delete' || key === 'backspace') {
        e.preventDefault()
        removeBlock(b.uid)
      } else if (mod && key === 'd') {
        e.preventDefault()
        duplicateBlock(b.uid)
      } else if (key.startsWith('arrow')) {
        // 方向鍵微調：每次 1 單位，按住 Shift 為 10 單位
        e.preventDefault()
        const d = e.shiftKey ? 10 : 1
        const dx = key === 'arrowleft' ? -d : key === 'arrowright' ? d : 0
        const dy = key === 'arrowup' ? -d : key === 'arrowdown' ? d : 0
        updateBlock(b.uid, { x: b.x + dx / project.canvas.w, y: b.y + dy / project.canvas.h })
      } else if (key === 'escape') {
        ui.selectedBlock = null
      }
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
    {:else if step.id === 'blocks'}
      <BlocksPanel {suggestions} onadopt={adopt} />
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
    <ViewToolbar showSuggestionsToggle={step.id === 'blocks'} />
    <CanvasView
      bind:this={view}
      canvas={project.canvas}
      {layers}
      {handles}
      {snapTargets}
      onhandlemove={onHandleMove}
      blocks={blockViews}
      selectedBlock={ui.selectedBlock}
      blocksInteractive={step.id === 'blocks'}
      blocksVisible={project.visibility.blocks}
      {ghosts}
      {snapLines}
      {blockEvents}
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
