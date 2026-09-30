// 插入圖表的所有入口共用這裡：面板按鈕、貼上、拖放檔案、匯入 JSON。
// 只依賴 store 的 addObject／updateObject／project（GraphicDesigner 有相同名稱與簽章）。

import { looksLikeTable, parseTable, suggestChart, tableFromValue, toTSV, type ChartKind, type DataTable } from '../../../core/dataTable'
import type { ParamValues } from '../../../core/params'
import { addObject, project, updateObject, type Placement } from '../../../core/store.svelte'
import { CHART_DEFAULTS, CHART_KINDS } from '../types/chart/shape'
import { KIND_PRESETS, SAMPLES } from '../types/chart/samples'
import { TABLE_DEFAULTS } from '../types/table/shape'

export type InsertKind = ChartKind | 'table'

export const kindName = (k: InsertKind) => (k === 'table' ? '表格' : (CHART_KINDS.find((x) => x.id === k)?.name ?? '圖表'))

/** 大數字與表格的預設框比例和一般圖表不同 */
const SIZE: Partial<Record<InsertKind, [number, number]>> = { kpi: [0.3, 0.2], donut: [0.6, 0.36], table: [0.8, 0.3] }

function placementFor(kind: InsertKind, placement: Placement): Placement {
  if (placement.rect) return placement
  const size = SIZE[kind]
  if (!size) return placement
  const c = project.canvas
  const short = Math.min(c.w, c.h)
  const w = (size[0] * short) / c.w
  const h = (size[1] * short) / c.h
  const ctr = placement.center ?? { x: 0.5, y: 0.5 }
  return { ...placement, rect: { x: ctr.x - w / 2, y: ctr.y - h / 2, w, h } }
}

/**
 * 新增圖表或表格。
 * data 省略時使用該類型的範例資料（插入後立刻看到完整的圖，再改數字）。
 */
export function insertChart(kind: InsertKind, placement: Placement = {}, data?: string, extra: ParamValues = {}): string | null {
  const at = placementFor(kind, placement)
  if (kind === 'table') return addObject('table', at, { ...TABLE_DEFAULTS, ...(data ? { data } : {}), ...extra })
  // 範例資料附帶的單位等設定只在使用範例資料時套用
  const props: ParamValues = { ...CHART_DEFAULTS, ...(data ? {} : KIND_PRESETS[kind]), kind, data: data ?? SAMPLES[kind], ...extra }
  return addObject('chart', at, props)
}

export interface InsertResult {
  uid: string | null
  kind: InsertKind
  reason: string
}

/** 由一張資料表插入：依資料形狀自動選圖表類型 */
export function insertTable(t: DataTable, placement: Placement = {}, extra: ParamValues = {}): InsertResult {
  const s = suggestChart(t)
  return { uid: insertChart(s.kind, placement, toTSV(t), extra), kind: s.kind, reason: s.reason }
}

/** 剪貼簿文字 → 圖表。不像表格時回傳 null（交給一般的貼上處理） */
export function insertFromText(text: string, placement: Placement = {}): InsertResult | null {
  if (!looksLikeTable(text)) return null
  return insertTable(parseTable(text), placement)
}

/**
 * 以新資料取代既有圖表／表格的資料（選取圖表時貼上）。
 * 保留類型與樣式；回傳給使用者看的結果說明（新資料畫不出圖時提示改成表格）。
 */
export function replaceData(uid: string, t: DataTable): string {
  const o = project.objects.items.find((x) => x.uid === uid)
  if (!o) return ''
  const data = toTSV(t)
  if (o.type === 'table') {
    updateObject(uid, { props: { ...o.props, data } })
    return '已更新表格資料'
  }
  const s = suggestChart(t)
  if (s.kind === 'table') {
    updateObject(uid, { props: { ...o.props, data } })
    return '資料中沒有數值欄，圖表無法顯示（可改成表格）'
  }
  updateObject(uid, { props: { ...o.props, data } })
  return `已更新圖表資料（${t.rows.length} 列、${t.columns.length} 欄）`
}

