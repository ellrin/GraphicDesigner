// 有座標軸的圖表：直條、堆疊直條、折線、面積、橫條。
//
// 樣式規則（dataviz 規範）：
// - 長條有粗細上限、資料端 圓角、基線端方角；相鄰長條之間留 2px 等寬的空隙
// - 折線 2px、圓角轉折，最後一點加上實心端點與底色細環
// - 格線為淡色細實線；所有數值都已直接標出時，省略數值軸與格線
// - 文字一律用墨色（主要／次要／淡色），不使用系列顏色

import Konva from 'konva'
import { luminance } from '../../../../core/color'
import type { SeriesData } from '../../../../core/dataTable'
import { mainColor, seriesColors } from './colors'
import { decimalsOf, formatNumber, niceTicks, type Ticks } from './format'
import { legendRow, placeholder, type Box, type Kit, type LegendItem } from './kit'

export type CartesianKind = 'column' | 'stacked' | 'line' | 'area' | 'bar'

interface Paint {
  /** 第 si 個系列、第 ci 個類別的顏色 */
  color: (si: number, ci: number) => string
  /** 強調模式中被強調的系列或類別；-1 = 沒有 */
  focusSeries: number
  focusCategory: number
}

function paintOf(k: Kit, d: SeriesData): Paint {
  const p = k.ctx.props
  const colors = seriesColors(k.ctx, d.series.length)
  if (p.colorMode !== 'focus') return { color: (si) => colors[si], focusSeries: -1, focusCategory: -1 }
  const main = mainColor(k.ctx)
  const hi = Math.round(Number(p.highlight ?? 0))
  if (d.series.length === 1) {
    // 單一系列：強調某個類別；沒指定時，時間資料強調最後一期，其他強調最大值
    const vals = d.series[0].values
    let fc = hi > 0 ? Math.min(hi, vals.length) - 1 : -1
    if (fc < 0) {
      if (d.timeLike) fc = vals.length - 1
      else vals.forEach((v, i) => v !== null && (fc < 0 || v > (vals[fc] ?? -Infinity)) && (fc = i))
    }
    return { color: (_, ci) => (ci === fc ? main : k.ink.rest), focusSeries: -1, focusCategory: fc }
  }
  const fs = hi > 0 ? Math.min(hi, d.series.length) - 1 : 0
  return { color: (si) => (si === fs ? main : k.ink.rest), focusSeries: fs, focusCategory: -1 }
}

const finite = (d: SeriesData) => d.series.flatMap((s) => s.values).filter((v): v is number => v !== null && Number.isFinite(v))

