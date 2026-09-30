<script lang="ts">
  // 選取圖表或表格時的編輯區：換類型（用目前的資料即時預覽）、改資料、文字與樣式。
  // 與 GraphicDesigner 的 ObjectEditor 並列：位置、尺寸、不透明度等通用設定仍由 ObjectEditor 處理。
  import { parseTable, suggestChart, tableFromValue, toSeries } from '../../../core/dataTable'
  import { fontSizeFromDisplay, fontSizeToDisplay, fontUnitLabel } from '../../../core/objects'
  import type { ParamSchema, ParamValue } from '../../../core/params'
  import { paletteOf } from '../../../core/palettes'
  import { project, updateObject } from '../../../core/store.svelte'
  import Fold from '../../../ui/Fold.svelte'
  import FontSelect from '../../../ui/FontSelect.svelte'
  import ParamPanel from '../../../ui/ParamPanel.svelte'
  import Swatches from '../../../ui/Swatches.svelte'
  import { objectTypeOf } from '../types'
  import { CHART_KINDS } from '../types/chart/shape'
  import { SAMPLES } from '../types/chart/samples'
  import { paletteWarning, seriesColors } from '../types/chart/colors'
  import { TABLE_DEFAULTS } from '../types/table/shape'
  import ChartThumb from './ChartThumb.svelte'
  import DataGrid from './DataGrid.svelte'
  import { convert, kindName, replaceData, type InsertKind } from './insert'

  interface Props {
    uid: string
  }
  let { uid }: Props = $props()

  const o = $derived(project.objects.items.find((x) => x.uid === uid))
  const type = $derived(o && objectTypeOf(o.type))
  const isTable = $derived(o?.type === 'table')
  const current = $derived<InsertKind>(isTable ? 'table' : ((o?.props.kind as InsertKind) ?? 'column'))
  const c = $derived(project.canvas)
  const palette = $derived(paletteOf(project.palette)?.colors ?? [])
  const data = $derived(String(o?.props.data ?? ''))
  const table = $derived(parseTable(data))
  const series = $derived(toSeries(table))
  const suggestion = $derived(suggestChart(table))

  let fileInput: HTMLInputElement | undefined = $state()
  let message = $state('')

  function setProp(key: string, v: ParamValue) {
    if (o) updateObject(o.uid, { props: { ...o.props, [key]: v } })
  }

  /** params.json 的 when：只顯示與目前類型、配色模式相關的設定 */
  function visible(schema: ParamSchema, props: Record<string, unknown>): ParamSchema {
    return Object.fromEntries(
      Object.entries(schema).filter(([, spec]) => {
        const when = (spec as { when?: Record<string, string[]> }).when
        return !when || Object.entries(when).every(([k, vals]) => vals.includes(String(props[k])))
      }),
    )
  }
  const schema = $derived(o && type ? visible(type.params, o.props) : {})

  // 顏色太接近的提醒（只在用專案配色時檢查；標準配色已驗證過）
  const warning = $derived.by(() => {
    if (!o || isTable || o.props.colorMode !== 'palette') return ''
    const n = current === 'donut' ? series.categories.length : series.series.length
    if (n < 2) return ''
    return paletteWarning(
      seriesColors({ w: 1, h: 1, props: o.props, fill: o.fill, stroke: '', strokeWidth: 0, canvasH: 1, palette }, Math.min(n, 8)),
    )
  })

  const shape = $derived.by(() => {
    if (isTable) return `${table.rows.length} 列 × ${table.columns.length} 欄`
    if (!series.series.length) return '沒有數值欄'
    return `${series.categories.length} 個類別 × ${series.series.length} 個系列`
  })

  async function pasteFromClipboard() {
    if (!o) return
    try {
      const text = await navigator.clipboard.readText()
      const t = parseTable(text)
      if (!t.columns.length) {
        message = '剪貼簿裡沒有資料'
        return
      }
      message = replaceData(o.uid, t)
    } catch {
      message = '瀏覽器不允許讀取剪貼簿：請改在表格任一格按 Ctrl+V'
    }
  }

  async function onFile() {
    const file = fileInput?.files?.[0]
    if (fileInput) fileInput.value = ''
    if (!file || !o) return
    try {
      const text = await file.text()
      let t = parseTable(text)
      if (/\.json$/i.test(file.name) || /^\s*[[{]/.test(text)) {
        const json = JSON.parse(text)
        const found = tableFromValue(json?.data ?? json?.values ?? json)
        if (!found) throw new Error('無法辨識 JSON 中的資料')
        t = found
      }
      message = replaceData(o.uid, t)
    } catch (e) {
      message = e instanceof Error ? e.message : '無法讀取檔案'
    }
  }

  // 目前的類型也適合這份資料時不提示（例如時間資料用面積圖或直條圖也可以）
  const FITS: Record<InsertKind, InsertKind[]> = {
    line: ['line', 'area', 'column', 'stacked', 'kpi'],
    column: ['column', 'bar', 'stacked', 'line', 'area', 'kpi'],
    bar: ['bar', 'column', 'kpi'],
    donut: ['donut', 'column', 'bar'],
    kpi: ['kpi'],
    table: ['table'],
    area: ['area', 'line'],
    stacked: ['stacked', 'column'],
  }
  const fits = (cur: InsertKind, suggested: InsertKind) => FITS[suggested]?.includes(cur) ?? true

  const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d
  const KINDS: InsertKind[] = [...CHART_KINDS.map((k) => k.id), 'table']
</script>

{#if o && type}
  <div class="chart-editor">
    <div class="kinds" role="radiogroup" aria-label="圖表類型">
      {#each KINDS as k (k)}
        <button class="kind" class:on={k === current} role="radio" aria-checked={k === current} onclick={() => convert(o.uid, k)}>
          {#if k === 'table'}
            <ChartThumb type="table" props={{ ...TABLE_DEFAULTS, data, ink: o.props.ink }} fill={o.fill} {palette} width={62} height={42} />
          {:else}
            <ChartThumb type="chart" props={{ ...o.props, kind: k }} fill={o.fill} {palette} width={62} height={42} />
          {/if}
          <span>{kindName(k)}</span>
        </button>
      {/each}
    </div>
    {#if !fits(current, suggestion.kind)}
      <p class="suggest">
        建議改用<b>{kindName(suggestion.kind)}</b>：{suggestion.reason}
        <button class="link" onclick={() => convert(o.uid, suggestion.kind)}>改用</button>
      </p>
    {/if}

    <div class="texts">
      <label class="row">
        <span>標題</span>
        <input value={String(o.props.title ?? '')} placeholder="（不顯示）" oninput={(e) => setProp('title', e.currentTarget.value)} />
      </label>
      <div class="two">
        {#if !isTable}
          <label class="row">
            <span>單位</span>
            <input value={String(o.props.unit ?? '')} placeholder="例如 mmHg" oninput={(e) => setProp('unit', e.currentTarget.value)} />
          </label>
        {/if}
        <label class="row">
          <span>註腳</span>
          <input value={String(o.props.note ?? '')} placeholder="資料來源、說明" oninput={(e) => setProp('note', e.currentTarget.value)} />
        </label>
      </div>
    </div>

    <div class="block">
      <div class="head">
        <b>資料</b>
        <small>{shape}</small>
      </div>
      <DataGrid value={data} onchange={(v) => setProp('data', v)} forTable={isTable} />
      <div class="tools">
        <button onclick={pasteFromClipboard}>從剪貼簿取代</button>
        <button onclick={() => fileInput?.click()}>匯入檔案…</button>
        {#if !isTable}
          <button onclick={() => setProp('data', SAMPLES[current as keyof typeof SAMPLES] ?? data)}>範例資料</button>
        {/if}
      </div>
      {#if message}<p class="msg" role="status">{message}</p>{/if}
      <input bind:this={fileInput} type="file" accept=".csv,.tsv,.txt,.json,text/csv,application/json" hidden onchange={onFile} />
    </div>

    <div class="block">
      <div class="head"><b>{isTable ? '樣式' : '配色與樣式'}</b></div>
      <div class="main-color">
        <label class="inline">
          <input type="color" value={o.fill || '#2a78d6'} oninput={(e) => updateObject(o.uid, { fill: e.currentTarget.value })} aria-label="主色" />
          <span>{isTable ? '主色（標題列底色）' : '主色（第一個系列／強調色）'}</span>
        </label>
        <Swatches value={o.fill} onpick={(color) => updateObject(o.uid, { fill: color })} />
      </div>
      {#if warning}<p class="warn" role="alert">{warning}</p>{/if}
      {#key o.type + current}
        <ParamPanel {schema} bind:values={o.props} />
      {/key}
    </div>

    <div class="folds">
      <Fold id="chart-font" title="字型">
        <FontSelect value={String(o.props.fontFamily)} onchange={(f) => setProp('fontFamily', f)} />
        <label class="row">
          <span>基本字級（{fontUnitLabel(c)}）；標題、刻度等依比例放大縮小</span>
          <input
            type="number"
            min="1"
            step="0.5"
            value={round(fontSizeToDisplay(Number(o.props.fontSize), c))}
            onchange={(e) => {
              const v = Number(e.currentTarget.value)
              if (v > 0) setProp('fontSize', fontSizeFromDisplay(v, c))
            }}
          />
        </label>
      </Fold>
    </div>
  </div>
{/if}

<style>
  .chart-editor {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
  }
  .kinds {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 5px;
  }
  .kind {
    display: grid;
    justify-items: center;
    gap: 3px;
    padding: 4px 2px 3px;
    font-size: 11px;
    color: var(--muted);
  }
  .kind.on {
    border-color: var(--accent);
    color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .suggest {
    margin: 0;
    padding: 6px 8px;
    border: 1px dashed var(--highlight);
    border-radius: var(--radius);
    font-size: 12px;
    color: var(--muted);
  }
  .suggest b {
    color: var(--highlight);
    margin: 0 2px;
  }
  .suggest .link {
    margin-left: 6px;
    font-size: 12px;
  }
  .texts {
    display: grid;
    gap: 8px;
  }
  .row {
    display: grid;
    gap: 4px;
    font-size: 13px;
  }
  .row input {
    width: 100%;
    min-width: 0;
  }
  .two {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 8px;
  }
  .block {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    font-size: 13px;
  }
  .head small {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--faint);
  }
  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .tools button {
    font-size: 12px;
    padding: 4px 10px;
  }
  .msg {
    margin: 0;
    font-size: 12px;
    color: var(--ok);
  }
  .warn {
    margin: 0;
    font-size: 12px;
    color: var(--highlight);
  }
  .main-color {
    display: grid;
    gap: 6px;
  }
  .inline {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }
  input[type='color'] {
    width: 36px;
    height: 26px;
    padding: 0;
  }
</style>
