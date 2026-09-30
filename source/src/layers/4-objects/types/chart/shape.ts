import type { ParamValues } from '../../../../core/params'
import { parseTable, toSeries, type ChartKind } from '../../../../core/dataTable'
import type { ShapeBuilder } from '../index'
import { drawCartesian } from './cartesian'
import { drawDonut, drawKpi } from './radial'
import { frameOf, hitArea, makeKit, placeholder, titleAndNote } from './kit'
import { SAMPLES } from './samples'

/**
 * 圖表專屬、由圖表編輯區（而非 params.json）控制的屬性預設值。
 * 與文字物件的 TEXT_DEFAULTS 相同做法：這些值不適合用滑桿調整（文字、資料、字級單位）。
 */
export const CHART_DEFAULTS: ParamValues = {
  kind: 'column',
  /** 資料（TSV，第一列為標題）；見 core/dataTable.ts */
  data: SAMPLES.column,
  title: '',
  /** 註腳：資料來源、說明 */
  note: '',
  /** 單位，例如 mmHg、人次 */
  unit: '',
  fontFamily: 'Noto Sans TC',
  /** 基本字級，相對畫布高度（A4 約 9.5pt） */
  fontSize: 0.0115,
}

export const CHART_KINDS: { id: ChartKind; name: string }[] = [
  { id: 'column', name: '直條圖' },
  { id: 'bar', name: '橫條圖' },
  { id: 'line', name: '折線圖' },
  { id: 'area', name: '面積圖' },
  { id: 'stacked', name: '堆疊直條' },
  { id: 'donut', name: '甜甜圈' },
  { id: 'kpi', name: '大數字' },
]

// 圖表物件：框內依資料重新排版（不是拉伸），所以縮放後文字大小、線條粗細維持不變。
const build: ShapeBuilder = (ctx) => {
  const k = makeKit(ctx)
  hitArea(k)
  const kind = String(ctx.props.kind ?? 'column') as ChartKind
  const box = titleAndNote(k, frameOf(ctx))
  const d = toSeries(parseTable(String(ctx.props.data ?? '')))
  if (!d.series.length || !d.categories.length) {
    placeholder(k, box, '沒有可畫的數值：請在右側貼上或輸入資料')
    return k.out
  }
  if (kind === 'donut') drawDonut(k, box, d)
  else if (kind === 'kpi') drawKpi(k, box, d, !!String(ctx.props.title ?? '').trim())
  else drawCartesian(k, box, d, kind)
  return k.out
}
export default build
