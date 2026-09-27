<script lang="ts">
  import { onMount } from 'svelte'
  import { STEPS } from './config/steps'
  import theme from './config/theme.json'
  import { exportPixelSize } from './core/canvas'
  import { computeTemplate, handlesOf, pointParamFromCanvas, type Handle } from './core/compute'
  import type { Pt, Rect } from './core/geometry'
  import { collectSuggestions, roleOf, snapLinesFrom, toCanvasRect, toRelativeRect, type Suggestion } from './core/blocks'
  import { initHistory, redo, undo } from './core/history.svelte'
  import { downloadProject, initAutosave } from './core/persistence.svelte'
  import ProjectPanel from './ui/ProjectPanel.svelte'
  import {
    addBlock,
    completeStep,
    duplicateBlock,
    duplicateObject,
    flow,
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
  import ObjectsPanel, { type AnchorOption } from './layers/4-objects/Panel.svelte'
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
    onSelect: (id: string | null) => (ui.selectedObject = id),
    onChange: (id: string, b: ObjectBox) => {
      const c = project.canvas
      updateObject(id, { x: b.x / c.w, y: b.y / c.h, w: b.w / c.w, h: b.h / c.h, rotation: Math.round(b.rotation * 10) / 10 })
      const o = project.objects.items.find((x) => x.uid === id)
      if (o && b.fontScale && b.fontScale !== 1) o.props.fontSize = (o.props.fontSize as number) * b.fontScale
    },
    onEdit: (id: string) => {
      ui.selectedObject = id
      if (project.objects.items.find((o) => o.uid === id)?.type === 'text') focusText++
    },
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
    } else if (mod && key === 's') {
      e.preventDefault()
      downloadProject()
    } else if (mod && key === ';') {
      // 像繪圖軟體一樣：一鍵切換所有輔助線
      e.preventDefault()
      const v = project.visibility
      const show = !(v.composition || v.guides || v.anchors)
      v.composition = v.guides = v.anchors = show
    } else {
      // 區塊與物件共用的快捷鍵：刪除、複製、方向鍵微調、取消選取
      const target =
        step.id === 'blocks' && ui.selectedBlock
          ? {
              item: project.blocks.items.find((x) => x.uid === ui.selectedBlock),
              remove: removeBlock,
              duplicate: duplicateBlock,
              update: updateBlock,
              deselect: () => (ui.selectedBlock = null),
            }
          : step.id === 'objects' && ui.selectedObject
            ? {
                item: project.objects.items.find((x) => x.uid === ui.selectedObject),
                remove: removeObject,
                duplicate: duplicateObject,
                update: updateObject,
                deselect: () => (ui.selectedObject = null),
              }
            : null
      const item = target?.item
      if (!target || !item) return
      if (key === 'delete' || key === 'backspace') {
        e.preventDefault()
        target.remove(item.uid)
      } else if (mod && key === 'd') {
        e.preventDefault()
        target.duplicate(item.uid)
      } else if (key.startsWith('arrow')) {
        // 方向鍵微調：每次 1 單位，按住 Shift 為 10 單位
        e.preventDefault()
        const d = e.shiftKey ? 10 : 1
        const dx = key === 'arrowleft' ? -d : key === 'arrowright' ? d : 0
        const dy = key === 'arrowup' ? -d : key === 'arrowdown' ? d : 0
        target.update(item.uid, { x: item.x + dx / project.canvas.w, y: item.y + dy / project.canvas.h })
      } else if (key === 'escape') {
        target.deselect()
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
    <strong class="brand">GraphicDesigner</strong>
    <Stepper />
    <div class="right">
      <ProjectMenu />
      <button class="primary" onclick={exportPng}>匯出 PNG</button>
    </div>
  </header>

  <aside>
    <ProjectPanel bind:this={projectPanel} />

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
      <ObjectsPanel anchors={anchorOptions} {focusText} />
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
      snapLines={step.id === 'objects' ? objectSnapLines : snapLines}
      {blockEvents}
      objects={project.objects.items}
      selectedObject={ui.selectedObject}
      objectsInteractive={step.id === 'objects'}
      objectsVisible={project.visibility.objects}
      background={project.background}
      fontVersion={fontVersion + imageStoreTick}
      {objectEvents}
      guidesOnTop={project.visibility.guidesOnTop}
      guideOpacity={project.visibility.guideOpacity}
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
