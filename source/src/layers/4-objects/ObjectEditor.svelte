<script lang="ts">
  import Section from '../../ui/Section.svelte'
  // 單一物件的編輯區（第四層「插入物件」與第五層「微調」共用）。
  import { importImageFile } from '../../core/assets'
  import { FONT_GROUPS } from '../../core/fonts'
  import { fontSizeFromDisplay, fontSizeToDisplay, fontUnitLabel, type AnchorOption } from '../../core/objects'
  import type { ParamValues } from '../../core/params'
  import { duplicateObject, moveObject, project, removeObject, setContentText, contentText, ui, updateObject } from '../../core/store.svelte'
  import FontLibrary from '../../ui/FontLibrary.svelte'
  import FontSelect from '../../ui/FontSelect.svelte'
  import ParamPanel from '../../ui/ParamPanel.svelte'
  import { objectTypeOf } from './types'
  import Help from '../../ui/Help.svelte'
  import Fold from '../../ui/Fold.svelte'
  import Swatches from '../../ui/Swatches.svelte'
  import { objectBox, targetFromCanvas } from '../../core/framing'
  import { BLOCK_SHAPES } from '../../core/blocks'

  interface Props {
    anchors: AnchorOption[]
    /** 遞增時聚焦文字輸入框（在畫布上雙擊文字） */
    focusText?: number
  }
  let { anchors, focusText = 0 }: Props = $props()

  // 只有單選時才顯示編輯區
  const selected = $derived(
    ui.selectedObjects.length === 1 ? project.objects.items.find((o) => o.uid === ui.selectedObjects[0]) : undefined,
  )
  const selectedType = $derived(selected && objectTypeOf(selected.type))
  const c = $derived(project.canvas)
  const blocks = $derived(project.blocks.items)
  let replaceInput: HTMLInputElement | undefined = $state()
  let error = $state('')

  async function replaceImage(input: HTMLInputElement) {
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    try {
      const { id } = await importImageFile(file)
      setProp('assetId', id)
      error = ''
    } catch (e) {
      error = e instanceof Error ? e.message : '無法讀取圖片'
    }
  }

  // ── 選取物件的編輯 ─────────────────────────────────
  const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d

  function setDim(axis: 'x' | 'y' | 'w' | 'h', input: HTMLInputElement) {
    if (!selected) return
    const total = axis === 'x' || axis === 'w' ? c.w : c.h
    const v = Number(input.value)
    if (input.value.trim() !== '' && Number.isFinite(v) && (axis === 'x' || axis === 'y' || v > 0)) {
      updateObject(selected.uid, { [axis]: v / total })
    }
    input.value = String(round(selected[axis] * total))
  }

  function setProp(key: string, value: ParamValues[string]) {
    if (selected) selected.props[key] = value
  }

  const short = $derived(Math.min(c.w, c.h))

  /** 放進區塊：物件框 = 區塊外框；圖片同時用區塊形狀裁切 */
  function moveToBlock(id: string) {
    const b = blocks.find((x) => x.uid === id)
    if (!selected || !b) return
    updateObject(selected.uid, {
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      rotation: 0,
      ...(selected.type === 'image' ? { mask: b.uid } : {}),
    })
  }

  /** 讓照片主體落在錨點上（照片在框內平移） */
  function alignSubject(i: number) {
    const a = anchors[i]
    if (!selected || !a) return
    const c = project.canvas
    selected.props.target = targetFromCanvas(objectBox(selected, c), { x: a.x * c.w, y: a.y * c.h })
  }

  function moveToAnchor(i: number) {
    const a = anchors[i]
    if (selected && a) updateObject(selected.uid, { x: a.x - selected.w / 2, y: a.y - selected.h / 2 })
  }

  const fontDef = $derived(
    selected?.type === 'text'
      ? FONT_GROUPS.flatMap((g) => g.fonts).find((f) => f.family === selected.props.fontFamily)
      : undefined,
  )

  let textArea: HTMLTextAreaElement | undefined = $state()
  $effect(() => {
    if (focusText > 0) {
      textArea?.focus()
      textArea?.select()
    }
  })
</script>

