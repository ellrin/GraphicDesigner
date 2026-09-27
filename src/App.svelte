<script lang="ts">
  import { onMount } from 'svelte'
  import { STEPS } from './config/steps'
  import theme from './config/theme.json'
  import exportConfig from './config/export.json'
  import { exportPng, type Renderer } from './core/exporter'
  import type { Handle } from './core/compute'
  import { computeInstance, instanceHandles, instancePointFromCanvas, resolveFrame, type TemplateInstance } from './core/instances'
  import type { Template } from './core/registry'
  import type { GuideOutput, Pt, Rect } from './core/geometry'
  import { collectSuggestions, roleOf, snapLinesFrom, toCanvasRect, toRelativeRect, type Suggestion } from './core/blocks'
  import { initHistory, redo, undo } from './core/history.svelte'
  import { downloadProject, initAutosave } from './core/persistence.svelte'
  import ProjectPanel from './ui/ProjectPanel.svelte'
  import ThemeSwitcher from './ui/ThemeSwitcher.svelte'
  import { uiTheme } from './ui/theme.svelte'
  import {
    addBlock,
    completeStep,
    duplicateBlock,
    duplicateObject,
    flow,
    selectObject,
    updateObjects,
    project,
    removeBlock,
    removeObject,
    ui,
    updateBlock,
    updateObject,
  } from './core/store.svelte'
  import { loadStoredAssets } from './core/assets'
  import { FONT_GROUPS, loadFont } from './core/fonts'
  import BlocksPanel from './layers/3-blocks/Panel.svelte'
  import RefinePanel from './layers/5-refine/Panel.svelte'
  import ObjectsPanel from './layers/4-objects/Panel.svelte'
  import type { AnchorOption } from './core/objects'
  import type { ObjectBox } from './renderer/objectLayer'
  import ViewToolbar from './ui/ViewToolbar.svelte'
  import CompositionPanel from './layers/1-composition/Panel.svelte'
  import { compositionTemplates } from './layers/1-composition/templates'
  import GuidesPanel from './layers/2-guides/Panel.svelte'
  import { guideTemplates } from './layers/2-guides/templates'
  import CanvasView, { type GuideLayerView } from './renderer/CanvasView.svelte'
  import CanvasSettings from './ui/CanvasSettings.svelte'
  import LayerList from './ui/LayerList.svelte'
  import ProjectMenu from './ui/ProjectMenu.svelte'
  import Stepper from './ui/Stepper.svelte'

  let view: CanvasView
  let projectPanel: ProjectPanel

  onMount(() => {
    // 先讀回暫存，再開始記錄復原歷史；圖片另外從 IndexedDB 讀回
    const stopAutosave = initAutosave()
    const stopHistory = initHistory()
    loadStoredAssets().then(() => imageStoreTick++)
    return () => {
      stopAutosave()
      stopHistory()
    }
  })

  /** 圖片庫讀回後遞增，讓畫布重新嘗試載入圖片 */
  let imageStoreTick = $state(0)

  const step = $derived(STEPS[flow.current])

  type Computed = { inst: TemplateInstance; t: Template; frame: Rect; name: string; output: GuideOutput }

  /**
   * 計算一組版型實例（構圖或視覺引導）在畫布上的結果。
   * 依清單順序計算，所以實例可以套用在「前面的實例」切出的區域上，並跟著它變動。
   */
  function computeAll(items: TemplateInstance[], templates: Template[], earlier: Computed[] = []) {
    const done: Computed[] = [...earlier]
    const lookup = (source: string, region: string) =>
      done.find((c) => c.inst.uid === source)?.output.regions?.find((r) => r.label === region)
    const out: Computed[] = []
    for (const inst of items) {
      const t = templates.find((x) => x.id === inst.templateId)
      if (!t) continue
      const frame = resolveFrame(inst.frame, project.canvas, project.blocks.items, lookup)
      const c = { inst, t, frame, name: t.meta.name, output: computeInstance(t, inst, frame, inst.frame.kind === 'canvas') }
      done.push(c)
      out.push(c)
    }
    return out
  }

  const compOutputs = $derived(computeAll(project.compositions.items, compositionTemplates))
  const guideOutputs = $derived(computeAll(project.guides.items, guideTemplates, compOutputs))

  const layers = $derived.by((): GuideLayerView[] => [
    ...compOutputs.map(({ inst, output }) => ({
      id: `comp:${inst.uid}`,
      output,
      style: theme.guides.composition,
      visible: project.visibility.composition && inst.visible,
      anchorsVisible: project.visibility.anchors,
    })),
    ...guideOutputs.map(({ inst, output }) => ({
      id: `guide:${inst.uid}`,
      output,
      style: theme.guides.visual,
      visible: project.visibility.guides && inst.visible,
      anchorsVisible: project.visibility.anchors,
    })),
  ])

  // ── 第三層：區塊 ──────────────────────────────────
  /** 目前顯示中的構圖與引導（吸附與建議只看得到的線） */
  const activeOutputs = $derived([
    ...(project.visibility.composition ? compOutputs.filter(({ inst }) => inst.visible) : []),
    ...(project.visibility.guides ? guideOutputs.filter(({ inst }) => inst.visible) : []),
  ])

  /** 各構圖與引導切出的區域，可作為其他構圖的「套用範圍」 */
  const regionOptions = $derived(
    [...compOutputs, ...guideOutputs].flatMap(({ inst, name, output }) =>
      (output.regions ?? []).map((r) => ({
        label: `${name}・${r.label}`,
        rect: toRelativeRect(r, project.canvas),
        source: inst.uid,
        region: r.label,
      })),
    ),
  )

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

  // ── 第四層：物件 ──────────────────────────────────
  /** 物件可吸附：構圖、引導的線與錨點，再加上各區塊的邊與中線 */
  const objectSnapLines = $derived.by(() => {
    const xs = [...snapLines.xs]
    const ys = [...snapLines.ys]
    for (const b of project.blocks.items) {
      if (!b.visible) continue
      const r = toCanvasRect(b, project.canvas)
      xs.push(r.x, r.x + r.w / 2, r.x + r.w)
      ys.push(r.y, r.y + r.h / 2, r.y + r.h)
    }
    return { xs, ys }
  })

  /** 可作為放置目標的錨點（依來源命名、去除重複） */
  const anchorOptions = $derived.by((): AnchorOption[] => {
    const out: AnchorOption[] = []
    for (const { name, output } of activeOutputs) {
      output.anchors.forEach((a, i) => {
        const x = a.x / project.canvas.w
        const y = a.y / project.canvas.h
        if (out.some((o) => Math.abs(o.x - x) < 1e-3 && Math.abs(o.y - y) < 1e-3)) return
        out.push({ label: `${name}・${a.label ?? `錨點 ${i + 1}`}`, x, y })
      })
    }
    return out
  })

  // 文字用到的字型：載入完成後重繪畫布
  let fontVersion = $state(0)
  const requestedFonts = new Set<string>()
  $effect(() => {
    for (const o of project.objects.items) {
      if (o.type !== 'text') continue
      const family = String(o.props.fontFamily)
      if (requestedFonts.has(family)) continue
      const def = FONT_GROUPS.flatMap((g) => g.fonts).find((f) => f.family === family)
      if (!def) continue
      requestedFonts.add(family)
      loadFont(def)
        .then(() => fontVersion++)
        .catch(() => requestedFonts.delete(family))
    }
  })

  let focusText = $state(0)

  const objectEvents = {
    onSelect: (id: string | null, additive: boolean) => selectObject(id, additive),
    onSelectMany: (ids: string[], additive: boolean) => {
      ui.selectedObjects = additive ? [...new Set([...ui.selectedObjects, ...ids])] : ids
    },
    onChange: (id: string, b: ObjectBox) => {
      const c = project.canvas
      updateObject(id, { x: b.x / c.w, y: b.y / c.h, w: b.w / c.w, h: b.h / c.h, rotation: Math.round(b.rotation * 10) / 10 })
      const o = project.objects.items.find((x) => x.uid === id)
      if (o && b.fontScale && b.fontScale !== 1) o.props.fontSize = (o.props.fontSize as number) * b.fontScale
    },
    onEdit: (id: string) => {
      ui.selectedObjects = [id]
      if (project.objects.items.find((o) => o.uid === id)?.type === 'text') focusText++
    },
  }

  // 控制點：第一步編輯選取的構圖、第二步編輯選取的視覺引導（有位置參數時才會出現）
  const editing = $derived.by(() => {
    const list =
      step.id === 'composition' && project.visibility.composition
        ? { outputs: compOutputs, id: ui.selectedComposition }
        : step.id === 'guides' && project.visibility.guides
          ? { outputs: guideOutputs, id: ui.selectedGuide }
          : null
    const hit = list?.outputs.find((o) => o.inst.uid === list.id)
    return hit && hit.inst.visible ? hit : null
  })

  const handles = $derived.by((): Handle[] => (editing ? instanceHandles(editing.t, editing.inst, editing.frame) : []))

  const snapTargets = $derived.by((): Pt[] => [
    ...activeOutputs.filter((o) => o.inst !== editing?.inst).flatMap((o) => o.output.anchors),
    { x: project.canvas.w / 2, y: project.canvas.h / 2 },
  ])

  function onHandleMove(key: string, p: Pt) {
    if (!editing) return
    editing.inst.params[key] = instancePointFromCanvas(editing.t, editing.inst, key, p, editing.frame)
  }

  /** 第四、五步都可以編輯物件 */
  const editingObjects = $derived(step.id === 'objects' || step.id === 'refine')

  const render: Renderer = (o) => view.renderImage(o)
  const exportName = () => `design-${new Date().toISOString().slice(0, 10)}`

  function quickExportPng() {
    exportPng(render, project.canvas, { dpi: exportConfig.printDpi, scale: 1 }, exportName())
  }

  /** 方向鍵微調：每次 1 單位（按住 Shift 為 10 單位），回傳 0–1 相對位移 */
  function nudge(key: string, shift: boolean): [number, number] {
    const d = shift ? 10 : 1
    const dx = key === 'arrowleft' ? -d : key === 'arrowright' ? d : 0
    const dy = key === 'arrowup' ? -d : key === 'arrowdown' ? d : 0
    return [dx / project.canvas.w, dy / project.canvas.h]
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
    } else if (mod && key === 's') {
      e.preventDefault()
      downloadProject()
    } else if (mod && key === ';') {
      // 像繪圖軟體一樣：一鍵切換所有輔助線
      e.preventDefault()
      const v = project.visibility
      const show = !(v.composition || v.guides || v.anchors)
      v.composition = v.guides = v.anchors = show
    } else if (editingObjects && mod && key === 'a') {
      e.preventDefault()
      ui.selectedObjects = project.objects.items.filter((o) => o.visible).map((o) => o.uid)
    } else if (editingObjects && ui.selectedObjects.length) {
      // 物件（可多選）：刪除、複製、方向鍵微調、取消選取
      const ids = ui.selectedObjects
      if (key === 'delete' || key === 'backspace') {
        e.preventDefault()
        removeObject(ids)
      } else if (mod && key === 'd') {
        e.preventDefault()
        duplicateObject(ids)
      } else if (key.startsWith('arrow')) {
        e.preventDefault()
        const [dx, dy] = nudge(key, e.shiftKey)
        const patches = new Map(
          project.objects.items.filter((o) => ids.includes(o.uid)).map((o) => [o.uid, { x: o.x + dx, y: o.y + dy }]),
        )
        updateObjects(patches)
      } else if (key === 'escape') {
        ui.selectedObjects = []
      }
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
        e.preventDefault()
        const [dx, dy] = nudge(key, e.shiftKey)
        updateBlock(b.uid, { x: b.x + dx, y: b.y + dy })
      } else if (key === 'escape') {
        ui.selectedBlock = null
      }
    }
  }
