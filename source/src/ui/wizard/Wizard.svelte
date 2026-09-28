<script lang="ts">
  // 建立設計的精靈：一步一個問題（尺寸 → 文字 → 版型 → 動線 → 完成），完成後進入編輯器微調。
  // 第一步按「下一步」時建立專案，之後各步直接修改這個專案；也可以對目前的專案重新打開（從第二步開始）。
  import { untrack } from 'svelte'
  import { CANVAS_PRESETS, type CanvasSpec } from '../../core/canvas'
  import { proposeLayouts, roleDef, type SlotSource } from '../../core/autolayout'
  import { importImageFile } from '../../core/assets'
  import { downloadSample, importContentJson } from '../../core/contentJson'
  import type { Pt } from '../../core/geometry'
  import { projectLayoutInput } from '../../core/layoutInput'
  import { paletteOf, PALETTES } from '../../core/palettes'
  import { createProject, storedProjectData } from '../../core/persistence.svelte'
  import { projects } from '../../core/projects.svelte'
  import { CUT_KINDS, cutOf, RECIPES, resolveRecipe, type Recipe } from '../../core/recipes'
  import {
    addGuide,
    placePhotoInBlock,
    applyPalette,
    applyProposal,
    applyRecipe,
    chooseComposition,
    contentItems,
    contentText,
    contentUntouched,
    flow,
    isContent,
    project,
    ui,
    type ProjectData,
  } from '../../core/store.svelte'
  import { compositionTemplates } from '../../layers/1-composition/templates'
  import { guideTemplates } from '../../layers/2-guides/templates'
  import ProposalThumb from '../../layers/4-objects/ProposalThumb.svelte'
  import theme from '../../config/theme.json'
  import { IDENTITY } from '../../core/transform'
  import CanvasSettings from '../CanvasSettings.svelte'
  import ContentList from '../ContentList.svelte'
  import Help from '../Help.svelte'
  import PalettePicker from '../PalettePicker.svelte'
  import ProposalPicker from '../ProposalPicker.svelte'
  import TemplateThumb from '../TemplateThumb.svelte'

  interface Props {
    /** create：建立新設計（從尺寸開始）；edit：對目前的專案重新走一次（從文字開始） */
    mode: 'create' | 'edit'
    /** 目前構圖與引導切出的區域、視覺動線（排版提案用） */
    regions: SlotSource[]
    path: Pt[]
    step?: number
    onclose: () => void
  }
  let { mode, regions, path, step = $bindable(1), onclose }: Props = $props()

  // svelte-ignore state_referenced_locally
  step = mode === 'create' ? 1 : 2
  const LABELS = ['尺寸', '文字', '版型', '動線', '完成']

  // ── 1 尺寸 ───────────────────────────────────────────
  let name = $state('')
  let draft = $state<CanvasSpec>({ ...project.canvas })
  let custom = $state(false)
  let carryOn = $state(false)
  let sourceId = $state<string | null>(projects.current)
  let carryPalette = $state(true)
  let carryLogo = $state(true)
  let carryTexts = $state<string[]>([])

  const pickPreset = (id: string) => {
    const p = CANVAS_PRESETS.find((q) => q.id === id)!
    draft = { presetId: p.id, w: p.w, h: p.h, unit: p.unit }
    custom = false
  }
  const sorted = $derived([...projects.list].sort((a, b) => b.updatedAt - a.updatedAt))
  const source = $derived<ProjectData | null>(carryOn && sourceId ? storedProjectData(sourceId) : null)
  const sourceTexts = $derived(source ? source.objects.items.filter((o) => isContent(o) && o.type === 'text') : [])
  const sourceHasLogo = $derived(!!source?.objects.items.some((o) => isContent(o) && o.type === 'image'))
  $effect(() => {
    const list = sourceTexts
    untrack(() => (carryTexts = list.filter((o) => o.props.role === 'title').map((o) => o.uid)))
  })
  const toggleText = (uid: string) => (carryTexts = carryTexts.includes(uid) ? carryTexts.filter((x) => x !== uid) : [...carryTexts, uid])

  function create() {
    createProject({ ...draft }, null, {
      name: name.trim(),
      carry: source ? { source, palette: carryPalette, logo: carryLogo, texts: carryTexts } : undefined,
    })
  }

  // ── 2 文字 ───────────────────────────────────────────
  let jsonInput: HTMLInputElement | undefined = $state()
  let message = $state<{ kind: 'ok' | 'error'; text: string } | null>(null)
  async function onJson() {
    const file = jsonInput?.files?.[0]
    if (jsonInput) jsonInput.value = ''
    if (!file) return
    try {
      const n = await importContentJson(await file.text())
      message = { kind: 'ok', text: `已加入 ${n} 項內容` }
    } catch (e) {
      message = { kind: 'error', text: e instanceof Error ? e.message : '無法讀取檔案' }
    }
  }

  // ── 3 版型：用自己的文字預覽每個範本 ────────────────────
  let group = $state<string>('all')
  let chosenRecipe = $state<string | null>(null)
  let onlyComposition = $state(false)
  // 切割類型要依展開後的形狀判斷，所以用固定比例先展開一次
  const cutKinds = new Map(RECIPES.map((r) => [r.id, cutOf(r, resolveRecipe(r, { w: 100, h: 100 }, compositionTemplates, guideTemplates).blocks)]))
  const shown = $derived(group === 'all' ? RECIPES : RECIPES.filter((r) => cutKinds.get(r.id) === group))
  const previews = $derived.by(() => {
    if (step !== 3) return []
    const c = project.canvas
    const items = contentItems()
    return shown.map((recipe) => {
      const r = resolveRecipe(recipe, c, compositionTemplates, guideTemplates)
      const slot = (b: (typeof r.blocks)[number]) => ({ rect: b.rect, shape: b.shape, points: b.points, role: b.role })
      const proposal = items.length
        ? proposeLayouts({
            canvas: { w: c.w, h: c.h },
            items,
            blocks: r.blocks.map(slot),
            regions: r.outputs.flatMap((o) => (o.regions ?? []).map((g) => ({ rect: g, shape: g.points ? ('polygon' as const) : g.shape === 'ellipse' ? ('ellipse' as const) : ('rect' as const), points: g.points, role: g.role }))),
            path: r.guides.length ? r.outputs.slice(r.compositions.length).flatMap((o) => o.anchors) : [],
            obstacles: r.blocks.filter((b) => b.role === 'image' || b.role === 'logo').map(slot),
            panels: r.blocks.filter((b) => b.panel).map(slot),
          })[0]
        : undefined
      // 內容放不下這個範本（只剩縮小字級的退路）：排到後面並提示
      return { recipe, blocks: r.blocks, proposal: proposal ?? { id: 'empty', name: '', placements: [] }, tight: proposal?.id === 'full' }
    }).sort((a, b) => Number(a.tight) - Number(b.tight))
  })
  function useRecipe(r: Recipe) {
    applyRecipe(r)
    chosenRecipe = r.id
    onlyComposition = false
  }
  const compColors = { main: theme.guides.composition.mainColor, sub: theme.guides.composition.subColor }

  // ── 4 動線：依內容推薦 ─────────────────────────────────
  // 內容項目多、行數多（菜單、說明）→ 適合閱讀型動線；內容少 → 適合視覺型動線
  const readingHeavy = $derived.by(() => {
    const items = contentItems()
    const lines = items.reduce((n, i) => n + i.text.split('\n').length, 0)
    return items.length >= 5 || lines >= 8
  })
  const recommended = $derived(readingHeavy ? ['f-pattern', 'gutenberg'] : ['z-pattern', 'gaze-path', 'focus-lines'])
  const guideOrder = $derived([...guideTemplates].sort((a, b) => Number(recommended.includes(b.id)) - Number(recommended.includes(a.id))))
  const currentGuide = $derived(project.guides.items[0]?.templateId ?? null)
  function useGuide(id: string | null) {
    project.guides.items = []
    if (id) addGuide(id)
  }
  const canvasAspect = $derived(project.canvas.w / project.canvas.h)

  // ── 5 完成：配色、照片、排版 ─────────────────────────────
  let mode5 = $state<'light' | 'dark'>('light')
  let pickerOpen = $state(false)
  const suggestedPalettes = $derived.by(() => {
    const cats = [...new Set(PALETTES.map((p) => p.category))].slice(0, 4)
    const picks = cats.flatMap((c) => PALETTES.filter((p) => p.category === c).slice(0, 2))
    const cur = paletteOf(project.palette)
    return cur && !picks.includes(cur) ? [cur, ...picks.slice(0, 7)] : picks
  })
  const imageSlots = $derived(project.blocks.items.filter((b) => (b.role === 'image' || b.role === 'background') && b.visible))
  const filled = (uid: string) => project.objects.items.some((o) => o.type === 'image' && o.mask === uid)
  let slotInput: HTMLInputElement | undefined = $state()
  let slotTarget: string | null = null
  async function onSlotImage() {
    const file = slotInput?.files?.[0]
    if (slotInput) slotInput.value = ''
    const b = project.blocks.items.find((x) => x.uid === slotTarget)
    if (!file || !b) return
    const { id } = await importImageFile(file)
    placePhotoInBlock(b.uid, id)
  }
  const proposals = $derived(step === 5 ? proposeLayouts(projectLayoutInput(regions, path)) : [])

  function finish() {
    // 文字還沒手動調整過：套用選的（或第一個）排版提案
    if (contentUntouched() && proposals.length) applyProposal(proposals.find((p) => p.id === ui.layoutPref) ?? proposals[0])
    flow.reached = 4
    flow.current = 3
    onclose()
  }

  function next() {
    if (step === 1) create()
    if (step === 5) return finish()
    step++
  }
  // 第一步建立專案後就不能回去改尺寸；編輯模式從第二步開始
  const canBack = $derived(step >= 3)
