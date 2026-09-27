<script lang="ts">
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
  import { objectTypeOf, objectTypes } from './types'

  interface Props {
    anchors: AnchorOption[]
    /** 遞增時聚焦文字輸入框（在畫布上雙擊文字） */
    focusText: number
  }
  let { anchors, focusText }: Props = $props()

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
      if (b) return { rect: { x: b.x, y: b.y, w: b.w, h: b.h } }
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

<section>
  <h3>新增物件</h3>
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
</section>

<section>
  <h3>背景</h3>
  <div class="inline">
    <input type="color" bind:value={project.background.color} aria-label="背景顏色" />
    <button onclick={() => bgInput.click()}>{project.background.assetId ? '更換背景圖' : '＋ 背景圖…'}</button>
    {#if project.background.assetId}
      <button onclick={() => (project.background.assetId = null)}>移除圖片</button>
    {/if}
  </div>
  {#if project.background.assetId}
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
  {/if}
  <input
    bind:this={bgInput}
    type="file"
    accept="image/*"
    hidden
    onchange={() => withImage(bgInput, ({ id }) => (project.background.assetId = id))}
  />
</section>

{#if items.length > 0}
  <section>
    <h3>物件（{items.length}）</h3>
    <ul class="items">
      {#each [...items].reverse() as o (o.uid)}
        <li class:on={ui.selectedObjects.includes(o.uid)}>
          <input type="checkbox" bind:checked={o.visible} title="顯示／隱藏" />
          <button class="name" onclick={(e) => selectObject(o.uid, e.shiftKey)}>
            {o.name}<small>{objectTypeOf(o.type)?.meta.name}</small>
          </button>
          <button class="icon" onclick={() => moveObject(o.uid, 1)} title="上移一層">↑</button>
          <button class="icon" onclick={() => moveObject(o.uid, -1)} title="下移一層">↓</button>
          <button class="icon" onclick={() => removeObject(o.uid)} title="刪除（Delete）">✕</button>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<ObjectEditor {anchors} {focusText} />

<style>
  .row {
    display: grid;
    gap: 4px;
    font-size: 13px;
  }
  section > .row + .types,
  section > .row {
    margin-bottom: 8px;
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
  .items li.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .name {
    flex: 1;
    min-width: 0;
    text-align: left;
    border: none;
    background: none;
    padding: 2px 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .name small {
    color: var(--muted);
    margin-left: 6px;
  }
  .icon {
    border: none;
    background: none;
    color: var(--muted);
    padding: 2px 4px;
  }
  .error {
    color: #c62828;
    font-size: 12px;
  }
</style>