</script>

<svelte:window
  onkeydown={onKeydown}
  ondragover={(e) => e.preventDefault()}
  ondrop={(e) => {
    // 檔案拖到頁面任何地方：.json 當作專案檔開啟；其他檔案忽略（避免瀏覽器離開頁面）
    e.preventDefault()
    const file = e.dataTransfer?.files?.[0]
    if (file && /\.json$/i.test(file.name)) projectPanel.open(file)
  }}
/>

<div class="app">
  <header>
    <div class="brand">
      <strong>GRAPHIC<span class="slash">/</span>DESIGNER</strong>
      <small>構圖設計工作台</small>
    </div>
    <Stepper />
    <div class="right">
      <ThemeSwitcher />
      <ProjectMenu />
      <button class="primary" onclick={quickExportPng}>匯出 PNG</button>
    </div>
  </header>

  <aside>
    <ProjectPanel bind:this={projectPanel} />

    <section>
      <h3>畫布</h3>
      <CanvasSettings />
    </section>

    {#if step.id === 'composition'}
      <CompositionPanel regions={regionOptions} />
    {:else if step.id === 'guides'}
      <GuidesPanel regions={regionOptions} />
    {:else if step.id === 'blocks'}
      <BlocksPanel {suggestions} onadopt={adopt} />
    {:else if step.id === 'objects'}
      <ObjectsPanel anchors={anchorOptions} {focusText} />
    {:else if step.id === 'refine'}
      <RefinePanel anchors={anchorOptions} {render} />
    {/if}

    <section>
      <h3>圖層</h3>
      <LayerList />
    </section>

    {#if flow.current < STEPS.length - 1}
      <div class="next-bar">
        <button class="primary next" onclick={completeStep}>
          完成「{step.label}」<span>→ {STEPS[flow.current + 1].label}</span>
        </button>
      </div>
    {/if}
  </aside>

  <main>
    <ViewToolbar showSuggestionsToggle={step.id === 'blocks'} />
    <div class="caption" aria-hidden="true">
      <span class="step">{String(flow.current + 1).padStart(2, '0')} / {step.label}</span>
      <span>{project.canvas.w} × {project.canvas.h} {project.canvas.unit}</span>
    </div>
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
      snapLines={editingObjects ? objectSnapLines : snapLines}
      {blockEvents}
      objects={project.objects.items}
      selectedObjects={ui.selectedObjects}
      objectsInteractive={editingObjects}
      objectsVisible={project.visibility.objects}
      background={project.background}
      fontVersion={fontVersion + imageStoreTick}
      {objectEvents}
      guidesOnTop={project.visibility.guidesOnTop}
      guideOpacity={project.visibility.guideOpacity}
      uiThemeId={uiTheme.id}
    />
  </main>
</div>

<style>
  .app {
    height: 100vh;
    display: grid;
    grid-template-rows: auto 1fr;
    grid-template-columns: 340px 1fr;
    grid-template-areas: 'header header' 'aside main';
  }
  header {
    grid-area: header;
    display: flex;
    align-items: stretch;
    gap: 24px;
    padding: 0 18px;
    min-height: 60px;
    border-bottom: 1px solid var(--line);
    background: var(--panel);
    flex-wrap: wrap;
  }
  .brand {
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding-right: 24px;
    border-right: 1px solid var(--line);
  }
  .brand strong {
    font-size: 17px;
    font-weight: 900;
    letter-spacing: 0.08em;
    line-height: 1.1;
  }
  .brand .slash {
    color: var(--accent);
    margin: 0 2px;
    text-shadow: 0 0 12px var(--accent);
  }
  .brand small {
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.2em;
    color: var(--muted);
  }
  .right {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  aside {
    grid-area: aside;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    border-right: 1px solid var(--line);
    background: var(--panel);
    padding: 0 20px;
    counter-reset: section;
  }
  main {
    grid-area: main;
    position: relative;
    overflow: hidden;
    background-color: var(--bg);
    background-image: radial-gradient(var(--canvas-dot) 1px, transparent 1.2px);
    background-size: 22px 22px;
  }
  .caption {
    position: absolute;
    left: 18px;
    bottom: 14px;
    display: flex;
    gap: 18px;
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    color: var(--muted);
    pointer-events: none;
    z-index: 1;
  }
  .caption .step {
    color: var(--highlight);
  }
  .next-bar {
    position: sticky;
    bottom: 0;
    margin: 24px -20px 0;
    padding: 14px 20px 18px;
    background: linear-gradient(transparent, var(--panel) 30%);
    margin-top: auto;
  }
  .next {
    width: 100%;
    font-size: 15px;
    padding: 11px 16px;
  }
  .next span {
    font-weight: 500;
    opacity: 0.75;
    margin-left: 6px;
  }
  @media (max-width: 720px) {
    .app {
      grid-template-columns: 1fr;
      grid-template-rows: auto 50vh 1fr;
      grid-template-areas: 'header' 'main' 'aside';
    }
  }
</style>
