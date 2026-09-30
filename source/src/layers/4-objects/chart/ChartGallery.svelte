<script lang="ts">
  // 「插入圖表」面板：
  // 1. 點縮圖 → 以範例資料插入該類型，接著在右側改資料
  // 2. 把 Excel 範圍貼到貼上框 → 依資料形狀自動選類型
  // 3. 匯入 CSV／TSV／JSON 檔（也可以直接拖進貼上框）
  // 放置位置由上層決定（畫布中央、選取的區塊…），與 GD「新增物件」的放置位置共用。
  import { paletteOf } from '../../../core/palettes'
  import { project, type Placement } from '../../../core/store.svelte'
  import { CHART_DEFAULTS, CHART_KINDS } from '../types/chart/shape'
  import { KIND_PRESETS, SAMPLES } from '../types/chart/samples'
  import { TABLE_DEFAULTS } from '../types/table/shape'
  import ChartThumb from './ChartThumb.svelte'
  import { insertChart, insertFromFile, insertFromText, kindName, type InsertKind, type InsertResult } from './insert'

  interface Props {
    /** 目前的放置位置 */
    placement: () => Placement
    /** 插入後通知上層（例如捲到編輯區） */
    oninserted?: (uid: string) => void
  }
  let { placement, oninserted }: Props = $props()

  const palette = $derived(paletteOf(project.palette)?.colors ?? [])
  const main = $derived(
    palette.find((c) => {
      const n = parseInt(c.slice(1), 16)
      const l = ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11
      return l > 40 && l < 170
    }) ?? '#2a78d6',
  )
  let message = $state('')
  let error = $state(false)
  let fileInput: HTMLInputElement
  let dragging = $state(false)

  function add(kind: InsertKind) {
    const uid = insertChart(kind, placement())
    if (uid) oninserted?.(uid)
    report(`已插入${kindName(kind)}（範例資料），在右側改成你的資料`)
  }

  function report(text: string, isError = false) {
    message = text
    error = isError
  }

  function done(results: InsertResult[]) {
    const first = results[0]
    if (first?.uid) oninserted?.(first.uid)
    if (results.length > 1) report(`已插入 ${results.length} 張圖表`)
    else if (first) report(`已插入${kindName(first.kind)}${first.reason ? `：${first.reason}` : ''}`)
  }

  function onPaste(e: ClipboardEvent) {
    const text = e.clipboardData?.getData('text/plain') ?? ''
    e.preventDefault()
    const r = insertFromText(text, placement())
    if (r) done([r])
    else report('貼上的內容看起來不是表格：需要至少兩欄、一列數字（可從 Excel 直接複製範圍）', true)
  }

  async function onFiles(files: FileList | null | undefined) {
    const file = files?.[0]
    if (!file) return
    try {
      done(await insertFromFile(file, placement()))
    } catch (err) {
      report(err instanceof Error ? err.message : '無法讀取檔案', true)
    }
  }

  function downloadSample() {
    const sample = {
      charts: [
        { chartType: 'line', title: '血壓趨勢', unit: 'mmHg', data: [{ 月份: '1月', 收縮壓: 138, 舒張壓: 88 }, { 月份: '2月', 收縮壓: 131, 舒張壓: 85 }, { 月份: '3月', 收縮壓: 124, 舒張壓: 80 }] },
        { chartType: 'column', title: '門診人次', data: [{ name: '內科', value: 1280 }, { name: '外科', value: 860 }, { name: '兒科', value: 640 }] },
        { type: 'table', title: '檢驗結果', data: [['項目', '結果', '參考值'], ['血紅素', '14.2 g/dL', '13.5–17.5']] },
      ],
    }
    const blob = new Blob([JSON.stringify(sample, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'charts-sample.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const KINDS: InsertKind[] = [...CHART_KINDS.map((k) => k.id), 'table']
</script>

<div class="gallery">
  <div class="tiles">
    {#each KINDS as k (k)}
      <button class="tile" onclick={() => add(k)} title="插入{kindName(k)}">
        {#if k === 'table'}
          <ChartThumb type="table" props={TABLE_DEFAULTS} fill={main} {palette} width={100} height={64} />
        {:else}
          <ChartThumb type="chart" props={{ ...CHART_DEFAULTS, ...KIND_PRESETS[k], kind: k, data: SAMPLES[k] }} fill={main} {palette} width={100} height={64} />
        {/if}
        <span>{kindName(k)}</span>
      </button>
    {/each}
  </div>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="paste"
    class:dragging
    tabindex="0"
    role="textbox"
    aria-label="貼上表格資料或拖入檔案"
    onpaste={onPaste}
    ondragover={(e) => {
      e.preventDefault()
      dragging = true
    }}
    ondragleave={() => (dragging = false)}
    ondrop={(e) => {
      e.preventDefault()
      dragging = false
      onFiles(e.dataTransfer?.files)
    }}
  >
    <b>貼上 Excel 範圍</b>
    <span>點這裡後按 Ctrl+V，或把 CSV／JSON 檔拖進來，會依資料自動選擇圖表類型</span>
  </div>
  <div class="tools">
    <button onclick={() => fileInput.click()}>匯入檔案…</button>
    <button class="link" onclick={downloadSample}>下載 JSON 範例</button>
  </div>
  {#if message}<p class="msg" class:error role="status">{message}</p>{/if}
  <input bind:this={fileInput} type="file" accept=".csv,.tsv,.txt,.json,text/csv,application/json" hidden onchange={(e) => onFiles(e.currentTarget.files).then(() => (e.currentTarget.value = ''))} />
</div>

<style>
  .gallery {
    display: grid;
    gap: 10px;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(106px, 1fr));
    gap: 6px;
  }
  .tile {
    display: grid;
    justify-items: center;
    gap: 4px;
    padding: 4px 3px 5px;
    font-size: 12px;
  }
  .tile:hover:not(:disabled) {
    border-color: var(--accent);
  }
  .paste {
    display: grid;
    gap: 2px;
    padding: 12px;
    border: 1px dashed var(--line-strong);
    border-radius: var(--radius);
    font-size: 12px;
    color: var(--muted);
    cursor: text;
    outline: none;
  }
  .paste b {
    color: var(--text);
    font-size: 13px;
  }
  .paste:focus,
  .paste.dragging {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .tools button:not(.link) {
    font-size: 12px;
    padding: 4px 10px;
  }
  .msg {
    margin: 0;
    font-size: 12px;
    color: var(--ok);
  }
  .msg.error {
    color: var(--danger);
  }
</style>
