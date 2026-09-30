// 圖表與表格共用的資料表。
//
// 物件的 props 只能放純值（ParamValue：數字、布林、字串、座標），所以資料一律以 TSV 字串
// 存在 props.data。TSV 是從 Excel／Google 試算表複製時剪貼簿裡的格式，貼上即可使用，
// 存檔、復原也不需要特別處理。
//
// 這個檔案不依賴 Konva 與 Svelte，可單獨測試，也可直接搬到 GraphicDesigner。

export interface DataTable {
  /** 第一列（標題列） */
  columns: string[]
  /** 其餘各列；每列長度與 columns 相同 */
  rows: string[][]
}

export type ColumnKind = 'number' | 'date' | 'text'

/** 圖表用的資料：類別（x 軸）＋ 一或多個數值系列 */
export interface SeriesData {
  categories: string[]
  series: { name: string; values: (number | null)[] }[]
  /** 類別看起來是時間（月份、年份、日期、季、週） */
  timeLike: boolean
  /** 數值原本帶有 % */
  percentLike: boolean
}

// ── 解析 ─────────────────────────────────────────────────

/** 依第一列判斷分隔符號：有 Tab 用 Tab（試算表複製），否則逗號或分號較多者 */
function delimiterOf(text: string): string {
  const first = text.split('\n').find((l) => l.trim()) ?? ''
  if (first.includes('\t')) return '\t'
  const count = (ch: string) => first.split(ch).length - 1
  return count(';') > count(',') ? ';' : ','
}

/** 解析 CSV／TSV（支援雙引號包住的欄位、欄位內換行、"" 跳脫） */
function splitCells(text: string, delim: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else cell += ch
      continue
    }
    if (ch === '"' && cell.trim() === '') {
      quoted = true
      cell = ''
    } else if (ch === delim) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  row.push(cell)
  rows.push(row)
  return rows
}

/** 文字（TSV、CSV）→ 資料表。空白列略過，列長不一時補空字串。 */
export function parseTable(text: string): DataTable {
  const clean = String(text ?? '')
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
  const raw = splitCells(clean, delimiterOf(clean))
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some((c) => c !== ''))
  if (!raw.length) return { columns: [], rows: [] }
  const width = Math.max(...raw.map((r) => r.length))
  const pad = (r: string[]) => [...r, ...Array(width - r.length).fill('')]
  return { columns: pad(raw[0]), rows: raw.slice(1).map(pad) }
}

/** 資料表 → TSV（儲存格內的 Tab、換行改成空白） */
export function toTSV(t: DataTable): string {
  const cell = (s: string) => String(s ?? '').replace(/[\t\n\r]+/g, ' ')
  return [t.columns, ...t.rows].map((r) => r.map(cell).join('\t')).join('\n')
}

const FULL_WIDTH = /[０-９．－＋，％]/g
const HALF: Record<string, string> = { '．': '.', '－': '-', '＋': '+', '，': ',', '％': '%' }

/**
 * 儲存格 → 數字。接受千分位、全形數字、貨幣符號、結尾 %；
 * 空白與「-」「—」「N/A」視為缺值（null）；其他文字（含單位，例如「14.2 g/dL」）回傳 undefined。
 */
export function parseNumber(s: string): number | null | undefined {
  let v = String(s ?? '').trim()
  if (v === '' || /^(-|—|–|n\/?a|na|null|無)$/i.test(v)) return null
  v = v.replace(FULL_WIDTH, (ch) => HALF[ch] ?? String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
  v = v.replace(/^(NT\$|US\$|\$|¥|€|£)/i, '').replace(/元$/, '')
  v = v.replace(/,(?=\d{3}(\D|$))/g, '').replace(/\s+/g, '')
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?%?$/i.test(v)) return undefined
  return Number.parseFloat(v.replace('%', ''))
}