</script>

<div class="wizard">
  <ol class="steps">
    {#each LABELS as label, i (i)}
      <li class:on={step === i + 1} class:done={step > i + 1}><span>{i + 1}</span>{label}</li>
    {/each}
  </ol>

  <div class="body">
    {#if step === 1}
      <section>
        <h3>名稱</h3>
        <input class="name" type="text" bind:value={name} placeholder="未命名設計" />
      </section>
      <section>
        <h3>尺寸 <Help text="尺寸在建立時決定。" /></h3>
        <div class="sizes">
          {#each CANVAS_PRESETS as p (p.id)}
            {@const k = 34 / Math.max(p.w, p.h)}
            <button class="size" class:on={!custom && draft.presetId === p.id} onclick={() => pickPreset(p.id)}>
              <span class="shape" style:width="{p.w * k}px" style:height="{p.h * k}px"></span>
              <span class="label">{p.name}</span>
            </button>
          {/each}
          <button class="size" class:on={custom || !draft.presetId} onclick={() => (custom = true)}>
            <span class="shape custom">✎</span>
            <span class="label">自訂尺寸</span>
          </button>
        </div>
        {#if custom || !draft.presetId}<div class="custom-size"><CanvasSettings bind:spec={draft} /></div>{/if}
      </section>
      {#if projects.list.length}
        <section>
          <label class="check"><input type="checkbox" bind:checked={carryOn} /> 沿用其他專案（系列作品）</label>
          {#if carryOn}
            <div class="carry">
              <select bind:value={sourceId} aria-label="沿用的專案">
                {#each sorted as p (p.id)}<option value={p.id}>{p.name || '未命名設計'}（{p.w} × {p.h} {p.unit}）</option>{/each}
              </select>
              {#if source}
                <div class="chips">
                  {#if source.palette}<label><input type="checkbox" bind:checked={carryPalette} /> 配色</label>{/if}
                  {#if sourceHasLogo}<label><input type="checkbox" bind:checked={carryLogo} /> Logo</label>{/if}
                </div>
                {#if sourceTexts.length}
                  <ul class="texts">
                    {#each sourceTexts as o (o.uid)}
                      <li>
                        <label>
                          <input type="checkbox" checked={carryTexts.includes(o.uid)} onchange={() => toggleText(o.uid)} />
                          <small>{roleDef(String(o.props.role)).label}</small>
                          <span>{contentText(o).split('\n')[0]}</span>
                        </label>
                      </li>
                    {/each}
                  </ul>
                {/if}
              {/if}
            </div>
          {/if}
        </section>
      {/if}
    {:else if step === 2}
      <section>
        <h3>要放哪些文字？ <Help text="逐條加入標題、子標題、價目…，順序就是排版的順序。也可以匯入事先準備好的 JSON（格式見範例）。沒有文字也可以略過。" /></h3>
        <ContentList />
        <div class="json">
          <button onclick={() => jsonInput?.click()}>匯入文字（JSON）</button>
          <button class="link" onclick={downloadSample}>下載範例</button>
          <input bind:this={jsonInput} type="file" accept=".json,application/json" hidden onchange={onJson} />
          {#if message}<span class="msg" class:error={message.kind === 'error'}>{message.text}</span>{/if}
        </div>
      </section>
    {:else if step === 3}
      <section>
        <h3>空間怎麼切？ <Help text="範本包含構圖線與切好的區塊；縮圖用你的文字預覽。之後都可以在編輯器中調整。" /></h3>
        <div class="chips-row">
          <button class:on={!onlyComposition && group === 'all'} onclick={() => ((group = 'all'), (onlyComposition = false))}>全部</button>
          {#each CUT_KINDS as k (k.id)}
            <button class:on={!onlyComposition && group === k.id} onclick={() => ((group = k.id), (onlyComposition = false))}>{k.label}</button>
          {/each}
          <button class:on={onlyComposition} onclick={() => (onlyComposition = true)}>只選構圖</button>
        </div>
        {#if onlyComposition}
          <div class="grid small">
            {#each compositionTemplates as t (t.id)}
              <button class="card" class:on={project.compositions.items.length === 1 && project.compositions.items[0].templateId === t.id && !project.blocks.items.length} onclick={() => ((chosenRecipe = null), chooseComposition(t.id))} title={t.meta.description}>
                <TemplateThumb template={t} aspect={canvasAspect} orientation={IDENTITY} colors={compColors} />
                <span>{t.meta.name}</span>
              </button>
            {/each}
          </div>
        {:else}
          <div class="grid">
            {#each previews as p (p.recipe.id)}
              <button class="card" class:on={chosenRecipe === p.recipe.id} onclick={() => useRecipe(p.recipe)} title={p.recipe.description}>
                <ProposalThumb proposal={p.proposal} blocks={p.blocks} height={150} />
                <span>{p.recipe.name}</span>
                {#if p.tight}<small class="tight">內容較多，字會偏小</small>{/if}
              </button>
            {/each}
          </div>
        {/if}
      </section>
    {:else if step === 4}
      <section>
        <h3>視線怎麼走？ <Help text="視覺引導決定文字依序出現的位置。標「推薦」的是依你的內容量挑的；「自訂視線」可以自己畫視線。" /></h3>
        <div class="grid small">
          <button class="card" class:on={!currentGuide} onclick={() => useGuide(null)}>
            <span class="none">不使用</span>
            <span>不使用</span>
          </button>
          {#each guideOrder as t (t.id)}
            <button class="card" class:on={currentGuide === t.id} onclick={() => useGuide(t.id)} title={t.meta.description}>
              <TemplateThumb template={t} aspect={canvasAspect} orientation={IDENTITY} colors={{ main: theme.guides.visual.mainColor, sub: theme.guides.visual.subColor }} />
              <span>{t.meta.name}{#if recommended.includes(t.id)}<em>推薦</em>{/if}</span>
            </button>
          {/each}
        </div>
      </section>
    {:else}
      <section>
        <h3>配色</h3>
        <div class="palettes">
          {#each suggestedPalettes as p (p.id)}
            <button class="pal" class:on={project.palette === p.id} onclick={() => applyPalette(p.id, mode5)} title={p.name}>
              <span class="strip">{#each p.colors as c, i (i)}<span style:background={c}></span>{/each}</span>
              <small>{p.name}</small>
            </button>
          {/each}
          <button class="pal more" onclick={() => (pickerOpen = true)}>更多配色…</button>
        </div>
        <div class="seg">
          <button class:on={mode5 === 'light'} onclick={() => ((mode5 = 'light'), project.palette && applyPalette(project.palette, 'light'))}>淺底</button>
          <button class:on={mode5 === 'dark'} onclick={() => ((mode5 = 'dark'), project.palette && applyPalette(project.palette, 'dark'))}>深底</button>
        </div>
      </section>
      {#if imageSlots.length}
        <section>
          <h3>照片</h3>
          <div class="slots">
            {#each imageSlots as b (b.uid)}
              <button class="slot" class:filled={filled(b.uid)} onclick={() => ((slotTarget = b.uid), slotInput?.click())}>
                {filled(b.uid) ? '✓ ' : '＋ '}{b.name || '照片'}
              </button>
            {/each}
          </div>
          <input bind:this={slotInput} type="file" accept="image/*" hidden onchange={onSlotImage} />
        </section>
      {/if}
      {#if proposals.length}
        <section>
          <h3>排版</h3>
          <ProposalPicker {proposals} columns={3} />
        </section>
      {/if}
      <PalettePicker bind:open={pickerOpen} />
    {/if}
  </div>

  <footer>
    {#if canBack}<button onclick={() => step--}>上一步</button>{/if}
    <span class="grow"></span>
    {#if step >= 2 && step <= 4}<button onclick={() => step++}>略過</button>{/if}
    {#if step === 5 && mode === 'edit'}<button onclick={onclose}>取消</button>{/if}
    <button class="primary" onclick={next}>{step === 5 ? '完成' : '下一步'}</button>
  </footer>
</div>

<style>
  .wizard {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
  }
  .steps {
    display: flex;
    gap: 4px;
    list-style: none;
    margin: 0;
    padding: 12px 20px 0;
  }
  .steps li {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    padding-bottom: 8px;
    border-bottom: 2px solid var(--line);
    font-size: 13px;
    color: var(--faint);
  }
  .steps li span {
    font-family: var(--mono);
    font-size: 11px;
  }
  .steps li.done {
    color: var(--muted);
    border-color: var(--line-strong);
  }
  .steps li.on {
    color: var(--text);
    font-weight: 700;
    border-color: var(--accent);
  }
  .body {
    counter-reset: section;
    overflow-y: auto;
    padding: 8px 20px 16px;
    flex: 1;
  }
  section {
    padding: 12px 0;
  }
  h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 10px;
    font-size: 14px;
  }
  .name {
    width: 100%;
  }
  .sizes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 6px;
  }
  .size {
    display: grid;
    justify-items: center;
    gap: 6px;
    padding: 10px 4px;
  }
  .size.on,
  .card.on,
  .pal.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .shape {
    display: grid;
    place-items: center;
    height: 34px;
    border: 1.5px solid var(--muted);
    border-radius: 2px;
  }
  .shape.custom {
    width: 34px;
    border-style: dashed;
    color: var(--muted);
  }
  .size .label {
    font-size: 11px;
    text-align: center;
    line-height: 1.3;
  }
  .custom-size {
    margin-top: 10px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }
  .carry {
    display: grid;
    gap: 8px;
    margin: 8px 0 0 26px;
  }
  .carry .chips {
    display: flex;
    gap: 16px;
    font-size: 13px;
  }
  .texts {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
    font-size: 13px;
  }
  .texts label {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .texts small {
    color: var(--muted);
    min-width: 3em;
  }
  .json {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    margin-top: 14px;
    font-size: 13px;
  }
  .link {
    border: none;
    background: none;
    color: var(--accent);
    padding: 0;
    text-decoration: underline;
  }
  .msg {
    color: var(--ok);
  }
  .msg.error {
    color: var(--danger);
  }
  .chips-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 12px;
  }
  .chips-row button {
    padding: 3px 12px;
    font-size: 12px;
    border-radius: 999px;
  }
  .chips-row button.on {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--text);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 10px;
  }
  .grid.small {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  }
  .card {
    display: grid;
    gap: 6px;
    padding: 8px;
    font-size: 12px;
    text-align: left;
    align-content: start;
  }
  .card .tight {
    font-size: 11px;
    color: var(--highlight);
  }
  .card em {
    margin-left: 6px;
    font-style: normal;
    font-size: 11px;
    color: var(--accent);
  }
  .none {
    display: grid;
    place-items: center;
    height: 60px;
    border: 1.5px dashed var(--line-strong);
    border-radius: 4px;
    color: var(--muted);
  }
  .palettes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 6px;
  }
  .pal {
    display: grid;
    gap: 4px;
    padding: 6px;
    text-align: left;
  }
  .pal .strip {
    display: flex;
    height: 20px;
    border-radius: 3px;
    overflow: hidden;
  }
  .pal .strip span {
    flex: 1;
  }
  .pal small {
    font-size: 11px;
  }
  .pal.more {
    place-items: center;
    color: var(--muted);
  }
  .seg {
    display: inline-flex;
    margin-top: 10px;
  }
  .seg button {
    border-radius: 0;
    font-size: 12px;
    padding: 4px 14px;
  }
  .seg button:first-child {
    border-radius: var(--radius) 0 0 var(--radius);
  }
  .seg button:last-child {
    border-radius: 0 var(--radius) var(--radius) 0;
    border-left: none;
  }
  .seg button.on {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .slots {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .slot {
    border-style: dashed;
  }
  .slot.filled {
    border-style: solid;
    border-color: var(--ok);
  }
  footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    border-top: 1px solid var(--line);
  }
  .grow {
    flex: 1;
  }
</style>