export function drawCartesian(k: Kit, box: Box, d: SeriesData, kind: CartesianKind) {
  const p = k.ctx.props
  const { fs, ink } = k
  const paint = paintOf(k, d)
  const n = d.categories.length
  const ns = d.series.length
  const decimals = decimalsOf(finite(d))
  const fmtValue = (v: number) => formatNumber(v, k.fmt, { decimals, percentLike: d.percentLike })
  const b = { ...box }

  // ── 圖例：兩個以上系列才顯示（單一系列由標題說明） ──
  const legendAt = p.legend === 'none' ? null : p.legend === 'bottom' ? 'bottom' : 'top'
  if (ns >= 2 && legendAt) {
    const items: LegendItem[] = d.series.map((s, si) => ({ name: s.name, color: paint.color(si, -1), mark: kind === 'line' ? 'line' : 'box' }))
    const used = legendRow(k, items, b, legendAt)
    if (legendAt === 'top') b.y0 += used
    else b.y1 -= used
  }
  if (k.unit) {
    k.text({ x: b.x0, y: b.y0, text: `單位：${k.unit}`, size: fs * 0.82, fill: ink.muted })
    b.y0 += fs * 1.35
  }

  if (kind === 'bar') return drawBars(k, b, d, paint, fmtValue)

  // ── 數值範圍 ──
  const vals = finite(d)
  let lo: number
  let hi: number
  if (kind === 'stacked') {
    lo = 0
    hi = Math.max(0, ...d.categories.map((_, ci) => d.series.reduce((a, s) => a + Math.max(0, s.values[ci] ?? 0), 0)))
  } else if (kind === 'line' && !p.zeroBase) {
    lo = Math.min(...vals)
    hi = Math.max(...vals)
    const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.1 || 1
    lo -= pad
    hi += pad
  } else {
    lo = Math.min(0, ...vals)
    hi = Math.max(0, ...vals)
  }

  // ── 數值標籤：哪些點要直接標數字 ──
  const mode = String(p.labels ?? 'auto')
  const isBar = kind === 'column' || kind === 'stacked'
  const labelAll = mode === 'all' || (mode === 'auto' && kind === 'column' && ns === 1 && n <= 12)
  const lastIndex = (vals: (number | null)[]) => {
    for (let i = vals.length - 1; i >= 0; i--) if (vals[i] !== null) return i
    return -1
  }

  // 折線的尾端標籤（數值；少於 5 個系列時加上系列名稱）需要預留右側空間
  const endLabels = !isBar && (mode === 'auto' || mode === 'ends') && ns <= 4
  const endText = (si: number) => {
    const s = d.series[si]
    const li = lastIndex(s.values)
    if (li < 0) return ''
    const v = fmtValue(s.values[li]!)
    return ns > 1 ? `${s.name} ${v}` : v
  }
  const endW = endLabels ? Math.max(0, ...d.series.map((_, si) => k.width(endText(si), fs * 0.9))) : 0

  // 每個值都標出來時，數值軸與格線都可以省略
  const everyValueLabeled = labelAll && isBar && ns === 1
  const showAxis = !everyValueLabeled
  const headroom = labelAll || kind === 'stacked' ? fs * 1.5 : fs * 0.6

  // ── 版面：先估計繪圖區高度求刻度，再依刻度文字寬度決定左邊界 ──
  const catW = Math.max(0, ...d.categories.map((c) => k.width(c, fs * 0.88)))
  let xLabelH = fs * 1.7
  const estH = b.y1 - xLabelH - (b.y0 + headroom)
  let ticks: Ticks = niceTicks(lo, hi, estH / (fs * 2.8))
  if (kind !== 'line' || p.zeroBase) {
    // 長條與面積從 0 開始
    ticks = niceTicks(Math.min(0, lo), Math.max(0, hi), estH / (fs * 2.8))
  }
  const tickText = (v: number) => formatNumber(v, k.fmt === 'auto' ? 'auto' : k.fmt, { decimals: ticks.decimals, percentLike: d.percentLike })
  const yLabelW = showAxis ? Math.max(...ticks.values.map((t) => k.width(tickText(t), fs * 0.85))) + fs * 0.6 : 0
  const x0 = b.x0 + yLabelW
  const x1 = b.x1 - (endLabels ? endW + fs * 1.1 : fs * 0.2)
  if (x1 - x0 < fs * 2) return tooSmall(k, box)

  // x 位置：長條用等寬欄位，折線用點（兩端內縮半個標籤寬）
  const band = (x1 - x0) / Math.max(1, n)
  let xs: number[]
  if (isBar || n === 1) xs = d.categories.map((_, i) => x0 + band * (i + 0.5))
  else {
    const inset = Math.max(fs * 0.6, Math.min(catW / 2, (x1 - x0) * 0.1))
    const step = (x1 - x0 - inset * 2) / (n - 1)
    xs = d.categories.map((_, i) => x0 + inset + step * i)
  }
  const slot = n > 1 ? Math.abs(xs[1] - xs[0]) : x1 - x0

  // x 軸標籤：放得下就一行；長條圖可換成兩行；還是放不下就每隔幾個標一次
  let wrap = false
  let every = 1
  if (catW > slot * 0.94) {
    if (isBar && catW <= slot * 1.85) {
      wrap = true
      xLabelH = fs * 2.7
    } else every = Math.ceil((catW + fs * 0.8) / slot)
  }

  // 負值的數字標在長條下方，要和 x 軸標籤隔開
  const footroom = isBar && vals.some((v) => v < 0) && (labelAll || mode !== 'none') ? fs * 1.4 : 0
  const y0 = b.y0 + headroom
  const y1 = b.y1 - xLabelH - footroom
  if (y1 - y0 < fs * 2) return tooSmall(k, box)
  const y = (v: number) => y1 - ((v - ticks.min) / (ticks.max - ticks.min)) * (y1 - y0)
  const zeroV = Math.min(Math.max(0, ticks.min), ticks.max)
  const yZero = y(zeroV)
  const hair = fs * 0.07

  // ── 格線與刻度 ──
  if (showAxis) {
    for (const t of ticks.values) {
      const ty = y(t)
      if (p.grid !== false && Math.abs(t - zeroV) > 1e-9) {
        k.out.push(new Konva.Line({ points: [x0, ty, b.x1, ty], stroke: ink.grid, strokeWidth: hair, listening: false }))
      }
      k.text({ x: x0 - fs * 0.6, y: ty, text: tickText(t), size: fs * 0.85, fill: ink.muted, anchor: 'end', baseline: 'middle' })
    }
  }

  // ── x 軸標籤 ──
  d.categories.forEach((c, i) => {
    const show = i % every === 0 || (i === n - 1 && (n - 1) % every >= every / 2)
    if (!show) return
    if (wrap) {
      const t = new Konva.Text({
        x: xs[i] - slot * 0.48,
        y: y1 + footroom + fs * 0.55,
        width: slot * 0.96,
        text: c,
        fontSize: fs * 0.88,
        fontFamily: k.family,
        fill: ink.secondary,
        align: 'center',
        wrap: 'char',
        lineHeight: 1.15,
        height: fs * 2.1,
        ellipsis: true,
        listening: false,
      })
      k.out.push(t)
    } else {
      k.text({ x: xs[i], y: y1 + footroom + fs * 0.55, text: c, size: fs * 0.88, anchor: 'middle', maxWidth: every > 1 ? slot * every : slot * 1.1 })
    }
  })

  const labelAt = (x: number, yy: number, v: number, below = false) =>
    k.text({ x, y: below ? yy + fs * 0.35 : yy - fs * 0.35, text: fmtValue(v), size: fs * 0.88, fill: ink.primary, anchor: 'middle', baseline: below ? 'top' : 'bottom' })

  if (kind === 'column') drawColumns(k, d, paint, xs, band, y, yZero, labelAll, mode, labelAt)
  else if (kind === 'stacked') drawStacked(k, d, paint, xs, band, y, yZero, mode, fmtValue, labelAt)
  else drawLines(k, d, paint, xs, y, yZero, kind === 'area', mode, endLabels, endText, lastIndex)

  // 基線（0）畫在長條上方，讓每根長條都有一致的起點
  k.out.push(new Konva.Line({ points: [x0, yZero, b.x1, yZero], stroke: ink.baseline, strokeWidth: fs * 0.09, listening: false }))
}

