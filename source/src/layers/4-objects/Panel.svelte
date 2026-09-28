<script lang="ts">
  import Section from '../../ui/Section.svelte'
  import Fold from '../../ui/Fold.svelte'
  import Swatches from '../../ui/Swatches.svelte'
  import { importImageFile } from '../../core/assets'
  import type { AnchorOption } from '../../core/objects'
  import {
    addObject,
    selectObject,
    moveObject,
    project,
    removeObject,
    ui,
    type Placement,
  } from '../../core/store.svelte'
  import ObjectEditor from './ObjectEditor.svelte'
  import ContentPanel from './ContentPanel.svelte'
  import type { SlotSource } from '../../core/autolayout'
  import type { Pt } from '../../core/geometry'
  import Help from '../../ui/Help.svelte'
  import { objectTypeOf, objectTypes } from './types'

  interface Props {
    anchors: AnchorOption[]
    /** 遞增時聚焦文字輸入框（在畫布上雙擊文字） */
    focusText: number
    /** 自動排版用：構圖與引導切出的區域、視覺動線 */
    layout: { regions: SlotSource[]; path: Pt[] }
  }
  let { anchors, focusText, layout }: Props = $props()

  const items = $derived(project.objects.items)
  const c = $derived(project.canvas)
  const blocks = $derived(project.blocks.items)

  // ── 新增物件 ──────────────────────────────────────
  let target = $state('center')
  let imageInput: HTMLInputElement
  let bgInput: HTMLInputElement
  let error = $state('')

  function placement(): Placement {
    if (target.startsWith('block:')) {
      const b = blocks.find((x) => x.uid === target.slice(6))
      if (b) return { rect: { x: b.x, y: b.y, w: b.w, h: b.h }, block: b.uid }
    }
    if (target.startsWith('anchor:')) {
      const a = anchors[Number(target.slice(7))]
      if (a) return { center: { x: a.x, y: a.y } }
    }
    return {}
  }

  function add(type: string) {
    if (type === 'image') {
      imageInput.click()
      return
    }
    addObject(type, placement())
  }

  async function withImage(input: HTMLInputElement, fn: (r: Awaited<ReturnType<typeof importImageFile>>) => void) {
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    try {
      fn(await importImageFile(file))
      error = ''
    } catch (e) {
      error = e instanceof Error ? e.message : '無法讀取圖片'
    }
  }

  function onImage() {
    withImage(imageInput, ({ id, width, height }) => {
      const p = placement()
      if (!p.rect) {
        // 依圖片比例決定預設大小（長邊為畫布短邊的一半）
        const short = Math.min(c.w, c.h) * 0.5
        const k = short / Math.max(width, height)
        const w = (width * k) / c.w
        const h = (height * k) / c.h
        const ctr = p.center ?? { x: 0.5, y: 0.5 }
        p.rect = { x: ctr.x - w / 2, y: ctr.y - h / 2, w, h }
      }
      addObject('image', p, { assetId: id })
    })
  }

</script>

<!-- 選取物件時，編輯區自動展開並放在最上面 -->
<ObjectEditor {anchors} {focusText} />

<ContentPanel regions={layout.regions} path={layout.path} />

<Section id="objects-1" title="新增物件">
  <label class="row">
    <span>放置位置</span>
    <select bind:value={target}>
      <option value="center">畫布中央</option>
      {#if blocks.length}
        <optgroup label="放進區塊（物件框 = 區塊）">
          {#each blocks as b (b.uid)}
            <option value="block:{b.uid}">{b.name}</option>
          {/each}
        </optgroup>
      {/if}
      {#if anchors.length}
        <optgroup label="以錨點為中心">
          {#each anchors as a, i (i)}
            <option value="anchor:{i}">{a.label}</option>
          {/each}
        </optgroup>
      {/if}
    </select>
  </label>
  <div class="types">
    {#each objectTypes as t (t.id)}
      <button onclick={() => add(t.id)}>{t.id === 'image' ? '＋ 圖片…' : `＋ ${t.meta.name}`}</button>
    {/each}
  </div>
  <input bind:this={imageInput} type="file" accept="image/*" hidden onchange={onImage} />
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</Section>

<Section id="objects-2" title="背景">
  <div class="inline">
    <input type="color" bind:value={project.background.color} aria-label="背景顏色" />
    <button onclick={() => bgInput.click()}>{project.background.assetId ? '更換背景圖' : '＋ 背景圖…'}</button>
    {#if project.background.assetId}
      <button onclick={() => (project.background.assetId = null)}>移除圖片</button>
    {/if}
  </div>
  <div class="bg-swatches"><Swatches value={project.background.color} onpick={(c) => (project.background.color = c)} /></div>
  {#if project.background.assetId}
    <Fold id="bg-photo" title="背景照片設定">
    <label class="row">
      <span>填滿方式</span>
      <select bind:value={project.background.fit}>
        <option value="cover">填滿（裁切超出部分）</option>
        <option value="contain">完整顯示</option>
        <option value="stretch">拉伸</option>
      </select>
    </label>
    <label class="row">
      <span>不透明度 {Math.round(project.background.opacity * 100)}%</span>
      <input type="range" min="0" max="1" step="0.05" bind:value={project.background.opacity} />
    </label>
    {#if project.background.fit !== 'stretch'}
      <label class="row">
        <span>放大 {project.background.zoom.toFixed(2)}×</span>
        <input type="range" min="1" max="4" step="0.01" bind:value={project.background.zoom} />
      </label>
      <div class="bg-subject">
        <div class="inline">
          <label class="inline"><input type="checkbox" bind:checked={ui.editBackground} /> 顯示背景主體 ⊕</label>
          <Help text="在畫布上顯示背景照片的主體 ⊕：拖曳可移動照片並吸附錨點；照片移到邊緣時先調大「放大」。" />
        </div>
        <button class:on={ui.pickSubject === 'bg'} onclick={() => (ui.pickSubject = ui.pickSubject === 'bg' ? null : 'bg')}>
          {ui.pickSubject === 'bg' ? '請在照片上點主體…（再按一次取消）' : '⊕ 點背景照片標記主體'}
        </button>
        {#if anchors.length}
          <label class="row">
            <span>把背景主體對準錨點</span>
            <select value="" onchange={(e) => { const a = anchors[Number(e.currentTarget.value)]; if (a) project.background.target = { x: a.x, y: a.y }; ui.editBackground = true; e.currentTarget.value = '' }}>
              <option value="" disabled>選擇錨點…</option>
              {#each anchors as a, i (i)}
                <option value={i}>{a.label}</option>
              {/each}
            </select>
          </label>
        {/if}
      </div>
    {/if}
    </Fold>
  {/if}
  <input
    bind:this={bgInput}
    type="file"
    accept="image/*"
    hidden
    onchange={() => withImage(bgInput, ({ id }) => (project.background.assetId = id))}
  />
</Section>



<style>
  .row {
    display: grid;
    gap: 4px;
    font-size: 13px;
  }
  .types {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(84px, 1fr));
    gap: 6px;
  }
  .types button {
    font-size: 12px;
    padding: 6px 4px;
  }
  input[type='color'] {
    width: 36px;
    height: 26px;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: none;
  }
  .error {
    color: var(--danger);
    font-size: 12px;
  }
  .bg-subject {
    display: grid;
    gap: 8px;
    margin-top: 8px;
  }
  .bg-subject button.on {
    border-color: var(--accent);
    color: var(--accent);
  }
  .bg-swatches {
    margin: 8px 0 4px;
  }
</style>