const TIME_PATTERNS = [
  /^\d{4}([-/.年]\d{1,2}([-/.月]\d{1,2}日?)?月?)?$/, // 2024、2024-03、2024/03/15、2024年3月
  /^\d{1,2}[/-]\d{1,2}$/, // 3/15
  /^(\d{1,2}|[一二三四五六七八九十]+|十[一二])月(份)?$/, // 3月、三月
  /^(\d{4}\s*)?Q[1-4]$/i, // Q1、2024 Q1
  /^(\d{4}年?\s*)?第?[一二三四1-4]季$/, // 第一季
  /^第?\d+週$/, // 第3週
  /^(週|星期|禮拜)[一二三四五六日天]$/,
  /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(\s*\d{2,4})?$/i,
  /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?$/i,
  /^\d{1,2}:\d{2}$/, // 08:00
  /^(民國)?\d{2,3}年$/, // 113年
]

const isTimeLabel = (s: string) => TIME_PATTERNS.some((re) => re.test(s.trim()))

/** 全部是 1900–2100 的整數（當作年份，而不是數值） */
const looksLikeYears = (cells: string[]) =>
  cells.length > 1 && cells.every((c) => /^(19|20)\d{2}$/.test(c.trim()))

/** 各欄的類型：一欄中所有非空儲存格都能轉成數字 → number；看起來像時間 → date；否則 text */
export function columnKinds(t: DataTable): ColumnKind[] {
  return t.columns.map((_, j) => {
    const cells = t.rows.map((r) => r[j]).filter((c) => c !== '')
    if (!cells.length) return 'text'
    if (looksLikeYears(cells)) return 'date'
    if (cells.every((c) => parseNumber(c) !== undefined)) return 'number'
    if (cells.every(isTimeLabel)) return 'date'
    return 'text'
  })
}

/**
 * 資料表 → 圖表資料。
 * - 第一欄是文字或時間 → 當作類別；其餘的數值欄各是一個系列
 * - 全部是數值 → 以列號當類別
 * - 只有一列資料、沒有類別欄（橫向貼上的一排）→ 標題列當類別，該列是唯一系列
 */
export function toSeries(t: DataTable): SeriesData {
  const kinds = columnKinds(t)
  const percentLike = t.rows.some((r) => r.some((c) => /%|％$/.test(c)))
  const values = (j: number) => t.rows.map((r) => parseNumber(r[j]) ?? null)

  // 橫向一排：「一月 二月 三月」／「72 70 71」
  if (t.rows.length === 1 && t.columns.length > 2 && kinds.every((k) => k === 'number')) {
    const heads = t.columns
    return {
      categories: heads,
      series: [{ name: '數值', values: t.rows[0].map((c) => parseNumber(c) ?? null) }],
      timeLike: heads.every(isTimeLabel),
      percentLike,
    }
  }

  const hasCategory = kinds[0] !== 'number' || t.columns.length === 1
  const start = hasCategory ? 1 : 0
  const categories = hasCategory ? t.rows.map((r) => r[0]) : t.rows.map((_, i) => String(i + 1))
  const series = t.columns
    .map((name, j) => ({ name: name || `系列 ${j}`, j }))
    .filter(({ j }) => j >= start && kinds[j] === 'number')
    .map(({ name, j }) => ({ name, values: values(j) }))
  return { categories, series, timeLike: hasCategory && kinds[0] === 'date', percentLike }
}

// ── 建議圖表 ─────────────────────────────────────────────

export type ChartKind = 'column' | 'bar' | 'line' | 'area' | 'stacked' | 'donut' | 'kpi'

export interface Suggestion {
  kind: ChartKind | 'table'
  reason: string
}

