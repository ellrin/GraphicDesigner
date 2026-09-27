<script lang="ts">
  import { BLOCK_ROLES, roleOf, type Suggestion } from '../../core/blocks'
  import {
    addBlock,
    duplicateBlock,
    moveBlock,
    project,
    removeBlock,
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

<section>
  <h3>區塊</h3>
  <p class="tip">在畫布空白處<strong>拖曳</strong>即可畫出區塊；拖曳、縮放時會吸附到構圖線、錨點與畫布中線。</p>
  <button class="add" onclick={() => addBlock()}>＋ 新增區塊</button>

  {#if items.length > 0}
    <ul class="items">
      {#each [...items].reverse() as b (b.uid)}
        <li class:on={b.uid === ui.selectedBlock}>
          <input type="checkbox" bind:checked={b.visible} title="顯示／隱藏" />
          <span class="dot" style:background={b.color}></span>
          <button class="name" onclick={() => (ui.selectedBlock = b.uid)}>
            {b.name}<small>{roleOf(b.role).label}</small>
          </button>
          <button class="icon" onclick={() => moveBlock(b.uid, 1)} title="上移一層">↑</button>
          <button class="icon" onclick={() => moveBlock(b.uid, -1)} title="下移一層">↓</button>
          <button class="icon" onclick={() => removeBlock(b.uid)} title="刪除（Delete）">✕</button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

{#if selected}
  <section class="editor">
    <h3>選取的區塊</h3>
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
    <div class="row">
      <span>外觀</span>
      <span class="inline">
        <label><input type="checkbox" bind:checked={selected.filled} /> 填色</label>
        <input type="color" bind:value={selected.color} aria-label="顏色" />
      </span>
    </div>
    {#if selected.filled}
      <label class="row">
        <span>不透明度 {Math.round(selected.opacity * 100)}%</span>
        <input type="range" min="0.05" max="1" step="0.05" bind:value={selected.opacity} />
      </label>
    {/if}
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
      <button onclick={() => duplicateBlock(selected.uid)}>複製</button>
      <button onclick={() => removeBlock(selected.uid)}>刪除</button>
    </div>
  </section>
{/if}

<section>
  <h3>建議區塊</h3>
  <p class="tip muted">
    依目前的構圖、視覺引導與錨點計算，只是參考。滑鼠移到按鈕上會在畫布預覽，點一下即採用，之後可再調整。
  </p>
  <label class="inline"><input type="checkbox" bind:checked={project.visibility.suggestions} /> 在畫布上顯示全部建議</label>
  {#each sources as src (src)}
    <div class="group">
      <h4>{src}</h4>
      <div class="chips">
        {#each suggestions.map((s, i) => [s, i] as const).filter(([s]) => s.source === src) as [s, i] (i)}
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
    </div>
  {/each}
</section>

<style>
  .tip {
    margin: 0 0 10px;
    font-size: 12px;
    color: var(--accent);
  }
  .tip.muted {
    color: var(--muted);
    margin-top: 6px;
  }
  .add {
    width: 100%;
  }
  .items {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  .items li {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 6px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface);
  }
  .items li.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 3px;
    flex: none;
    margin-right: 4px;
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
  .group h4 {
    margin: 10px 0 6px;
    font-size: 12px;
    font-weight: 600;
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
