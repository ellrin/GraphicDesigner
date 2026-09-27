// 畫布上選取框、框選範圍等的顏色，跟隨介面主題的 --selection 變數。

import Konva from 'konva'

export function selectionColor(alpha = 1): string {
  const hex = getComputedStyle(document.documentElement).getPropertyValue('--selection').trim() || '#ff6b35'
  if (alpha >= 1) return hex
  const n = parseInt(hex.replace('#', ''), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/** 依目前主題設定選取框顏色 */
export function paintTransformer(t: Konva.Transformer) {
  const c = selectionColor()
  t.borderStroke(c)
  t.anchorStroke(c)
}