/** 依資料形狀建議圖表類型（插入、貼上時預設使用，編輯時顯示為提示） */
export function suggestChart(t: DataTable): Suggestion {
  const d = toSeries(t)
  const n = d.categories.length
  const k = d.series.length
  if (!k || !n) return { kind: 'table', reason: '沒有可以畫成圖的數值欄，建議用表格' }
  if (n === 1 && k === 1) return { kind: 'kpi', reason: '只有一個數字，建議用大數字呈現' }
  if (d.timeLike && n >= 3) return { kind: 'line', reason: '第一欄是時間，建議用折線圖看趨勢' }
  if (k === 1) {
    const vals = d.series[0].values.filter((v): v is number => v !== null)
    const sum = vals.reduce((a, b) => a + b, 0)
    const parts = vals.every((v) => v >= 0) && n >= 2 && n <= 6
    if (parts && (d.percentLike || Math.abs(sum - 100) <= 1)) return { kind: 'donut', reason: '各項加總為 100%，建議用甜甜圈圖看占比' }
    const longLabels = d.categories.reduce((a, c) => a + c.length, 0) / n > 6
    if (longLabels || n > 10) return { kind: 'bar', reason: '類別名稱較長或項目較多，建議用橫條圖' }
    return { kind: 'column', reason: '比較各項大小，建議用直條圖' }
  }
  if (n > 10) return { kind: 'line', reason: '項目較多且有多個系列，建議用折線圖' }
  return { kind: 'column', reason: `${k} 個系列並排比較，建議用直條圖` }
}

// ── 其他來源 ─────────────────────────────────────────────

const cellText = (v: unknown) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v))

/**
 * JSON 值 → 資料表。接受：
 * - 文字（TSV／CSV）
 * - `{ columns, rows }`
 * - 陣列的陣列（第一列為標題）
 * - 物件陣列（鍵為欄名），包含 report_template_3 的 `[{ name, value }]`
 * 無法辨識時回傳 null。
 */
export function tableFromValue(v: unknown): DataTable | null {
  if (typeof v === 'string') {
    const t = parseTable(v)
    return t.columns.length ? t : null
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as { columns?: unknown; rows?: unknown; headers?: unknown }
    const cols = Array.isArray(o.columns) ? o.columns : Array.isArray(o.headers) ? o.headers : null
    if (cols && Array.isArray(o.rows)) {
      const columns = cols.map(cellText)
      const rows = (o.rows as unknown[]).filter(Array.isArray).map((r) => columns.map((_, j) => cellText((r as unknown[])[j])))
      return { columns, rows }
    }
    return null
  }
  if (!Array.isArray(v) || !v.length) return null
  if (v.every(Array.isArray)) {
    const width = Math.max(...v.map((r) => (r as unknown[]).length))
    const rows = v.map((r) => Array.from({ length: width }, (_, j) => cellText((r as unknown[])[j])))
    return { columns: rows[0], rows: rows.slice(1) }
  }
  if (v.every((r) => r && typeof r === 'object')) {
    const keys: string[] = []
    for (const r of v as Record<string, unknown>[]) for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k)
    // report_template_3 的 DataPoint：name／value 顯示成中文欄名
    const label = (k: string) => (keys.length === 2 && k === 'name' ? '項目' : keys.length === 2 && k === 'value' ? '數值' : k)
    return {
      columns: keys.map(label),
      rows: (v as Record<string, unknown>[]).map((r) => keys.map((k) => cellText(r[k]))),
    }
  }
  return null
}

/**
 * 資料表 → 給資料庫／後端的 JSON：兩欄時輸出 report_template_3 相容的 `[{ name, value }]`，
 * 其他輸出物件陣列（能轉成數字的欄位輸出數字）。
 */
export function tableToValue(t: DataTable): unknown {
  const kinds = columnKinds(t)
  const cell = (s: string, j: number) => (kinds[j] === 'number' ? (parseNumber(s) ?? null) : s)
  if (t.columns.length === 2 && kinds[1] === 'number') return t.rows.map((r) => ({ name: r[0], value: cell(r[1], 1) }))
  return t.rows.map((r) => Object.fromEntries(t.columns.map((c, j) => [c || `欄${j + 1}`, cell(r[j], j)])))
}

/** 剪貼簿文字是否像一張表（至少兩列兩欄、且有數字）：用來判斷貼上時要不要建立圖表 */
export function looksLikeTable(text: string): boolean {
  if (!text || text.length > 200_000) return false
  const t = parseTable(text)
  if (t.columns.length < 2 || t.rows.length < 1) return false
  if (!text.includes('\t') && !text.includes(',') && !text.includes(';')) return false
  return columnKinds(t).some((k) => k === 'number') || (t.rows.length === 1 && t.columns.length > 2)
}
