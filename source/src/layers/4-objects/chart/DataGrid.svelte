<script lang="ts">
  // 資料編輯：像試算表一樣直接改儲存格。
  // - 在任一格貼上從 Excel 複製的範圍，會從該格往右下展開（不夠的列、欄自動增加）
  // - Enter 移到下一列（最後一列時新增一列）
  // - 欄名上方標示該欄會被當成「類別／時間／數值／文字」，讓使用者知道圖表怎麼讀資料
  // - 可切換成文字模式，直接編輯 TSV／CSV
  import { tick } from 'svelte'
  import { columnKinds, parseTable, toTSV } from '../../../core/dataTable'

  interface Props {
    value: string
    onchange: (tsv: string) => void
    /** 表格物件時不標「類別／數值」 */
    forTable?: boolean
  }
  let { value, onchange, forTable = false }: Props = $props()

  let grid = $state<string[][]>([])
  let lastEmitted = ''
  let textMode = $state(false)
  let textValue = $state('')
  let root: HTMLDivElement

  // 外部資料改變（換了選取、復原、貼上取代）時才重設；自己送出的變更不重設，避免游標跳走
  $effect(() => {
    if (value === lastEmitted) return
    const t = parseTable(value)
    grid = t.columns.length ? [t.columns, ...t.rows] : [['項目', '數值'], ['', '']]
    textValue = value
    lastEmitted = value
  })

  const width = $derived(Math.max(1, ...grid.map((r) => r.length)))
  const kinds = $derived(columnKinds({ columns: grid[0] ?? [], rows: grid.slice(1) }))

  function kindLabel(j: number): string {
    const k = kinds[j]
    if (forTable) return k === 'number' ? '數值・靠右' : ''
    if (j === 0 && k !== 'number') return k === 'date' ? '時間（x 軸）' : '類別（x 軸）'
    return k === 'number' ? '數值' : '不使用'
  }

  function emit() {
    const tsv = toTSV({ columns: grid[0] ?? [], rows: grid.slice(1) })
    lastEmitted = tsv
    textValue = tsv
    onchange(tsv)
  }

  function set(i: number, j: number, v: string) {
    grid[i][j] = v
    emit()
  }

  function pad() {
    const w = width
    grid = grid.map((r) => [...r, ...Array(Math.max(0, w - r.length)).fill('')])
  }

  function addRow() {
    grid.push(Array(width).fill(''))
    emit()
  }
  function addCol() {
    grid = grid.map((r, i) => [...r, i === 0 ? `系列 ${width}` : ''])
    emit()
  }
  function removeRow(i: number) {
    if (grid.length <= 2) return
    grid.splice(i, 1)
    emit()
  }
  function removeCol(j: number) {
    if (width <= 1) return
    grid = grid.map((r) => r.filter((_, k) => k !== j))
    emit()
  }

  async function focusCell(i: number, j: number) {
    await tick()
    root.querySelector<HTMLInputElement>(`input[data-cell="${i}-${j}"]`)?.focus()
  }

  function onKey(e: KeyboardEvent, i: number, j: number) {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault()
      if (i === grid.length - 1) addRow()
      focusCell(i + 1, j)
    }
  }

  // 貼上多格：從這一格往右下填
  function onPaste(e: ClipboardEvent, i: number, j: number) {
    const text = e.clipboardData?.getData('text/plain') ?? ''
    if (!text.includes('\t') && !text.includes('\n')) return
    e.preventDefault()
    const block = text
      .replace(/\r\n?/g, '\n')
      .replace(/\n$/, '')
      .split('\n')
      .map((l) => l.split('\t'))
    block.forEach((row, di) => {
      while (grid.length <= i + di) grid.push(Array(width).fill(''))
      row.forEach((cell, dj) => {
        const r = grid[i + di]
        while (r.length <= j + dj) r.push('')
        r[j + dj] = cell.trim()
      })
    })
    pad()
    emit()
  }

  function onText(v: string) {
    textValue = v
    const t = parseTable(v)
    if (!t.columns.length) return
    grid = [t.columns, ...t.rows]
    lastEmitted = v
    onchange(v)
  }
</script>