{#if selected && selectedType}
  <Section id="objedit-1" title="選取的物件：{selectedType.meta.name}" reopen={selected.uid}>
  <div class="editor">
    <label class="row">
      <span>名稱</span>
      <input type="text" bind:value={selected.name} />
    </label>

    {#if selected.type === 'text'}
      <label class="row">
        <span class="with-help">文字內容 <Help text="在畫布上雙擊文字也可以直接跳到這裡編輯。" /></span>
        <textarea bind:this={textArea} rows="3" value={contentText(selected)} oninput={(e) => setContentText(selected, e.currentTarget.value)}></textarea>
      </label>
    {/if}

    {#if selected.type === 'image'}
      <button onclick={() => replaceInput?.click()}>更換圖片…</button>
      <input
        bind:this={replaceInput}
        type="file"
        accept="image/*"
        hidden
        onchange={(e) => replaceImage(e.currentTarget)}
      />
      {#if error}<p class="error" role="alert">{error}</p>{/if}
    {/if}

    <div class="folds">
      {#if selected.type === 'text'}
        <Fold id="obj-font" title="字型">
          <div class="row">
            <FontSelect value={String(selected.props.fontFamily)} onchange={(f) => setProp('fontFamily', f)} />
            <details>
              <summary>瀏覽字型預覽</summary>
              <FontLibrary selected={String(selected.props.fontFamily)} onselect={(f) => setProp('fontFamily', f.family)} />
            </details>
          </div>
          <div class="two">
            <label class="row">
              <span>字級（{fontUnitLabel(c)}）</span>
              <input
                type="number"
                min="1"
                value={round(fontSizeToDisplay(selected.props.fontSize as number, c))}
                onchange={(e) => {
                  const v = Number(e.currentTarget.value)
                  if (v > 0) setProp('fontSize', fontSizeFromDisplay(v, c))
                }}
              />
            </label>
            <label class="row">
              <span>字重</span>
              <select value={Number(selected.props.fontWeight)} onchange={(e) => setProp('fontWeight', Number(e.currentTarget.value))}>
                {#each fontDef?.weights ?? [400, 700] as w (w)}
                  <option value={w}>{w}</option>
                {/each}
              </select>
            </label>
          </div>
        </Fold>
      {/if}

      {#if selected.type === 'image'}
        <Fold id="obj-photo" title="照片取景">
          <div class="framing">
            <div class="framing-title">
              照片主體 ⊕
              <Help text="畫布上的 ⊕ 是照片的主體：拖曳 ⊕ 會移動照片，靠近錨點會吸附，讓主體對準構圖。照片移到邊緣就無法再移動，這時先調大「放大」。" />
            </div>
            <div class="tools">
              <button class:on={ui.pickSubject === selected.uid} onclick={() => (ui.pickSubject = ui.pickSubject === selected.uid ? null : selected.uid)}>
                {ui.pickSubject === selected.uid ? '請在照片上點主體…（再按一次取消）' : '⊕ 點照片標記主體'}
              </button>
            </div>
            {#if anchors.length}
              <label class="row">
                <span>把主體對準錨點</span>
                <select value="" onchange={(e) => { alignSubject(Number(e.currentTarget.value)); e.currentTarget.value = '' }}>
                  <option value="" disabled>選擇錨點…</option>
                  {#each anchors as a, i (i)}
                    <option value={i}>{a.label}</option>
                  {/each}
                </select>
              </label>
            {/if}
          </div>
          {#if Object.keys(selectedType.params).length}
            <ParamPanel schema={selectedType.params} bind:values={selected.props} />
          {/if}
        </Fold>
      {:else if Object.keys(selectedType.params).length}
        {#key selected.type}
          <Fold id="obj-params-{selected.type}" title={selected.type === 'text' ? '排版' : '形狀'}>
            <ParamPanel schema={selectedType.params} bind:values={selected.props} />
          </Fold>
        {/key}
      {/if}

      <Fold id="obj-look" title="外觀">
        <div class="paint">
          {#if selected.type !== 'line' && selected.type !== 'image'}
            <label><input type="checkbox" checked={!!selected.fill} onchange={(e) => updateObject(selected.uid, { fill: e.currentTarget.checked ? '#2f6bff' : '' })} /> {selected.type === 'text' ? '文字色' : '填色'}</label>
            {#if selected.fill}<input type="color" bind:value={selected.fill} aria-label="填色" />{/if}
          {/if}
          <label><input type="checkbox" checked={!!selected.stroke} onchange={(e) => updateObject(selected.uid, { stroke: e.currentTarget.checked ? '#25221e' : '' })} /> {selected.type === 'line' ? '線條' : '框線'}</label>
          {#if selected.stroke}
            <input type="color" bind:value={selected.stroke} aria-label="框線顏色" />
            <input
              class="num"
              type="number"
              min="0"
              step="0.1"
              value={round(selected.strokeWidth * short, 2)}
              onchange={(e) => updateObject(selected.uid, { strokeWidth: Math.max(0, Number(e.currentTarget.value)) / short })}
              title="粗細（{c.unit}）"
              aria-label="框線粗細"
            />
          {/if}
        </div>
        {#if selected.fill && selected.type !== 'line' && selected.type !== 'image'}
          <Swatches value={selected.fill} onpick={(c) => updateObject(selected.uid, { fill: c })} />
        {:else if selected.stroke}
          <Swatches value={selected.stroke} onpick={(c) => updateObject(selected.uid, { stroke: c })} />
        {/if}
        <label class="row">
          <span>不透明度 {Math.round(selected.opacity * 100)}%</span>
          <input type="range" min="0" max="1" step="0.05" bind:value={selected.opacity} />
        </label>
      </Fold>

      <Fold id="obj-pos" title="位置與尺寸">
        <div class="dims">
          {#each [['x', 'X'], ['y', 'Y'], ['w', '寬'], ['h', '高']] as const as [axis, label] (axis)}
            <label>
              <span>{label}</span>
              <input
                type="number"
                value={round(selected[axis] * (axis === 'x' || axis === 'w' ? c.w : c.h))}
                onchange={(e) => setDim(axis, e.currentTarget)}
              />
            </label>
          {/each}
          <label>
            <span>旋轉</span>
            <input type="number" step="1" bind:value={selected.rotation} />
          </label>
          <small class="unit">單位：{c.unit}、度</small>
        </div>
        <div class="tools">
          <button onclick={() => updateObject(selected.uid, { x: (1 - selected.w) / 2 })}>水平置中</button>
          <button onclick={() => updateObject(selected.uid, { y: (1 - selected.h) / 2 })}>垂直置中</button>
        </div>
        {#if anchors.length}
          <label class="row">
            <span class="with-help">移到錨點 <Help text="物件的中心會對齊到選擇的錨點。" /></span>
            <select value="" onchange={(e) => { moveToAnchor(Number(e.currentTarget.value)); e.currentTarget.value = '' }}>
              <option value="" disabled>選擇錨點…</option>
              {#each anchors as a, i (i)}
                <option value={i}>{a.label}</option>
              {/each}
            </select>
          </label>
        {/if}
        {#if blocks.length}
          <label class="row">
            <span>放進區塊</span>
            <select value="" onchange={(e) => { moveToBlock(e.currentTarget.value); e.currentTarget.value = '' }}>
              <option value="" disabled>選擇區塊…</option>
              {#each blocks as b (b.uid)}
                <option value={b.uid}>{b.name}</option>
              {/each}
            </select>
          </label>
          <label class="row">
            <span>用區塊形狀裁切</span>
            <select value={selected.mask ?? ''} onchange={(e) => updateObject(selected.uid, { mask: e.currentTarget.value || null })}>
              <option value="">不裁切</option>
              {#each blocks as b (b.uid)}
                <option value={b.uid}>{b.name}（{BLOCK_SHAPES.find((s) => s.id === b.shape)?.label}）</option>
              {/each}
            </select>
          </label>
        {/if}
      </Fold>
    </div>

    <div class="tools">
      <button onclick={() => moveObject(selected.uid, 'top')}>移到最上層</button>
      <button onclick={() => moveObject(selected.uid, 'bottom')}>移到最下層</button>
      <button onclick={() => duplicateObject(selected.uid)}>複製</button>
      <button onclick={() => removeObject(selected.uid)}>刪除</button>
    </div>
  </div>
</Section>
{/if}

<style>
  .folds {
    border-bottom: 1px dashed var(--line);
  }
  .row {
    display: grid;
    gap: 4px;
    font-size: 13px;
  }
  .paint label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  input[type='color'] {
    width: 36px;
    height: 26px;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: none;
  }
  input[type='text'],
  textarea {
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 5px 9px;
    font: inherit;
    resize: vertical;
  }
  .num {
    width: 64px;
  }
  .two {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .two input,
  .two select {
    min-width: 0;
    width: 100%;
  }
  .editor {
    display: grid;
    gap: 10px;
  }
  .dims {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .dims label {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }
  .dims input {
    min-width: 0;
  }
  .unit {
    grid-column: 1 / -1;
    color: var(--muted);
  }
  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .error {
    color: var(--danger);
    font-size: 12px;
  }
  details summary {
    font-size: 12px;
    color: var(--accent);
    cursor: pointer;
    margin: 4px 0;
  }
  .framing {
    display: grid;
    gap: 8px;
    padding: 10px;
    border: 1px dashed var(--line-strong);
    border-radius: var(--radius);
  }
  .with-help {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .framing-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }
  .tools button.on {
    border-color: var(--accent);
    color: var(--accent);
  }
</style>
