import Konva from 'konva'
import type { ParamValues } from '../../../../core/params'
import type { ShapeBuilder } from '../index'

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
  const text = new Konva.Text({
    x: -ctx.w / 2,
    y: -ctx.h / 2,
    width: ctx.w,
    text: String(p.text ?? ''),
    fontFamily: `"${p.fontFamily}", "PingFang TC", "Microsoft JhengHei", sans-serif`,
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