/** 繪圖區放不下時：清掉已畫的圖例等，改顯示提示（避免只剩半張圖） */
function tooSmall(k: Kit, box: Box) {
  k.out.splice(1)
  if (box.y1 - box.y0 >= k.fs * 1.2) placeholder(k, box, '框太小：請把物件拉大，或縮小字級')
}

/** 長條寬度：佔欄位的比例（barWidth），並設上限，避免少量資料時長條過粗 */
function barThickness(k: Kit, slot: number, count: number) {
  const ratio = Number(k.ctx.props.barWidth ?? 0.6)
  const gap = k.fs * 0.18
  const cap = k.fs * 2.4 * (ratio / 0.6)
  const each = Math.min(cap, (slot * ratio - gap * (count - 1)) / count)
  return { each: Math.max(each, k.fs * 0.2), gap }
}

const radiusOf = (k: Kit, thick: number, len: number) => Math.max(0, Math.min(thick / 2, len, k.fs * 0.5 * 2 * Number(k.ctx.props.radius ?? 0.5)))

function drawColumns(
  k: Kit,
  d: SeriesData,
  paint: Paint,
  xs: number[],
  band: number,
  y: (v: number) => number,
  yZero: number,
  labelAll: boolean,
  mode: string,
  labelAt: (x: number, y: number, v: number, below?: boolean) => void,
) {
  const ns = d.series.length
  const { each, gap } = barThickness(k, band, ns)
  const groupW = each * ns + gap * (ns - 1)
  // 最大值與最後一個值（labels = ends 時標示）
  d.series.forEach((s, si) => {
    const lastI = s.values.reduce<number>((a, v, i) => (v !== null ? i : a), -1)
    s.values.forEach((v, ci) => {
      if (v === null) return
      const x = xs[ci] - groupW / 2 + si * (each + gap)
      const yv = y(v)
      const top = Math.min(yv, yZero)
      const hgt = Math.abs(yv - yZero)
      const r = radiusOf(k, each, hgt)
      k.out.push(
        new Konva.Rect({
          x,
          y: top,
          width: each,
          height: hgt,
          fill: paint.color(si, ci),
          cornerRadius: v >= 0 ? [r, r, 0, 0] : [0, 0, r, r],
          listening: false,
        }),
      )
      const focused = paint.focusCategory === ci || paint.focusSeries === si
      const show =
        mode === 'none'
          ? false
          : mode === 'ends'
            ? ci === lastI
            : paint.focusCategory >= 0 || paint.focusSeries >= 0
              ? focused && (labelAll || mode === 'auto')
              : labelAll
      if (show) labelAt(x + each / 2, yv, v, v < 0)
    })
  })
}

