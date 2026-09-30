// 數值格式與座標刻度（純函式，不依賴 Konva）。

export type NumberFormat = 'auto' | 'int' | '1' | '2' | 'percent' | 'wan'

const group = (v: number, digits: number) =>
  v.toLocaleString('zh-TW', { minimumFractionDigits: digits, maximumFractionDigits: digits })

/** 資料中出現的最多小數位數（上限 2），auto 格式用 */
export function decimalsOf(values: number[]): number {
  let d = 0
  for (const v of values) {
    const s = String(Math.abs(v))
    const i = s.indexOf('.')
    if (i >= 0) d = Math.max(d, s.length - i - 1)
  }
  return Math.min(d, 2)
}

/**
 * 格式化數值。
 * - auto：依資料原本的小數位數，加千分位；percentLike 時加 %
 * - wan：中文大數（1.2萬、3.4億）
 */
export function formatNumber(v: number, fmt: NumberFormat, opts: { decimals?: number; percentLike?: boolean } = {}): string {
  if (!Number.isFinite(v)) return ''
  switch (fmt) {
    case 'int':
      return group(v, 0)
    case '1':
      return group(v, 1)
    case '2':
      return group(v, 2)
    case 'percent':
      return `${group(v, Math.min(opts.decimals ?? 0, 1))}%`
    case 'wan': {
      const a = Math.abs(v)
      if (a >= 1e8) return `${trim(v / 1e8)}億`
      if (a >= 1e4) return `${trim(v / 1e4)}萬`
      return group(v, opts.decimals ?? 0)
    }
    default:
      return `${group(v, opts.decimals ?? 0)}${opts.percentLike ? '%' : ''}`
  }
}

const trim = (n: number) => String(Math.round(n * 10) / 10)

export interface Ticks {
  min: number
  max: number
  step: number
  values: number[]
  /** 刻度標籤需要的小數位數 */
  decimals: number
}

/** 「好讀」的刻度：步距為 1、2、2.5、5 × 10ⁿ，範圍向外擴到刻度上 */
export function niceTicks(lo: number, hi: number, maxCount: number): Ticks {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) [lo, hi] = [0, 1]
  if (lo === hi) [lo, hi] = lo === 0 ? [0, 1] : lo > 0 ? [0, lo] : [lo, 0]
  const count = Math.max(2, Math.floor(maxCount))
  const raw = (hi - lo) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / mag
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag
  const min = Math.floor(lo / step + 1e-9) * step
  const max = Math.ceil(hi / step - 1e-9) * step
  const values: number[] = []
  for (let v = min; v <= max + step / 2; v += step) values.push(Math.round(v / step) * step)
  const decimals = Math.max(0, Math.min(3, -Math.floor(Math.log10(step) + 1e-9) + (norm > 2 && norm <= 2.5 ? 1 : 0)))
  return { min, max, step, values, decimals }
}
