<script lang="ts">
  import Section from '../../ui/Section.svelte'
  import Fold from '../../ui/Fold.svelte'
  import { BLOCK_ROLES, BLOCK_SHAPES, roleOf, type BlockShape, type Suggestion } from '../../core/blocks'
  import {
    addBlock,
    duplicateBlock,
    moveBlock,
    project,
    removeBlock,
    setBlockShape,
    ui,
    updateBlock,
  } from '../../core/store.svelte'

  interface Props {
    suggestions: Suggestion[]
    onadopt: (s: Suggestion) => void
  }
  let { suggestions, onadopt }: Props = $props()

  const items = $derived(project.blocks.items)
  const selected = $derived(items.find((b) => b.uid === ui.selectedBlock))
  const c = $derived(project.canvas)
  const sources = $derived([...new Set(suggestions.map((s) => s.source))])

  const round = (n: number) => Math.round(n * 10) / 10

  /** 位置與尺寸以畫布單位（mm 或 px）顯示，內部存 0–1。 */
  function setDim(axis: 'x' | 'y' | 'w' | 'h', input: HTMLInputElement) {
    if (!selected) return
    const total = axis === 'x' || axis === 'w' ? c.w : c.h
    const v = Number(input.value)
    if (input.value.trim() !== '' && Number.isFinite(v) && (axis === 'x' || axis === 'y' || v > 0)) {
      updateBlock(selected.uid, { [axis]: v / total })
    }
    input.value = String(round(selected[axis] * total))
  }

  function setRole(role: string) {
    if (!selected) return
    const old = roleOf(selected.role)
    // 顏色還是舊用途的預設色時，跟著換成新用途的顏色
    updateBlock(selected.uid, { role, ...(selected.color === old.color ? { color: roleOf(role).color } : {}) })
  }
</script>

<Section
  id="blocks-1"
  title="繪製區塊"
  help={ui.blockTool === 'polygon'
    ? '在畫布上逐點點擊畫出多邊形，點回第一點、雙擊或按 Enter 完成，Esc 取消。頂點會吸附到錨點與線的交點。'
    : `在畫布空白處拖曳即可畫出${ui.blockTool === 'ellipse' ? '橢圓（圓形）' : '矩形'}區塊；拖曳、縮放時會吸附到構圖線、錨點與畫布中線。區塊清單與上下順序在右側「圖層與排序」。`}
>
  <div class="seg" role="radiogroup" aria-label="繪製形狀">
    {#each BLOCK_SHAPES as s (s.id)}
      <button class:on={ui.blockTool === s.id} onclick={() => (ui.blockTool = s.id)}>{s.label}</button>
    {/each}
  </div>
  <button class="add" onclick={() => addBlock(null, 'subject', '', { shape: ui.blockTool === 'ellipse' ? 'ellipse' : 'rect' })}>＋ 新增區塊</button>
</Section>

{#if selected}
  <Section
    id="blocks-2"
    title="選取的區塊"
    reopen={selected.uid}
    help={selected.shape === 'polygon' ? '拖曳畫布上的白色頂點可調整多邊形形狀。' : undefined}
  >
  <div class="editor">
    <label class="row">
      <span>名稱</span>
      <input type="text" bind:value={selected.name} />
    </label>
    <label class="row">
      <span>用途</span>
      <select value={selected.role} onchange={(e) => setRole(e.currentTarget.value)}>
        {#each BLOCK_ROLES as r (r.id)}
          <option value={r.id}>{r.label}</option>
        {/each}
      </select>
    </label>
    <div class="folds">
      <Fold id="blk-look" title="形狀與外觀">
        <label class="row">
          <span>形狀</span>
          <select value={selected.shape} onchange={(e) => setBlockShape(selected.uid, e.currentTarget.value as BlockShape)}>
            {#each BLOCK_SHAPES as s (s.id)}
              <option value={s.id}>{s.label}</option>
            {/each}
          </select>
        </label>
        <span class="inline">
          <label><input type="checkbox" bind:checked={selected.filled} /> 填色</label>
          <input type="color" bind:value={selected.color} aria-label="顏色" />
        </span>
        {#if selected.filled}
          <label class="row">
            <span>不透明度 {Math.round(selected.opacity * 100)}%</span>
            <input type="range" min="0.05" max="1" step="0.05" bind:value={selected.opacity} />
          </label>
        {/if}
      </Fold>
      <Fold id="blk-pos" title="位置與尺寸">
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
          <small class="unit">單位：{c.unit}</small>
        </div>
        <div class="tools">
          <button onclick={() => updateBlock(selected.uid, { x: (1 - selected.w) / 2 })}>水平置中</button>
          <button onclick={() => updateBlock(selected.uid, { y: (1 - selected.h) / 2 })}>垂直置中</button>
        </div>
      </Fold>
    </div>
    <div class="tools">
      <button onclick={() => duplicateBlock(selected.uid)}>複製</button>
      <button onclick={() => removeBlock(selected.uid)}>刪除</button>
    </div>
  </div>
</Section>
{/if}

<Section id="blocks-3" title="建議區塊" help="依目前的構圖、視覺引導與錨點計算，只是參考。滑鼠移到按鈕上會在畫布預覽，點一下即採用，之後可再調整。">
  <label class="inline show-all"><input type="checkbox" bind:checked={project.visibility.suggestions} /> 在畫布上顯示全部建議</label>
  {#each sources as src (src)}
    {@const list = suggestions.map((s, i) => [s, i] as const).filter(([s]) => s.source === src)}
    <Fold title={src} count={list.length}>
      <div class="chips">
        {#each list as [s, i] (i)}
          <button
            onclick={() => onadopt(s)}
            onmouseenter={() => (ui.hoverSuggestion = i)}
            onmouseleave={() => (ui.hoverSuggestion = null)}
            onfocus={() => (ui.hoverSuggestion = i)}
            onblur={() => (ui.hoverSuggestion = null)}
            title="採用為區塊"
          >
            <span class="dot" style:background={roleOf(s.role ?? 'other').color}></span>{s.label}
          </button>
        {/each}
      </div>
    </Fold>
  {/each}
</Section>

<style>
  .add {
    width: 100%;
  }
  .seg {
    display: flex;
    margin-bottom: 8px;
  }
  .seg button {
    flex: 1;
    font-size: 12px;
    border-radius: 0;
  }
  .seg button + button {
    border-left: none;
  }
  .seg button:first-child {
    border-radius: var(--radius) 0 0 var(--radius);
  }
  .seg button:last-child {
    border-radius: 0 var(--radius) var(--radius) 0;
  }
  .seg button.on {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--text);
  }
  .show-all {
    margin-bottom: 8px;
  }
  .dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 3px;
    flex: none;
    margin-right: 4px;
  }
  .editor {
    display: grid;
    gap: 10px;
  }
  .row {
    display: grid;
    gap: 4px;
    font-size: 13px;
  }
  .inline {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }
  input[type='text'] {
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 5px 9px;
  }
  input[type='color'] {
    width: 36px;
    height: 26px;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 4px;
    background: none;
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
  .folds {
    border-bottom: 1px dashed var(--line);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .chips button {
    display: inline-flex;
    align-items: center;
    font-size: 12px;
    padding: 3px 8px;
  }
</style>