function drawStacked(
  k: Kit,
  d: SeriesData,
  paint: Paint,
  xs: number[],
  band: number,
  y: (v: number) => number,
  yZero: number,
  mode: string,
  fmtValue: (v: number) => string,
  labelAt: (x: number, y: number, v: number) => void,
) {
  const { each, gap } = barThickness(k, band, 1)
  d.categories.forEach((_, ci) => {
    const parts = d.series.map((s) => Math.max(0, s.values[ci] ?? 0))
    const topIndex = parts.reduce((a, v, i) => (v > 0 ? i : a), -1)
    let cum = 0
    parts.forEach((v, si) => {
      if (v <= 0) return
      const yTop = y(cum + v)
      const yBottom = cum > 0 ? y(cum) - gap : yZero
      cum += v
      const hgt = yBottom - yTop
      if (hgt <= 0) return
      const r = si === topIndex ? radiusOf(k, each, hgt) : 0
      const fill = paint.color(si, ci)
      k.out.push(
        new Konva.Rect({ x: xs[ci] - each / 2, y: yTop, width: each, height: hgt, fill, cornerRadius: [r, r, 0, 0], listening: false }),
      )
      // labels = all：放得下才在區段內標數字（字色依底色深淺）
      if (mode === 'all') {
        const text = fmtValue(v)
        if (hgt >= k.fs * 1.3 && k.width(text, k.fs * 0.8) <= each - k.fs * 0.4) {
          const light = fill.startsWith('#') && luminance(fill) < 0.4
          k.text({ x: xs[ci], y: yTop + hgt / 2, text, size: k.fs * 0.8, fill: light ? '#ffffff' : '#0b0b0b', anchor: 'middle', baseline: 'middle' })
        }
      }
    })
    if (mode !== 'none' && cum > 0) labelAt(xs[ci], y(cum), cum)
  })
}

