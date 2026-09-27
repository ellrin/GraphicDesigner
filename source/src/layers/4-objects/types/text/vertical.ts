// 直排文字：由上往下、由右往左換行。
// - 句讀（、。，．）放在字格右上
// - 括號、刪節號、破折號改用直排專用字形；長音、波浪號等沒有直排字形的符號轉 90°
// - 英數字：rotate＝整串轉 90° 橫躺（1–2 位數字自動「縱中橫」橫排在一格內）；upright＝每個字直立；sideways＝全部橫躺（含數字）

import Konva from 'konva'

export type LatinMode = 'rotate' | 'upright' | 'sideways'

export interface VerticalTextOptions {
  x: number
  y: number
  width: number
  height: number
  text: string
  font: string
  fontSize: number
  lineHeight: number
  letterSpacing: number
  /** 每一行（直欄）在框內的對齊：top／middle／bottom（對應橫排的靠左／置中／靠右） */
  align: 'left' | 'center' | 'right'
  latin: LatinMode
  fill: string
  stroke?: string
  strokeWidth?: number
}

/** 放在字格右上角的句讀 */
const CORNER = new Set(['、', '。', '，', '．', '､', '｡'])
/** 直排專用標點（Unicode 直排字形）：字形本身就是直的，位置比旋轉更準確 */
const VERTICAL_FORMS: Record<string, string> = {
  '「': '﹁', '」': '﹂', '『': '﹃', '』': '﹄',
  '（': '︵', '）': '︶', '(': '︵', ')': '︶',
  '〈': '︿', '〉': '﹀', '《': '︽', '》': '︾',
  '【': '︻', '】': '︼', '〔': '︹', '〕': '︺',
  '［': '﹇', '］': '﹈', '｛': '︷', '｝': '︸',
  '…': '︙', '‥': '︰', '—': '︱', '―': '︱',
}
/** 沒有直排字形、需要轉 90° 的符號 */
const ROTATE = new Set([...'ー~～–-[]{}<>：:；;=＝→←'])

type Token =
  | { kind: 'cjk'; ch: string }
  | { kind: 'corner'; ch: string }
  | { kind: 'rot'; ch: string }
  /** 橫躺的一串英數字 */
  | { kind: 'run'; text: string }
  /** 縱中橫（1–2 位數字橫排在一格） */
  | { kind: 'tcy'; text: string }
  | { kind: 'newline' }

const isLatin = (ch: string) => /[\u0021-\u007e\u00a0-\u024f]/.test(ch) && !ROTATE.has(ch) && !VERTICAL_FORMS[ch]

function tokenize(text: string, latin: LatinMode): Token[] {
  const out: Token[] = []
  const chars = [...text]
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    if (ch === '\n') out.push({ kind: 'newline' })
    else if (CORNER.has(ch)) out.push({ kind: 'corner', ch })
    else if (VERTICAL_FORMS[ch]) out.push({ kind: 'cjk', ch: VERTICAL_FORMS[ch] })
    else if (ROTATE.has(ch)) out.push({ kind: 'rot', ch })
    else if (isLatin(ch) && latin !== 'upright') {
      let j = i
      while (j < chars.length && isLatin(chars[j])) j++
      const run = chars.slice(i, j).join('')
      if (latin === 'rotate' && /^\d{1,2}$/.test(run)) out.push({ kind: 'tcy', text: run })
      else out.push({ kind: 'run', text: run })
      i = j - 1
    } else out.push({ kind: 'cjk', ch })
  }
  return out
}

export function createVerticalText(o: VerticalTextOptions): Konva.Shape {
  const size = o.fontSize
  const cell = size + o.letterSpacing
  const colStep = size * o.lineHeight

  const draw = (ctx: CanvasRenderingContext2D) => {
    ctx.font = o.font
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    const tokens = tokenize(o.text, o.latin)

    // 先排版成直欄：每欄是一串（token, 佔用高度）
    type Placed = { t: Token; h: number }
    const cols: Placed[][] = [[]]
    let used = 0
    const height = Math.max(o.height, cell)
    for (const t of tokens) {
      if (t.kind === 'newline') {
        cols.push([])
        used = 0
        continue
      }
      const h = t.kind === 'run' ? ctx.measureText(t.text).width + o.letterSpacing : cell
      if (used + h > height + 0.01 && cols[cols.length - 1].length) {
        cols.push([])
        used = 0
      }
      cols[cols.length - 1].push({ t, h })
      used += h
    }

    const colTotal = (c: Placed[]) => c.reduce((s, p) => s + p.h, 0)
    cols.forEach((col, ci) => {
      // 第一欄貼齊框的右緣，往左換行
      const cx = o.x + o.width - size / 2 - ci * colStep
      const total = colTotal(col)
      let y = o.y + (o.align === 'center' ? (o.height - total) / 2 : o.align === 'right' ? o.height - total : 0)
      for (const { t, h } of col) {
        const cy = y + h / 2
        const paint = (text: string, x: number, yy: number) => {
          if (o.stroke && o.strokeWidth) {
            ctx.lineWidth = o.strokeWidth
            ctx.strokeStyle = o.stroke
            ctx.strokeText(text, x, yy)
          }
          ctx.fillStyle = o.fill
          ctx.fillText(text, x, yy)
        }
        if (t.kind === 'cjk') paint(t.ch, cx, cy)
        else if (t.kind === 'corner') paint(t.ch, cx + size * 0.55, cy - size * 0.55)
        else if (t.kind === 'tcy') {
          ctx.save()
          const w = ctx.measureText(t.text).width
          // 兩位數字寬度超過一格時水平壓縮
          const k = w > size ? size / w : 1
          ctx.translate(cx, cy)
          ctx.scale(k, 1)
          paint(t.text, 0, 0)
          ctx.restore()
        } else if (t.kind === 'rot' || t.kind === 'run') {
          // 轉 90° 橫躺
          ctx.save()
          ctx.translate(cx, cy)
          ctx.rotate(Math.PI / 2)
          paint(t.kind === 'rot' ? t.ch : t.text, 0, 0)
          ctx.restore()
        }
        y += h
      }
    })
  }

  return new Konva.Shape<Konva.ShapeConfig>({
    x: 0,
    y: 0,
    width: o.width,
    height: o.height,
    sceneFunc: (ctx) => draw(ctx._context),
    // 點選範圍：整個文字框
    hitFunc: (ctx, shape) => {
      ctx.beginPath()
      ctx.rect(o.x, o.y, o.width, o.height)
      ctx.closePath()
      ctx.fillStrokeShape(shape)
    },
  })
}