/** 圖表 ↔ 表格互換（資料、標題都保留） */
export function convert(uid: string, to: InsertKind) {
  const o = project.objects.items.find((x) => x.uid === uid)
  if (!o) return
  const keep = { data: o.props.data, title: o.props.title, note: o.props.note, unit: o.props.unit, fontFamily: o.props.fontFamily, fontSize: o.props.fontSize }
  if (to === 'table') {
    if (o.type === 'table') return
    updateObject(uid, { type: 'table', props: { ...TABLE_DEFAULTS, ...keep } })
  } else if (o.type === 'table') {
    updateObject(uid, { type: 'chart', props: { ...CHART_DEFAULTS, ...keep, kind: to } })
  } else {
    updateObject(uid, { props: { ...o.props, kind: to } })
  }
}

// ── 檔案 ────────────────────────────────────────────────

interface ChartEntry {
  type?: string
  chartType?: string
  kind?: string
  title?: string
  unit?: string
  note?: string
  data?: unknown
}

const LEGACY_KIND: Record<string, InsertKind> = { bar: 'column', pie: 'donut', line: 'line' }

/**
 * 讀取檔案並插入：
 * - .csv／.tsv／.txt：一張資料表
 * - .json：資料陣列（含 report_template_3 的 [{ name, value }]）、{ chartType, title, data }、
 *   或 { charts: [...] }／{ content: [...] } 的多張圖（各自往下排）
 */
export async function insertFromFile(file: File, placement: Placement = {}): Promise<InsertResult[]> {
  const text = await file.text()
  if (!/\.json$/i.test(file.name) && !text.trim().startsWith('{') && !text.trim().startsWith('[')) {
    const t = parseTable(text)
    if (!t.columns.length) throw new Error('檔案裡沒有資料')
    return [insertTable(t, placement)]
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('檔案不是正確的 JSON 格式')
  }
  const list = entriesOf(json)
  if (!list.length) throw new Error('找不到可以畫成圖表的資料（請參考範例檔格式）')
  return list.map((e, i) => {
    const t = tableFromValue(e.data)
    if (!t) throw new Error(`第 ${i + 1} 筆資料無法辨識`)
    const at = i === 0 || placement.rect ? placement : { center: { x: 0.5, y: Math.min(0.9, 0.3 + i * 0.25) } }
    const extra: ParamValues = {}
    if (e.title) extra.title = e.title
    if (e.unit) extra.unit = e.unit
    if (e.note) extra.note = e.note
    const wanted = e.chartType ?? e.kind
    if (e.type === 'table') return { uid: insertChart('table', at, toTSV(t), extra), kind: 'table' as const, reason: '' }
    if (wanted) {
      const kind = (LEGACY_KIND[wanted] ?? (CHART_KINDS.some((k) => k.id === wanted) ? wanted : 'column')) as InsertKind
      return { uid: insertChart(kind, at, toTSV(t), extra), kind, reason: '' }
    }
    return insertTable(t, at, extra)
  })
}

function entriesOf(json: unknown): ChartEntry[] {
  if (Array.isArray(json)) {
    // 陣列本身就是資料，或是多張圖的清單
    if (json.every((x) => x && typeof x === 'object' && 'data' in (x as object))) return json as ChartEntry[]
    return [{ data: json }]
  }
  if (!json || typeof json !== 'object') return []
  const o = json as Record<string, unknown>
  for (const key of ['charts', 'content']) {
    if (Array.isArray(o[key])) return (o[key] as ChartEntry[]).filter((e) => e && (e.type === 'chart' || e.type === 'table' || 'data' in e))
  }
  if ('data' in o) return [o as ChartEntry]
  if ('columns' in o && 'rows' in o) return [{ data: o }]
  return []
}