function drawLines(
  k: Kit,
  d: SeriesData,
  paint: Paint,
  xs: number[],
  y: (v: number) => number,
  yZero: number,
  area: boolean,
  mode: string,
  endLabels: boolean,
  endText: (si: number) => string,
  lastIndex: (v: (number | null)[]) => number,
) {
  const { fs, ink } = k
  const p = k.ctx.props
  const lw = fs * 0.2
  const smooth = !!p.smooth
  // 強調模式：未強調的系列先畫（在下層）
  const order = d.series.map((_, i) => i).sort((a, b) => (a === paint.focusSeries ? 1 : 0) - (b === paint.focusSeries ? 1 : 0))
  const ends: { si: number; x: number; y: number }[] = []

  for (const si of order) {
    const s = d.series[si]
    // 單一系列的強調模式：線維持主色，另外把強調的那一點標出來
    const color = paint.focusCategory >= 0 ? mainColor(k.ctx) : paint.color(si, -1)
    // 缺值處斷開
    const runs: { x: number; y: number }[][] = []
    let run: { x: number; y: number }[] = []
    s.values.forEach((v, i) => {
      if (v === null) {
        if (run.length) runs.push(run)
        run = []
      } else run.push({ x: xs[i], y: y(v) })
    })
    if (run.length) runs.push(run)

    for (const pts of runs) {
      if (area && pts.length > 1) {
        const top = smooth ? monotonePath(pts) : `M${pts.map((q) => `${q.x},${q.y}`).join('L')}`
        const data = `${top}L${pts[pts.length - 1].x},${yZero}L${pts[0].x},${yZero}Z`
        k.out.push(new Konva.Path({ data, fill: color, opacity: 0.12, listening: false }))
      }
      if (pts.length === 1) continue
      if (smooth) k.out.push(new Konva.Path({ data: monotonePath(pts), stroke: color, strokeWidth: lw, lineJoin: 'round', lineCap: 'round', listening: false }))
      else k.out.push(new Konva.Line({ points: pts.flatMap((q) => [q.x, q.y]), stroke: color, strokeWidth: lw, lineJoin: 'round', lineCap: 'round', listening: false }))
    }

    const dot = (x: number, yy: number, r: number) =>
      k.out.push(new Konva.Circle({ x, y: yy, radius: r, fill: color, stroke: ink.surface, strokeWidth: fs * 0.14, listening: false }))
    if (p.markers) s.values.forEach((v, i) => v !== null && dot(xs[i], y(v), fs * 0.28))
    const fc = paint.focusCategory
    if (fc >= 0 && s.values[fc] !== null && fc !== lastIndex(s.values)) {
      dot(xs[fc], y(s.values[fc]!), fs * 0.38)
      k.text({ x: xs[fc], y: y(s.values[fc]!) - fs * 0.6, text: formatAll(k, s.values[fc]!, d), size: fs * 0.9, fill: ink.primary, weight: 500, anchor: 'middle', baseline: 'bottom' })
    }
    const li = lastIndex(s.values)
    if (li >= 0) {
      dot(xs[li], y(s.values[li]!), fs * 0.38)
      ends.push({ si, x: xs[li], y: y(s.values[li]!) })
    }
    if (mode === 'all') {
      s.values.forEach((v, i) => {
        if (v === null || i === li) return
        k.text({ x: xs[i], y: y(v) - fs * 0.55, text: formatAll(k, v, d), size: fs * 0.8, fill: ink.secondary, anchor: 'middle', baseline: 'bottom' })
      })
    }
  }

  // 尾端標籤：彼此太近時不硬擠（改由圖例辨識）
  if (endLabels && ends.length) {
    const sorted = [...ends].sort((a, b) => a.y - b.y)
    const crowded = sorted.some((e, i) => i > 0 && e.y - sorted[i - 1].y < fs * 1.05)
    if (!crowded) {
      for (const e of ends) {
        k.text({ x: e.x + fs * 0.7, y: e.y, text: endText(e.si), size: fs * 0.9, fill: ink.primary, weight: 500, baseline: 'middle' })
      }
    }
  }
}

function formatAll(k: Kit, v: number, d: SeriesData) {
  const decimals = decimalsOf(finite(d))
  return formatNumber(v, k.fmt, { decimals, percentLike: d.percentLike })
}