<div class="grid-wrap" bind:this={root}>
  <div class="bar">
    <span class="count">{Math.max(0, grid.length - 1)} 列 × {width} 欄</span>
    <span class="modes" role="group" aria-label="編輯方式">
      <button class:on={!textMode} onclick={() => (textMode = false)}>表格</button>
      <button class:on={textMode} onclick={() => (textMode = true)}>文字</button>
    </span>
  </div>

  {#if textMode}
    <textarea
      rows="8"
      spellcheck="false"
      value={textValue}
      oninput={(e) => onText(e.currentTarget.value)}
      aria-label="資料（以 Tab 或逗號分隔，第一列為標題）"
    ></textarea>
    <p class="hint">每行一列，以 Tab 或逗號分隔；第一列是標題。</p>
  {:else}
    <div class="scroll">
      <table>
        <thead>
          <tr class="kinds">
            {#each { length: width } as _, j (j)}
              <th>
                <span class="kind" class:unused={!forTable && kindLabel(j) === '不使用'}>{kindLabel(j)}</span>
                {#if width > 1}
                  <button class="x" title="刪除這一欄" aria-label="刪除第 {j + 1} 欄" onclick={() => removeCol(j)}>×</button>
                {/if}
              </th>
            {/each}
            <th class="tail"></th>
          </tr>
        </thead>
        <tbody>
          {#each grid as row, i (i)}
            <tr class:head={i === 0}>
              {#each { length: width } as _, j (j)}
                <td>
                  <input
                    data-cell="{i}-{j}"
                    value={row[j] ?? ''}
                    class:num={i > 0 && kinds[j] === 'number'}
                    aria-label={i === 0 ? `第 ${j + 1} 欄標題` : `第 ${i} 列第 ${j + 1} 欄`}
                    oninput={(e) => set(i, j, e.currentTarget.value)}
                    onkeydown={(e) => onKey(e, i, j)}
                    onpaste={(e) => onPaste(e, i, j)}
                  />
                </td>
              {/each}
              <td class="tail">
                {#if i > 0 && grid.length > 2}
                  <button class="x" title="刪除這一列" aria-label="刪除第 {i} 列" onclick={() => removeRow(i)}>×</button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <div class="actions">
      <button onclick={addRow}>＋ 列</button>
      <button onclick={addCol}>＋ 欄</button>
    </div>
    <p class="hint">可直接在任一格貼上 Excel 範圍；按 Enter 換到下一列。</p>
  {/if}
</div>

<style>
  .grid-wrap {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    color: var(--muted);
  }
  .count {
    font-family: var(--mono);
    font-size: 11px;
  }
  .modes {
    display: inline-flex;
  }
  .modes button {
    padding: 2px 10px;
    font-size: 12px;
    border-radius: 0;
  }
  .modes button:first-child {
    border-radius: var(--radius) 0 0 var(--radius);
  }
  .modes button:last-child {
    border-radius: 0 var(--radius) var(--radius) 0;
    margin-left: -1px;
  }
  .modes button.on {
    border-color: var(--accent);
    color: var(--accent);
    position: relative;
  }
  .scroll {
    overflow: auto;
    max-height: 300px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
  }
  table {
    border-collapse: collapse;
    width: 100%;
    font-size: 12px;
  }
  th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--panel);
    padding: 3px 4px;
    text-align: left;
    font-weight: 400;
    white-space: nowrap;
    border-bottom: 1px solid var(--line);
  }
  .kind {
    font-size: 10px;
    color: var(--highlight);
  }
  .kind.unused {
    color: var(--faint);
  }
  td {
    padding: 0;
    border-bottom: 1px solid var(--line);
    border-right: 1px solid var(--line);
  }
  td input {
    width: 100%;
    min-width: 64px;
    border: none;
    border-radius: 0;
    background: transparent;
    padding: 4px 6px;
    font-size: 12px;
  }
  td input.num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  td input:focus-visible {
    box-shadow: inset 0 0 0 1px var(--accent);
    background: var(--accent-soft);
  }
  tr.head td input {
    font-weight: 700;
  }
  .tail {
    width: 22px;
    border-right: none;
    text-align: center;
  }
  button.x {
    border: none;
    background: none;
    padding: 0 4px;
    color: var(--faint);
    font-size: 13px;
    line-height: 1;
  }
  button.x:hover:not(:disabled) {
    background: none;
    color: var(--danger);
  }
  th button.x {
    float: right;
  }
  .actions {
    display: flex;
    gap: 6px;
  }
  .actions button {
    font-size: 12px;
    padding: 3px 10px;
  }
  textarea {
    width: 100%;
    font-family: var(--mono);
    font-size: 12px;
    resize: vertical;
    tab-size: 12;
  }
  .hint {
    margin: 0;
    font-size: 11px;
    color: var(--faint);
  }
</style>
