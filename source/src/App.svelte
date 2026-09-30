<script lang="ts">
  import { onMount } from 'svelte'
  import { STEPS } from './config/steps'
  import theme from './config/theme.json'
  import type { Renderer } from './core/exporter'
  import type { Handle } from './core/compute'
  import { buildSnapGeometry, type SnapGeometry } from './core/snap'
  import { computeInstance, instanceHandles, instancePointFromCanvas, resolveFrame, type TemplateInstance } from './core/instances'
  import type { Template } from './core/registry'
  import type { GuideOutput, Pt, Rect } from './core/geometry'
  import {
    collectSuggestions,
    roleOf,
    snapLinesFrom,
    snapPointsFrom,
    toCanvasPoints,
    toCanvasRect,
    toRelativePoints,
    toRelativeRect,
    type BlockShape,
    type Suggestion,
  } from './core/blocks'
  import { initHistory, redo, undo } from './core/history.svelte'
  import { downloadProject, initAutosave, openProjectWithMessage, projectMessage, setThumbnailRenderer } from './core/persistence.svelte'
  import ProjectDialog, { type ProjectTab } from './ui/ProjectDialog.svelte'
  import { projects } from './core/projects.svelte'
  import RightPanel from './ui/RightPanel.svelte'
  import Accordion from './ui/Accordion.svelte'
  import ResetButton from './ui/ResetButton.svelte'
  import { uiTheme } from './ui/theme.svelte'
  import { paletteOf } from './core/palettes'
  import type { ParamValues } from './core/params'
  import {
    addObject,
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
  import { getImage, loadStoredAssets } from './core/assets'
  import { canvasBox, fitBoxToPoints, markSubject, objectBox, subjectOnCanvas, targetFromCanvas, toCanvas, type ImageSize } from './core/framing'
  import { TRIANGLE_VERTICES } from './layers/4-objects/types/triangle/shape'
  import { RECT_CORNERS } from './layers/4-objects/types/rect/shape'
  import { TRAPEZOID_CORNERS } from './layers/4-objects/types/trapezoid/shape'
  import { parseTable } from './core/dataTable'
  import { insertFromFile, insertFromText, kindName, replaceData } from './layers/4-objects/chart/insert'
  import type { ImageFit, ImageFraming } from './core/objects'
  import { FONT_GROUPS, loadFont } from './core/fonts'
  import BlocksPanel from './layers/3-blocks/Panel.svelte'
  import RefinePanel from './layers/5-refine/Panel.svelte'
  import ObjectsPanel from './layers/4-objects/Panel.svelte'
  import type { AnchorOption, DesignObject } from './core/objects'
  import type { ObjectBox } from './renderer/objectLayer'
  import CompositionPanel from './layers/1-composition/Panel.svelte'
  import { compositionTemplates } from './layers/1-composition/templates'
  import GuidesPanel from './layers/2-guides/Panel.svelte'
  import { guideTemplates } from './layers/2-guides/templates'
  import CanvasView, { type GuideLayerView } from './renderer/CanvasView.svelte'
  import ProjectMenu from './ui/ProjectMenu.svelte'
  import Stepper from './ui/Stepper.svelte'

  let view: CanvasView | undefined = $state()

  // 專案視窗：第一次使用（沒有暫存）時直接打開，先決定畫布與起點
  let projectOpen = $state(false)
  let projectTab = $state<ProjectTab>('new')
  function openProject(tab: ProjectTab) {
    projectTab = tab
    projectOpen = true
  }

  // 拖放開啟專案檔的結果：專案視窗沒開時，在畫面下方短暫顯示
  let toast = $state('')
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  function showToast(text: string) {
    toast = text
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => (toast = ''), 3000)
  }
  $effect(() => {
    const text = projectMessage.text
    if (!text || projectOpen) return
    showToast(text)
  })

  onMount(() => {
    // 「我的專案」縮圖：用畫布輸出一張小圖
    setThumbnailRenderer(() => view?.renderImage({ pixelWidth: 240, mime: 'image/jpeg', quality: 0.72 }))
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
  /** 這一步還沒有做任何事：底部按鈕顯示「略過」 */
  const stepEmpty = $derived(
    step.id === 'composition'
      ? !project.compositions.items.length
      : step.id === 'guides'
        ? !project.guides.items.length
        : step.id === 'blocks'
          ? !project.blocks.items.length
          : step.id === 'objects'
            ? !project.objects.items.length
            : false,
  )

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

  /** 區塊頂點可吸附：錨點、線的交點、其他多邊形區塊的頂點 */
  const snapPoints = $derived([
    ...snapPointsFrom(activeOutputs.map((o) => o.output)),
    ...project.blocks.items.flatMap((b) => (b.points ? toCanvasPoints(b.points, project.canvas) : [])),
  ])

  /** 區塊的吸附：線（含斜線與曲線）、錨點、交點、多邊形頂點 */
  const blockSnap = $derived(buildSnapGeometry(activeOutputs.map((o) => o.output), snapLines, snapPoints))

  const blockViews = $derived(
    project.blocks.items.map((b) => ({
      uid: b.uid,
      rect: toCanvasRect(b, project.canvas),
      shape: b.shape,
      points: b.points ? toCanvasPoints(b.points, project.canvas) : undefined,
      label: b.name,
      color: b.color,
      filled: b.filled,
      opacity: b.opacity,
      visible: b.visible,
      radius: b.radius,
    })),
  )

  // 建議區塊的畫布預覽：預設只顯示滑鼠指到的那一個，勾選「顯示全部」才全部顯示
  const ghosts = $derived.by(() => {
    if (step.id !== 'blocks' || !project.visibility.blocks) return []
    const hovered = ui.hoverSuggestion !== null ? suggestions[ui.hoverSuggestion] : undefined
    const shown = project.visibility.suggestions ? suggestions : hovered ? [hovered] : []
    return shown.map((s) => ({
      rect: s,
      shape: s.shape,
      points: s.points,
      label: s.label,
      color: roleOf(s.role ?? 'other').color,
      index: suggestions.indexOf(s),
    }))
  })

  function adopt(s: Suggestion) {
    ui.hoverSuggestion = null
    addBlock(toRelativeRect(s, project.canvas), s.role ?? 'other', s.label, {
      shape: s.shape,
      points: s.points ? toRelativePoints(s.points, project.canvas) : undefined,
    })
  }

  const blockEvents = {
    onSelect: (id: string | null) => (ui.selectedBlock = id),
    onChange: (id: string, r: Rect) => updateBlock(id, toRelativeRect(r, project.canvas)),
    onCreate: (r: Rect, geo: { shape: BlockShape; points?: Pt[] }) =>
      addBlock(toRelativeRect(r, project.canvas), 'subject', '', {
        shape: geo.shape,
        points: geo.points ? toRelativePoints(geo.points, project.canvas) : undefined,
      }),
    onPoints: (id: string, pts: Pt[]) => updateBlock(id, { points: toRelativePoints(pts, project.canvas) }),
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

  /** 物件的吸附：區塊的吸附再加上區塊的邊與中線 */
  const objectSnap = $derived({ ...blockSnap, ...objectSnapLines })

  /** 自動排版：構圖與引導切出的區域、視覺引導的動線（依順序） */
  const layoutContext = $derived({
    regions: activeOutputs.flatMap(({ output }) =>
      (output.regions ?? []).map((r) => ({
        rect: { x: r.x, y: r.y, w: r.w, h: r.h },
        shape: r.points ? ('polygon' as const) : r.shape === 'ellipse' ? ('ellipse' as const) : ('rect' as const),
        points: r.points,
        role: r.role,
        label: r.label,
      })),
    ),
    path: (project.visibility.guides ? guideOutputs.filter(({ inst }) => inst.visible) : []).flatMap(({ output }) => output.anchors),
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

  // 文字、圖表、表格用到的字型：載入完成後重繪畫布
  let fontVersion = $state(0)
  const requestedFonts = new Set<string>()
  $effect(() => {
    for (const o of project.objects.items) {
      if (o.type !== 'text' && o.type !== 'chart' && o.type !== 'table') continue
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

  // ── 圖片主體標記 ⊕（第四、五步）──────────────────────
  /** 用到的圖片原始尺寸（主體標記的位置需要） */
  let imageSizes = $state<Record<string, ImageSize>>({})
  $effect(() => {
    const ids = [project.background.assetId, ...project.objects.items.map((o) => o.props.assetId as string | undefined)]
    void imageStoreTick
    for (const id of ids) {
      if (!id || imageSizes[id]) continue
      getImage(id)?.then((img) => (imageSizes[id] = { w: img.naturalWidth, h: img.naturalHeight })).catch(() => {})
    }
  })

  /** 目前可調整主體的照片：單選的圖片物件，或開啟「調整背景主體」時的背景 */
  const framingTarget = $derived.by(() => {
    if (!(step.id === 'objects' || step.id === 'refine')) return null
    const c = project.canvas
    if (ui.editBackground && project.background.assetId) {
      const size = imageSizes[project.background.assetId]
      return size ? { key: 'bg', box: canvasBox(c), size, fit: project.background.fit, framing: project.background } : null
    }
    const o = ui.selectedObjects.length === 1 ? project.objects.items.find((x) => x.uid === ui.selectedObjects[0]) : undefined
    const size = o?.type === 'image' ? imageSizes[o.props.assetId as string] : undefined
    if (!o || !size) return null
    return { key: `img:${o.uid}`, box: objectBox(o, c), size, fit: o.props.fit as ImageFit, framing: o.props as unknown as ImageFraming, obj: o }
  })

  // ── 可拖曳頂點的物件（矩形、梯形、三角形、自由多邊形）──────
  /** 頂點存在固定參數名稱裡的物件 */
  const VERTEX_KEYS: Record<string, readonly string[]> = { triangle: TRIANGLE_VERTICES, rect: RECT_CORNERS, trapezoid: TRAPEZOID_CORNERS }
  /** 物件的頂點（物件框內 0–1）；不是這類物件時回傳 null */
  function verticesOf(o: DesignObject): Pt[] | null {
    const keys = VERTEX_KEYS[o.type]
    if (keys) return keys.map((k) => o.props[k] as Pt)
    if (o.type === 'freeform') return (o.props.points as unknown as Pt[] | undefined) ?? []
    return null
  }
  function setVertices(o: DesignObject, rel: Pt[]) {
    const keys = VERTEX_KEYS[o.type]
    if (keys) keys.forEach((k, i) => (o.props[k] = rel[i]))
    else o.props.points = rel as unknown as ParamValues[string]
  }
  /** 以畫布座標的頂點更新物件：物件框貼齊頂點 */
  function placeVertices(o: DesignObject, corners: Pt[]) {
    const { box, rel } = fitBoxToPoints(o.rotation, corners)
    const c = project.canvas
    updateObject(o.uid, { x: box.x / c.w, y: box.y / c.h, w: box.w / c.w, h: box.h / c.h })
    setVertices(o, rel)
  }

  /** 單選且可調頂點的物件 */
  const vertexTarget = $derived.by(() => {
    if (ui.drawPolygon || !(step.id === 'objects' || step.id === 'refine') || ui.selectedObjects.length !== 1) return null
    const o = project.objects.items.find((x) => x.uid === ui.selectedObjects[0])
    return o && o.visible && verticesOf(o) ? o : null
  })
  const cornersOf = (o: DesignObject) => (verticesOf(o) ?? []).map((q) => toCanvas(objectBox(o, project.canvas), q))

  // ── 畫自由多邊形：點畫布加頂點，點回第一點（或 Enter）完成，Esc 取消 ──
  function drawPoint(p: Pt) {
    const d = ui.drawPolygon
    if (!d) return
    const close = Math.min(project.canvas.w, project.canvas.h) * 0.02
    if (d.pts.length >= 3 && Math.hypot(p.x - d.pts[0].x, p.y - d.pts[0].y) <= close) return finishPolygon()
    d.pts.push(p)
    if (d.pts.length < 2) return
    const o = d.uid ? project.objects.items.find((x) => x.uid === d.uid) : undefined
    if (o) placeVertices(o, d.pts)
    else {
      const { box, rel } = fitBoxToPoints(0, d.pts)
      const c = project.canvas
      d.uid = addObject('freeform', { rect: { x: box.x / c.w, y: box.y / c.h, w: box.w / c.w, h: box.h / c.h } }, { points: rel as unknown as ParamValues[string] })
      ui.selectedObjects = []
    }
  }
  function finishPolygon() {
    const d = ui.drawPolygon
    if (!d) return
    ui.drawPolygon = null
    if (d.uid && d.pts.length < 3) removeObject(d.uid)
    else if (d.uid) ui.selectedObjects = [d.uid]
  }
  function cancelPolygon() {
    const d = ui.drawPolygon
    ui.drawPolygon = null
    if (d?.uid) removeObject(d.uid)
  }

  const handles = $derived.by((): Handle[] => {
    if (editing) return instanceHandles(editing.t, editing.inst, editing.frame)
    if (ui.drawPolygon) return ui.drawPolygon.pts.map((pos, i) => ({ key: `draw:${i}`, label: i === 0 && ui.drawPolygon!.pts.length >= 3 ? '點這裡完成' : `頂點 ${i + 1}`, pos }))
    if (vertexTarget) return cornersOf(vertexTarget).map((pos, i) => ({ key: `vtx:${i}`, label: `頂點 ${i + 1}`, pos }))
    const f = framingTarget
    if (!f || f.fit === 'stretch') return []
    return [{ key: f.key, label: '主體', pos: subjectOnCanvas(f.size, f.box, f.fit, f.framing) }]
  })

  /** 控制點的吸附：其他構圖與引導的錨點、交點與線（不含控制點自己所屬的版型） */
  const handleSnap = $derived.by((): SnapGeometry => {
    const others = activeOutputs.filter((o) => o.inst !== editing?.inst).map((o) => o.output)
    const center = { x: project.canvas.w / 2, y: project.canvas.h / 2 }
    return buildSnapGeometry(others, { xs: [], ys: [] }, [...snapPointsFrom(others), center])
  })

  function onHandleMove(key: string, p: Pt) {
    if (editing) {
      editing.inst.params[key] = instancePointFromCanvas(editing.t, editing.inst, key, p, editing.frame)
      return
    }
    // 拖曳頂點：物件框跟著頂點調整
    if (vertexTarget && key.startsWith('vtx:')) {
      const corners = cornersOf(vertexTarget)
      corners[Number(key.slice(4))] = p
      placeVertices(vertexTarget, corners)
      return
    }
    // 畫多邊形時拖曳已點的頂點
    if (ui.drawPolygon && key.startsWith('draw:')) {
      ui.drawPolygon.pts[Number(key.slice(5))] = p
      const o = ui.drawPolygon.uid ? project.objects.items.find((x) => x.uid === ui.drawPolygon!.uid) : undefined
      if (o) placeVertices(o, ui.drawPolygon.pts)
      return
    }
    // 拖曳主體標記：照片跟著移動，讓主體落在標記位置（會吸附到錨點）
    const f = framingTarget
    if (!f || f.key !== key) return
    const target = targetFromCanvas(f.box, p)
    if (f.obj) f.obj.props.target = target
    else project.background.target = target
  }

  /** 「點照片標記主體」模式：點一下的位置就是主體，照片不動 */
  function onPick(p: Pt) {
    if (ui.drawPolygon) return drawPoint(p)
    const id = ui.pickSubject
    ui.pickSubject = null
    const c = project.canvas
    if (id === 'bg') {
      const size = project.background.assetId ? imageSizes[project.background.assetId] : undefined
      if (!size) return
      Object.assign(project.background, markSubject(size, canvasBox(c), project.background.fit, project.background, p))
      ui.editBackground = true
      return
    }
    const o = project.objects.items.find((x) => x.uid === id)
    const size = o?.type === 'image' ? imageSizes[o.props.assetId as string] : undefined
    if (!o || !size) return
    const m = markSubject(size, objectBox(o, c), o.props.fit as ImageFit, o.props as unknown as ImageFraming, p)
    o.props.focus = m.focus
    o.props.target = m.target
  }

  /** 第四、五步都可以編輯物件 */
  const editingObjects = $derived(step.id === 'objects' || step.id === 'refine')

  const render: Renderer = (o) => view?.renderImage(o) ?? ''

  // 右側面板收合狀態（介面偏好，記在瀏覽器中）
  const RIGHT_KEY = 'graphic-designer:right-collapsed'
  let rightCollapsed = $state(readFlag(RIGHT_KEY))
  function readFlag(key: string) {
    try {
      return localStorage.getItem(key) === '1'
    } catch {
      return false
    }
  }
  function toggleRight() {
    rightCollapsed = !rightCollapsed
    try {
      localStorage.setItem(RIGHT_KEY, rightCollapsed ? '1' : '0')
    } catch {
      // 略過
    }
  }

  /** 方向鍵微調：每次 1 單位（按住 Shift 為 10 單位），回傳 0–1 相對位移 */
  function nudge(key: string, shift: boolean): [number, number] {
    const d = shift ? 10 : 1
    const dx = key === 'arrowleft' ? -d : key === 'arrowright' ? d : 0
    const dy = key === 'arrowup' ? -d : key === 'arrowdown' ? d : 0
    return [dx / project.canvas.w, dy / project.canvas.h]
  }

  // ── 圖表：貼上試算表範圍、拖放資料檔 ──────────────────
  const isTyping = (t: EventTarget | null) =>
    t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))

  /** 貼上：選取單一圖表／表格時取代它的資料；否則依資料建立新圖表 */
  function onPaste(e: ClipboardEvent) {
    if (!editingObjects || isTyping(e.target)) return
    const text = e.clipboardData?.getData('text/plain') ?? ''
    if (!text.trim()) return
    const sel = ui.selectedObjects.length === 1 ? project.objects.items.find((o) => o.uid === ui.selectedObjects[0]) : undefined
    if (sel && (sel.type === 'chart' || sel.type === 'table')) {
      const t = parseTable(text)
      if (t.columns.length) {
        e.preventDefault()
        showToast(replaceData(sel.uid, t))
      }
      return
    }
    const r = insertFromText(text, {})
    if (r) {
      e.preventDefault()
      showToast(`已從剪貼簿建立${kindName(r.kind)}：${r.reason}`)
    }
  }

  /** 檔案拖到頁面任何地方：專案檔就開啟；插入物件的步驟中，CSV／TSV／圖表 JSON 會建立圖表 */
  async function onDropFile(file: File) {
    const isJson = /\.json$/i.test(file.name)
    if (isJson) {
      let json: unknown = null
      try {
        json = JSON.parse(await file.text())
      } catch {
        // 交給專案檔的錯誤訊息
      }
      const isProject = !!json && typeof json === 'object' && !Array.isArray(json) && ['canvas', 'objects', 'compositions'].some((k) => k in json)
      if (isProject || !editingObjects) return openProjectWithMessage(file)
    } else if (!editingObjects || !/\.(csv|tsv|txt)$/i.test(file.name)) return
    try {
      const results = await insertFromFile(file, {})
      showToast(results.length > 1 ? `已插入 ${results.length} 張圖表` : `已插入${kindName(results[0].kind)}${results[0].reason ? `：${results[0].reason}` : ''}`)
    } catch (err) {
      showToast(err instanceof Error ? err.message : '無法讀取檔案')
    }
  }

  function onKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement
    if (target.matches('input[type="text"], input[type="number"], input:not([type]), textarea, select')) return
    const mod = e.metaKey || e.ctrlKey
    const key = e.key.toLowerCase()
    if (ui.drawPolygon) {
      if (key === 'enter') finishPolygon()
      else if (key === 'escape') cancelPolygon()
      return
    }

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
  onpaste={onPaste}
  ondragover={(e) => e.preventDefault()}
  ondrop={(e) => {
    e.preventDefault()
    const file = e.dataTransfer?.files?.[0]
    if (file) onDropFile(file)
  }}
/>

<div class="app">
  <header>
    <div class="brand">
      <strong>GRAPHIC<span class="slash">/</span>DESIGNER</strong>
      <small>構圖設計工作台</small>
    </div>
    {#if projects.current}<Stepper />{/if}
    <div class="right">
      {#if projects.current}
      <button class="project-btn" onclick={() => openProject(projects.list.length ? 'projects' : 'new')} title="我的專案、新專案、專案檔">
        專案<small>{project.name ? `${project.name}・` : ''}{project.canvas.w} × {project.canvas.h} {project.canvas.unit}</small>
      </button>
      <button onclick={() => openProject('wizard')} title="用精靈一步步重新調整文字、版型、動線與配色">精靈</button>
      <ResetButton />
      <ProjectMenu />
      {/if}
    </div>
  </header>

  {#if !projects.current}
    <!-- 還沒有任何專案：只顯示「新增設計」 -->
    <section class="empty">
      <button class="add-design" onclick={() => openProject('new')}>
        <span class="plus">＋</span>
        <strong>新增設計</strong>
      </button>
      <button class="link" onclick={() => openProject('file')}>或開啟專案檔（.json）</button>
    </section>
  {:else}
  <!-- 左側：這一步的設定（隨步驟改變） -->
  <aside class="left">
    <div class="step-title">
      <span class="num">STEP {String(flow.current + 1).padStart(2, '0')}</span>
      <strong>{step.label}</strong>
    </div>

    {#key step.id}
    <Accordion name="left:{step.id}">
    {#if step.id === 'composition'}
      <CompositionPanel regions={regionOptions} />
    {:else if step.id === 'guides'}
      <GuidesPanel regions={regionOptions} />
    {:else if step.id === 'blocks'}
      <BlocksPanel {suggestions} onadopt={adopt} />
    {:else if step.id === 'objects'}
      <ObjectsPanel anchors={anchorOptions} {focusText} layout={layoutContext} />
    {:else if step.id === 'refine'}
      <RefinePanel anchors={anchorOptions} />
    {/if}
    </Accordion>
    {/key}

    {#if flow.current < STEPS.length - 1}
      <div class="next-bar">
        <button class="primary next" onclick={completeStep}>
          {stepEmpty ? '略過' : '完成'}「{step.label}」<span>→ {STEPS[flow.current + 1].label}</span>
        </button>
      </div>
    {/if}
  </aside>

  <main>
    <div class="caption" aria-hidden="true">
      <span class="step">{String(flow.current + 1).padStart(2, '0')} / {step.label}</span>
      <span>{project.canvas.w} × {project.canvas.h} {project.canvas.unit}</span>
    </div>
    <CanvasView
      bind:this={view}
      canvas={project.canvas}
      {layers}
      {handles}
      {handleSnap}
      onhandlemove={onHandleMove}
      blocks={blockViews}
      selectedBlock={ui.selectedBlock}
      blocksInteractive={step.id === 'blocks'}
      blocksVisible={project.visibility.blocks}
      {ghosts}
      blockTool={ui.blockTool}
      snap={editingObjects ? objectSnap : blockSnap}
      {blockEvents}
      objects={project.objects.items}
      selectedObjects={ui.selectedObjects}
      objectsInteractive={editingObjects && !ui.pickSubject && !ui.drawPolygon}
      objectsVisible={project.visibility.objects}
      background={project.background}
      fontVersion={fontVersion + imageStoreTick}
      {objectEvents}
      picking={!!ui.pickSubject || !!ui.drawPolygon}
      onpick={onPick}
      guidesOnTop={project.visibility.guidesOnTop}
      guideOpacity={project.visibility.guideOpacity}
      uiThemeId={uiTheme.id}
      palette={paletteOf(project.palette)?.colors ?? []}
    />
    {#if toast}<div class="toast" role="status">{toast}</div>{/if}
  </main>

  <!-- 右側：跨步驟的設定（可收合） -->
  <aside class="right-panel" class:collapsed={rightCollapsed}>
    <RightPanel {render} collapsed={rightCollapsed} ontoggle={toggleRight} />
  </aside>
  {/if}
</div>

<ProjectDialog bind:open={projectOpen} bind:tab={projectTab} regions={layoutContext.regions} path={layoutContext.path} />

<style>
  .app {
    height: 100vh;
    display: grid;
    grid-template-rows: auto 1fr;
    grid-template-columns: 340px 1fr auto;
    grid-template-areas: 'header header header' 'left main right';
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
  }
  .empty {
    grid-column: 1 / -1;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 14px;
    background-color: var(--bg);
    background-image: radial-gradient(var(--canvas-dot) 1px, transparent 1.2px);
    background-size: 22px 22px;
  }
  .add-design {
    display: grid;
    place-items: center;
    gap: 10px;
    width: 220px;
    height: 220px;
    border: 2px dashed var(--line-strong);
    border-radius: 16px;
    background: var(--panel);
    font-size: 15px;
  }
  .add-design:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--text);
  }
  .add-design .plus {
    font-size: 56px;
    line-height: 1;
    color: var(--accent);
  }
  .empty .link {
    border: none;
    background: none;
    color: var(--muted);
    font-size: 13px;
    text-decoration: underline;
  }
  .project-btn {
    display: flex;
    align-items: baseline;
    gap: 8px;
    font-weight: 700;
  }
  .project-btn small {
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 400;
    color: var(--muted);
  }
  .toast {
    position: absolute;
    left: 50%;
    bottom: 18px;
    transform: translateX(-50%);
    padding: 8px 14px;
    border: 1px solid var(--line-strong);
    border-radius: 8px;
    background: var(--panel);
    font-size: 13px;
    z-index: 2;
  }
  .left {
    grid-area: left;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    border-right: 1px solid var(--line);
    background: var(--panel);
    padding: 0 20px;
    counter-reset: section;
  }
  .step-title {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 18px 0 4px;
    font-size: 18px;
  }
  .step-title .num {
    font-family: var(--mono);
    font-size: 12px;
    letter-spacing: 0.12em;
    color: var(--highlight);
  }
  .right-panel {
    grid-area: right;
    width: 330px;
    overflow-y: auto;
    border-left: 1px solid var(--line);
    background: var(--panel);
  }
  .right-panel.collapsed {
    width: 50px;
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
  @media (max-width: 900px) {
    .app {
      grid-template-columns: 1fr;
      grid-template-rows: auto 50vh auto auto;
      grid-template-areas: 'header' 'main' 'left' 'right';
    }
    .right-panel,
    .right-panel.collapsed {
      width: auto;
    }
  }
</style>