/** 單調三次曲線（Fritsch–Carlson）：平滑但不會超過資料點，避免誤導 */
export function monotonePath(pts: { x: number; y: number }[]): string {
  const n = pts.length
  if (n < 3) return `M${pts.map((q) => `${q.x},${q.y}`).join('L')}`
  const dx: number[] = []
  const m: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x)
    m.push((pts[i + 1].y - pts[i].y) / (dx[i] || 1))
  }
  const t: number[] = [m[0]]
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]))
  t.push(m[n - 2])
  let path = `M${pts[0].x},${pts[0].y}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    path += `C${pts[i].x + h},${pts[i].y + t[i] * h} ${pts[i + 1].x - h},${pts[i + 1].y - t[i + 1] * h} ${pts[i + 1].x},${pts[i + 1].y}`
  }
  return path
}

/** 橫條圖：類別在左、長條向右，數值標在長條末端 */
function drawBars(k: Kit, b: Box, d: SeriesData, paint: Paint, fmtValue: (v: number) => string) {
  const { fs, ink } = k
  const p = k.ctx.props
  const n = d.categories.length
  const ns = d.series.length
  const mode = String(p.labels ?? 'auto')
  const labelAll = mode === 'all' || (mode === 'auto' && ns === 1)
  const vals = finite(d)
  const lo = Math.min(0, ...vals)
  const hi = Math.max(0, ...vals)

  const catW = Math.min(Math.max(0, ...d.categories.map((c) => k.width(c, fs * 0.88))), (b.x1 - b.x0) * 0.35)
  const valueW = labelAll ? Math.max(0, ...vals.map((v) => k.width(fmtValue(v), fs * 0.88))) + fs * 0.5 : fs * 0.3
  const showAxis = !(labelAll && ns === 1)
  const axisH = showAxis ? fs * 1.7 : 0
  const x0 = b.x0 + catW + fs * 0.7
  const x1 = b.x1 - valueW
  const y0 = b.y0
  const y1 = b.y1 - axisH
  if (x1 - x0 < fs * 2 || y1 - y0 < fs) return tooSmall(k, b)
  const ticks = niceTicks(lo, hi, (x1 - x0) / (fs * 5.5))
  const x = (v: number) => x0 + ((v - ticks.min) / (ticks.max - ticks.min)) * (x1 - x0)
  const xZero = x(Math.min(Math.max(0, ticks.min), ticks.max))
  const row = (y1 - y0) / n
  const { each, gap } = barThickness(k, row, ns)
  const groupH = each * ns + gap * (ns - 1)

  if (showAxis) {
    for (const t of ticks.values) {
      const tx = x(t)
      if (p.grid !== false && Math.abs(tx - xZero) > 1e-6) {
        k.out.push(new Konva.Line({ points: [tx, y0, tx, y1], stroke: ink.grid, strokeWidth: fs * 0.07, listening: false }))
      }
      const text = formatNumber(t, k.fmt, { decimals: ticks.decimals, percentLike: d.percentLike })
      k.text({ x: tx, y: y1 + fs * 0.55, text, size: fs * 0.85, fill: ink.muted, anchor: 'middle' })
    }
  }

  d.categories.forEach((c, ci) => {
    const cy = y0 + row * (ci + 0.5)
    k.text({ x: x0 - fs * 0.7, y: cy, text: c, size: fs * 0.88, anchor: 'end', baseline: 'middle', maxWidth: catW })
    d.series.forEach((s, si) => {
      const v = s.values[ci]
      if (v === null) return
      const top = cy - groupH / 2 + si * (each + gap)
      const xv = x(v)
      const len = Math.abs(xv - xZero)
      const r = radiusOf(k, each, len)
      k.out.push(
        new Konva.Rect({
          x: Math.min(xv, xZero),
          y: top,
          width: len,
          height: each,
          fill: paint.color(si, ci),
          cornerRadius: v >= 0 ? [0, r, r, 0] : [r, 0, 0, r],
          listening: false,
        }),
      )
      const focused = paint.focusCategory === ci || paint.focusSeries === si
      const show = mode === 'none' ? false : paint.focusCategory >= 0 || paint.focusSeries >= 0 ? focused : labelAll
      if (show) {
        k.text({
          x: v >= 0 ? xv + fs * 0.35 : xv - fs * 0.35,
          y: top + each / 2,
          text: fmtValue(v),
          size: fs * 0.88,
          fill: ink.primary,
          anchor: v >= 0 ? 'start' : 'end',
          baseline: 'middle',
        })
      }
    })
  })
  k.out.push(new Konva.Line({ points: [xZero, y0, xZero, y1], stroke: ink.baseline, strokeWidth: fs * 0.09, listening: false }))
}
