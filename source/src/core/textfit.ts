// 文字量測與換行（估算）：中文字接近正方形，寬度以「字」為單位計算。
// 用來在排版時找出放得下的最大字級，以及把文字依形狀（三角形、圓形）逐行分段。

/** 一個字元的寬度（以字級為 1）：中日韓全形字 1、英數約 0.55、空白 0.3 */
export function charUnits(ch: string): number {
  const code = ch.codePointAt(0) ?? 0
  if (ch === ' ') return 0.3
  if (code < 0x2e80) return code < 0x7f ? 0.55 : 0.6
  if (code >= 0xff61 && code <= 0xff9f) return 0.55
  return 1
}

export const units = (s: string) => [...s].reduce((n, ch) => n + charUnits(ch), 0)

/** 不放在行首的標點（避頭點） */
const NO_START = new Set([...'，。、；：？！」』）》〉】〕…—・·,.;:?!)]}'])

/**
 * 把一段文字依每行可用寬度（字級為單位）斷行。
 * widthAt(i) 回傳第 i 行可用的寬度；英文單字盡量不拆開，標點不放在行首。
 */
export function breakParagraph(text: string, widthAt: (line: number) => number): string[] {
  const chars = [...text]
  const lines: string[] = []
  let cur = ''
  let used = 0
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    const u = charUnits(ch)
    const max = Math.max(1, widthAt(lines.length))
    if (used + u > max && cur) {
      // 避頭點：標點不放行首，把本行最後一個字一起帶到下一行
      if (NO_START.has(ch)) {
        const cs = [...cur]
        if (cs.length > 1) {
          const last = cs.pop()!
          lines.push(cs.join(''))
          cur = last + ch
          used = units(cur)
        } else {
          cur += ch
          used += u
        }
        continue
      }
      // 英文單字：退回到單字開頭再換行
      const m = /[A-Za-z0-9]+$/.exec(cur)
      if (m && /[A-Za-z0-9]/.test(ch) && m[0].length < cur.length) {
        lines.push(cur.slice(0, -m[0].length))
        cur = m[0]
        used = units(cur)
      } else {
        lines.push(cur)
        cur = ''
        used = 0
      }
    }
    cur += ch
    used += u
  }
  if (cur || !lines.length) lines.push(cur)
  // 換行處的空白不留在行首、行尾
  for (let i = 0; i < lines.length; i++) lines[i] = lines[i].trim() || lines[i]
  // 最後一行只剩一個字時，從上一行借一個字（避免孤字）
  if (lines.length > 1 && [...lines[lines.length - 1]].length === 1) {
    const prev = [...lines[lines.length - 2]]
    if (prev.length > 2) {
      const moved = prev.pop()!
      lines[lines.length - 2] = prev.join('')
      lines[lines.length - 1] = moved + lines[lines.length - 1]
    }
  }
  return lines
}

/** 多段文字（以換行分段）斷行 */
export function breakText(text: string, widthAt: (line: number) => number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    const offset = out.length
    out.push(...breakParagraph(para, (i) => widthAt(offset + i)))
  }
  return out
}

export const longestLine = (lines: string[]) => Math.max(0, ...lines.map(units))

/**
 * 在可變寬度的區域內排一段文字：widthAt(y) 回傳高度 y 處可用的寬度（畫布單位）。
 * 回傳各行文字與總高度；每行取該行上下緣中較窄的寬度，確保不超出形狀。
 */
/** balance > 0 時平均各行長度，但每行不少於 balance 個字 */
export function flowText(text: string, size: number, lineHeight: number, top: number, widthAt: (y: number) => number, balance = 0) {
  const step = size * lineHeight
  const avail = (i: number) => {
    const y0 = top + i * step
    return (Math.min(widthAt(y0), widthAt(y0 + size)) * 0.96) / size
  }
  let lines = breakText(text, avail)
  // 平均行長（標題類）：同樣行數下讓每行差不多長，避免最後一行很短
  if (balance > 0 && lines.length > 1) {
    const target = longestLine(lines) - 0.5
    for (let w = Math.max(balance, Math.ceil(units(text.replace(/\n/g, '')) / lines.length)); w <= target; w++) {
      const tried = breakText(text, (i) => Math.min(avail(i), w + 0.5))
      if (tried.length <= lines.length) {
        lines = tried
        break
      }
    }
  }
  return { lines, height: lines.length * step }
}

/** 二分搜尋：在 [lo, hi] 間找出讓 fits(size) 成立的最大字級 */
export function largestFitting(lo: number, hi: number, fits: (size: number) => boolean): number {
  if (!fits(lo)) return lo
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) lo = mid
    else hi = mid
  }
  return lo
}

/** 直排：每欄可放的字數與欄數 */
export function verticalColumns(text: string, size: number, height: number): number {
  const perColumn = Math.max(1, Math.floor(height / size))
  return text.split('\n').reduce((n, para) => n + Math.max(1, Math.ceil([...para].length / perColumn)), 0)
}
