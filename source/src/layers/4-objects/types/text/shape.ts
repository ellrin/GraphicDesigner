import Konva from 'konva'
import type { ParamValues } from '../../../../core/params'
import type { ShapeBuilder } from '../index'
import { createVerticalText, type LatinMode } from './vertical'
import { splitPrice } from '../../../../core/textfit'

/** 文字專屬、由文字編輯區（而非 params.json）控制的屬性預設值。 */
export const TEXT_DEFAULTS: ParamValues = {
  text: '輸入文字',
  fontFamily: 'Noto Sans TC',
  /** 相對畫布高度 */
  fontSize: 0.08,
  fontWeight: 700,
}

// 文字框：寬度固定、文字在框內換行；縮放文字框不會改變字級。
// 文字比框高時不裁切，直接往下延伸（避免文字消失）；比框矮時依垂直對齊放在框內。
const build: ShapeBuilder = (ctx) => {
  const p = ctx.props
  const size = (p.fontSize as number) * ctx.canvasH
  const family = `"${p.fontFamily}", "PingFang TC", "Microsoft JhengHei", sans-serif`

  if (p.direction === 'vertical') {
    return [
      createVerticalText({
        x: -ctx.w / 2,
        y: -ctx.h / 2,
        width: ctx.w,
        height: ctx.h,
        text: String(p.text ?? ''),
        font: `${p.fontWeight ?? 400} ${size}px ${family}`,
        fontSize: size,
        lineHeight: p.lineHeight as number,
        letterSpacing: (p.letterSpacing as number) * size,
        align: p.align as 'left' | 'center' | 'right',
        latin: (p.latin as LatinMode) ?? 'rotate',
        fill: ctx.fill || '#000000',
        stroke: ctx.stroke || undefined,
        strokeWidth: ctx.strokeWidth,
      }),
    ]
  }

  // 價目：每行拆成品名（靠左）與價格（靠右），中間以點線連接
  if (p.role === 'price') return priceLines(ctx, size, family)

  const text = new Konva.Text({
    x: -ctx.w / 2,
    y: -ctx.h / 2,
    width: ctx.w,
    text: String(p.text ?? ''),
    fontFamily: family,
    fontStyle: String(p.fontWeight ?? 400),
    fontSize: size,
    lineHeight: p.lineHeight as number,
    letterSpacing: (p.letterSpacing as number) * size,
    align: p.align as string,
    verticalAlign: p.verticalAlign as string,
    fill: ctx.fill || '#000000',
    stroke: ctx.stroke || undefined,
    strokeEnabled: !!ctx.stroke && ctx.strokeWidth > 0,
    strokeWidth: ctx.strokeWidth,
    fillAfterStrokeEnabled: true,
    // 以詞換行；沒有空白的中文長句會自動改成逐字換行
    wrap: 'word',
  })
  text.height(Math.max(ctx.h, text.height()))
  return [text]
}
export default build

function priceLines(ctx: Parameters<ShapeBuilder>[0], size: number, family: string): Konva.Shape[] {
  const p = ctx.props
  const lh = (p.lineHeight as number) || 1.7
  const fill = ctx.fill || '#000000'
  const common = { fontFamily: family, fontStyle: String(p.fontWeight ?? 400), fontSize: size, fill, width: ctx.w, wrap: 'none' as const }
  const out: Konva.Shape[] = []
  String(p.text ?? '')
    .split('\n')
    .forEach((line, i) => {
      const y = -ctx.h / 2 + i * size * lh + ((lh - 1) * size) / 2
      const [name, price] = splitPrice(line)
      const left = new Konva.Text({ ...common, x: -ctx.w / 2, y, text: name, align: 'left' })
      out.push(left)
      if (!price) return
      const right = new Konva.Text({ ...common, x: -ctx.w / 2, y, text: price, align: 'right' })
      out.push(right)
      const x0 = -ctx.w / 2 + left.getTextWidth() + size * 0.5
      const x1 = ctx.w / 2 - right.getTextWidth() - size * 0.5
      if (x1 > x0) {
        out.push(
          new Konva.Line({
            points: [x0, y + size * 0.72, x1, y + size * 0.72],
            stroke: fill,
            strokeWidth: size * 0.07,
            dash: [0.01, size * 0.28],
            lineCap: 'round',
            opacity: 0.55,
          }),
        )
      }
    })
  return out
}
