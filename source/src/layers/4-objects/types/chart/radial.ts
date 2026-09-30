// 甜甜圈（內徑 0 = 圓餅）與大數字（KPI）。

import Konva from 'konva'
import type { SeriesData } from '../../../../core/dataTable'
import { mainColor, seriesColors } from './colors'
import { decimalsOf, formatNumber } from './format'
import type { Box, Kit } from './kit'

/**
 * 甜甜圈：只用第一個系列。圖上不放文字，名稱與百分比放在旁邊的圖例（避免標籤被裁切）；
 * 各片之間留固定寬度的空隙。寬的框圖例在右、窄的框圖例在下。
 */
export function drawDonut(k: Kit, b: Box, d: SeriesData) {
  const { fs, ink } = k
  const p = k.ctx.props
  const s = d.series[0]
  const items = d.categories
    .map((name, i) => ({ name, v: s.values[i] ?? 0, i }))
    .filter((x) => x.v > 0)
  const total = items.reduce((a, x) => a + x.v, 0)
  if (!items.length || total <= 0) return
  const focus = p.colorMode === 'focus'
  const hiIndex = Math.round(Number(p.highlight ?? 0))
  const focusIndex = focus ? (hiIndex > 0 ? Math.min(hiIndex, items.length) - 1 : items.reduce((a, x, i) => (x.v > items[a].v ? i : a), 0)) : -1
  const colors = seriesColors(k.ctx, items.length)
  const colorOf = (i: number) => (focus ? (i === focusIndex ? mainColor(k.ctx) : ink.rest) : colors[i])
  const decimals = decimalsOf(items.map((x) => x.v))
  const pctText = (v: number) => `${formatNumber((v / total) * 100, '1')}%`
  const valueText = (v: number) => formatNumber(v, k.fmt, { decimals, percentLike: d.percentLike })
  const showValues = p.labels === 'all' && !d.percentLike

  // 圖例尺寸
  const size = fs * 0.92
  const sw = fs * 0.72
  const rowH = fs * 1.55
  const nameW = Math.max(...items.map((x) => k.width(x.name, size)))
  const pctW = Math.max(...items.map((x) => k.width(pctText(x.v), size, 500)))
  const valW = showValues ? Math.max(...items.map((x) => k.width(valueText(x.v), size))) + fs * 0.8 : 0
  const legendW = sw + fs * 0.5 + nameW + fs * 1.2 + pctW + valW
  const legendH = items.length * rowH
  const W = b.x1 - b.x0
  const H = b.y1 - b.y0
  const side = p.legend !== 'none' && (p.legend === 'right' || (p.legend !== 'bottom' && W - legendW - fs * 1.5 >= H * 0.6))
  const below = p.legend !== 'none' && !side

  let r: number
  let cx: number
  let cy: number
  if (side) {
    r = Math.min(H, W - legendW - fs * 1.5) / 2
    cx = b.x0 + r
    cy = (b.y0 + b.y1) / 2
  } else {
    r = Math.min(W, H - (below ? legendH + fs : 0)) / 2
    cx = (b.x0 + b.x1) / 2
    cy = b.y0 + r
  }
  if (r < fs) return

  const hole = Math.max(0, Math.min(0.9, Number(p.hole ?? 0.6)))
  const inner = r * hole
  const gapDeg = items.length > 1 ? ((fs * 0.18) / r) * (180 / Math.PI) : 0
  let start = -90
  items.forEach((x, i) => {
    const angle = (x.v / total) * 360
    const drawn = Math.max(0.01, angle - gapDeg)
    k.out.push(
      new Konva.Arc({
        x: cx,
        y: cy,
        innerRadius: inner,
        outerRadius: r,
        angle: drawn,
        rotation: start + gapDeg / 2,
        fill: colorOf(i),
        listening: false,
      }),
    )
    start += angle
  })

  // 中央：強調模式顯示強調項目的占比，否則顯示合計
  if (hole >= 0.45) {
    const big = focus ? pctText(items[focusIndex].v) : valueText(total)
    const small = focus ? items[focusIndex].name : `合計${k.unit ? `（${k.unit}）` : ''}`
    const bigSize = Math.min(inner * 0.55, (inner * 1.5) / Math.max(1, big.length * 0.62))
    k.text({ x: cx, y: cy - fs * 0.15, text: big, size: bigSize, weight: 700, fill: ink.primary, anchor: 'middle', baseline: 'bottom' })
    k.text({ x: cx, y: cy + fs * 0.45, text: small, size: fs * 0.85, fill: ink.muted, anchor: 'middle', maxWidth: inner * 1.6 })
  }

  if (p.legend === 'none') return
  const lx = side ? cx + r + fs * 1.5 : Math.max(b.x0, cx - legendW / 2)
  const ly = side ? cy - legendH / 2 : cy + r + fs
  items.forEach((x, i) => {
    const yy = ly + rowH * i + rowH / 2
    k.out.push(new Konva.Rect({ x: lx, y: yy - sw / 2, width: sw, height: sw, fill: colorOf(i), cornerRadius: sw * 0.2, listening: false }))
    k.text({ x: lx + sw + fs * 0.5, y: yy, text: x.name, size, baseline: 'middle', maxWidth: nameW })
    const px = lx + sw + fs * 0.5 + nameW + fs * 1.2 + pctW
    k.text({ x: px, y: yy, text: pctText(x.v), size, weight: 500, fill: ink.primary, anchor: 'end', baseline: 'middle' })
    if (showValues) k.text({ x: px + valW, y: yy, text: valueText(x.v), size, fill: ink.muted, anchor: 'end', baseline: 'middle' })
  })
}

