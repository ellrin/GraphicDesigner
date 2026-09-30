import Konva from 'konva'
import { luminance } from '../../../../core/color'
import { columnKinds, parseTable } from '../../../../core/dataTable'
import type { ParamValues } from '../../../../core/params'
import type { ShapeBuilder } from '../index'
import { frameOf, hitArea, makeKit, placeholder, titleAndNote } from '../chart/kit'

/** 表格專屬、由編輯區控制的屬性預設值（與圖表共用資料編輯器） */
export const TABLE_DEFAULTS: ParamValues = {
  data: ['項目\t結果\t參考值', '血紅素\t14.2 g/dL\t13.5–17.5', '空腹血糖\t95 mg/dL\t70–100', '總膽固醇\t182 mg/dL\t< 200', '三酸甘油酯\t121 mg/dL\t< 150'].join('\n'),
  title: '',
  note: '',
  unit: '',
  fontFamily: 'Noto Sans TC',
  fontSize: 0.0115,
}

// 表格：欄寬依內容比例分配並撐滿物件框；數值欄靠右對齊。
// 內容比框大時依 fit 設定縮小字級，或截斷並在最後一列註明還有幾列。
const build: ShapeBuilder = (ctx) => {
  const k = makeKit(ctx)
  hitArea(k)
  const p = ctx.props
  const box = titleAndNote(k, frameOf(ctx))
  const t = parseTable(String(p.data ?? ''))
  if (!t.columns.length) {
    placeholder(k, box, '請在右側貼上或輸入表格資料')
    return k.out
  }
  const header = p.header !== false
  const body = header ? t.rows : [t.columns, ...t.rows]
  const kinds = columnKinds(header ? t : { columns: t.columns.map(() => ''), rows: body })
  const cols = t.columns.length
  const W = box.x1 - box.x0
  const H = box.y1 - box.y0

  // 自然尺寸（字級 = fs）→ 求縮放比例
  const pad = (s: number) => s * 0.6
  const rowH = (s: number) => s * 1.95
  const natural = (s: number) =>
    Array.from({ length: cols }, (_, j) => {
      const cells = body.map((r) => k.width(r[j] ?? '', s, p.firstBold && j === 0 ? 700 : 400))
      if (header) cells.push(k.width(t.columns[j] ?? '', s, 700))
      return Math.max(s * 1.5, ...cells) + pad(s) * 2
    })
  const totalRows = body.length + (header ? 1 : 0)
  let s = k.fs
  if (p.fit !== 'clip') {
    const sumW = natural(s).reduce((a, b) => a + b, 0)
    const f = Math.min(1, W / sumW, H / (rowH(s) * totalRows))
    s = k.fs * Math.max(0.7, f)
  }
  const nat = natural(s)
  const sumW = nat.reduce((a, b) => a + b, 0)
  // 欄寬：多出的空間依比例分給各欄；不夠時等比例壓縮（儲存格內以 … 截斷）
  const widths = nat.map((w) => (w / sumW) * W)
  const rh = rowH(s)
  const maxRows = Math.max(0, Math.floor(H / rh))

  const dark = p.ink === 'light'
  const lineColor = k.ink.grid
  const hair = k.fs * 0.07
  const xs = widths.reduce<number[]>((acc, w, j) => [...acc, acc[j] + w], [box.x0])
  let yy = box.y0

  const cell = (text: string, j: number, y: number, opts: { weight?: number; fill?: string } = {}) => {
    const right = kinds[j] === 'number'
    k.text({
      x: right ? xs[j + 1] - pad(s) : xs[j] + pad(s),
      y: y + rh / 2,
      text,
      size: s,
      weight: opts.weight ?? (p.firstBold && j === 0 ? 700 : 400),
      fill: opts.fill ?? k.ink.primary,
      anchor: right ? 'end' : 'start',
      baseline: 'middle',
      maxWidth: widths[j] - pad(s) * 2,
    })
  }

  // 標題列
  if (header && maxRows > 0) {
    const filled = p.headerStyle === 'fill'
    const bg = ctx.fill || '#2a78d6'
    if (filled) k.out.push(new Konva.Rect({ x: box.x0, y: yy, width: W, height: rh, fill: bg, cornerRadius: s * 0.25, listening: false }))
    const fg = filled ? (luminance(bg) < 0.4 ? '#ffffff' : '#0b0b0b') : k.ink.primary
    t.columns.forEach((c, j) => cell(c, j, yy, { weight: 700, fill: fg }))
    yy += rh
    if (!filled) k.out.push(new Konva.Line({ points: [box.x0, yy, box.x1, yy], stroke: k.ink.baseline, strokeWidth: k.fs * 0.12, listening: false }))
  }

  // 資料列（放不下時最後一列改成「還有 N 列」）
  const room = maxRows - (header ? 1 : 0)
  const overflow = body.length > room
  const shown = overflow ? Math.max(0, room - 1) : body.length
  for (let i = 0; i < shown; i++) {
    if (p.zebra && i % 2 === 1) {
      k.out.push(new Konva.Rect({ x: box.x0, y: yy, width: W, height: rh, fill: dark ? 'rgba(255,255,255,0.06)' : 'rgba(11,11,11,0.04)', listening: false }))
    }
    body[i].forEach((c, j) => cell(c, j, yy))
    yy += rh
    if (p.rules !== 'none' && i < shown - 1) {
      k.out.push(new Konva.Line({ points: [box.x0, yy, box.x1, yy], stroke: lineColor, strokeWidth: hair, listening: false }))
    }
  }
  if (overflow && room > 0) {
    k.text({ x: box.x0 + pad(s), y: yy + rh / 2, text: `⋯ 還有 ${body.length - shown} 列未顯示`, size: s * 0.9, fill: k.ink.muted, baseline: 'middle' })
    yy += rh
  }

  if (p.rules === 'grid') {
    const top = box.y0
    for (let j = 1; j < cols; j++) k.out.push(new Konva.Line({ points: [xs[j], top, xs[j], yy], stroke: lineColor, strokeWidth: hair, listening: false }))
    k.out.push(new Konva.Rect({ x: box.x0, y: top, width: W, height: yy - top, stroke: lineColor, strokeWidth: hair, listening: false }))
  } else if (p.rules !== 'none' && shown > 0) {
    k.out.push(new Konva.Line({ points: [box.x0, yy, box.x1, yy], stroke: k.ink.baseline, strokeWidth: hair, listening: false }))
  }
  return k.out
}
export default build