/**
 * 大數字：標籤（標題或系列名稱）、數值＋單位、與前一期的差異，以及可選的走勢小圖。
 * 走勢小圖用淡色、最後一期用主色（dataviz 的 stat tile 規範）。
 */
export function drawKpi(k: Kit, b: Box, d: SeriesData, hasTitle: boolean) {
  const { fs, ink } = k
  const p = k.ctx.props
  const s = d.series[0]
  const present = s.values.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => x.v !== null)
  if (!present.length) return
  const last = present[present.length - 1]
  const prev = present.length > 1 ? present[present.length - 2] : null
  const decimals = decimalsOf(present.map((x) => x.v))
  const main = mainColor(k.ctx)
  const W = b.x1 - b.x0
  let yy = b.y0

  // 標籤：沒有標題時用「系列名稱・期別」
  if (!hasTitle) {
    const label = d.categories.length > 1 ? `${s.name}・${d.categories[last.i]}` : d.categories[last.i] || s.name
    k.text({ x: b.x0, y: yy, text: label, size: fs, fill: ink.secondary, maxWidth: W })
    yy += fs * 1.5
  }

  const value = formatNumber(last.v, k.fmt, { decimals, percentLike: d.percentLike })
  const spark = present.length >= 3 && p.sparkline !== false
  const deltaH = prev ? fs * 1.6 : 0
  const sparkH = spark ? Math.max(fs * 2.2, (b.y1 - yy) * 0.28) : 0
  const room = b.y1 - yy - deltaH - sparkH
  const unitRatio = 0.42
  const unitW = (sz: number) => (k.unit ? k.width(k.unit, sz * unitRatio) + sz * 0.12 : 0)
  let big = Math.min(room * 0.92, fs * 6)
  const valueW = (sz: number) => k.width(value, sz, 700) + unitW(sz)
  if (valueW(big) > W) big = (big * W) / valueW(big)
  if (big < fs) big = fs
  k.text({ x: b.x0, y: yy, text: value, size: big, weight: 700, fill: ink.primary })
  if (k.unit) {
    k.text({ x: b.x0 + k.width(value, big, 700) + big * 0.12, y: yy + big * 0.92, text: k.unit, size: big * unitRatio, fill: ink.secondary, baseline: 'bottom' })
  }
  yy += big * 1.08

  if (prev) {
    const diff = last.v - prev.v
    const pct = prev.v !== 0 ? (diff / Math.abs(prev.v)) * 100 : null
    const good = p.deltaGood === 'down' ? diff < 0 : p.deltaGood === 'neutral' ? null : diff > 0
    const color = diff === 0 || good === null ? ink.secondary : good ? ink.good : ink.bad
    const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '■'
    const amount = pct !== null && !d.percentLike ? `${formatNumber(Math.abs(pct), '1')}%` : formatNumber(Math.abs(diff), k.fmt, { decimals, percentLike: d.percentLike })
    const t = k.text({ x: b.x0, y: yy + fs * 0.2, text: `${arrow} ${amount}`, size: fs * 0.95, weight: 500, fill: color })
    k.text({ x: b.x0 + t.width() + fs * 0.5, y: yy + fs * 0.2, text: `較${d.categories[prev.i] || '前期'}`, size: fs * 0.9, fill: ink.muted, maxWidth: W - t.width() - fs * 0.5 })
    yy += deltaH
  }

  if (spark) {
    const y0 = b.y1 - sparkH + fs * 0.5
    const y1 = b.y1 - fs * 0.4
    const vs = present.map((x) => x.v)
    const lo = Math.min(...vs)
    const hi = Math.max(...vs)
    const n = s.values.length
    const x = (i: number) => b.x0 + fs * 0.4 + ((W - fs * 0.8) * i) / Math.max(1, n - 1)
    const y = (v: number) => (hi === lo ? (y0 + y1) / 2 : y1 - ((v - lo) / (hi - lo)) * (y1 - y0))
    k.out.push(
      new Konva.Line({
        points: present.flatMap((q) => [x(q.i), y(q.v)]),
        stroke: ink.rest,
        strokeWidth: fs * 0.16,
        lineJoin: 'round',
        lineCap: 'round',
        listening: false,
      }),
    )
    k.out.push(new Konva.Circle({ x: x(last.i), y: y(last.v), radius: fs * 0.36, fill: main, stroke: ink.surface, strokeWidth: fs * 0.12, listening: false }))
  }
}
