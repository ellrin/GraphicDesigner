import presets from '../config/canvas-presets.json'
import theme from '../config/theme.json'

export type Unit = 'mm' | 'px'

export interface CanvasPreset {
  id: string
  name: string
  group: string
  w: number
  h: number
  unit: Unit
}

export interface CanvasSpec {
  presetId: string | null
  w: number
  h: number
  unit: Unit
}

export const CANVAS_PRESETS = presets as CanvasPreset[]

/** 匯出點陣圖時的像素尺寸：mm 依印刷 DPI 換算，px 直接使用。 */
export function exportPixelSize(c: CanvasSpec): { w: number; h: number } {
  if (c.unit === 'px') return { w: Math.round(c.w), h: Math.round(c.h) }
  const k = theme.export.printDpi / 25.4
  return { w: Math.round(c.w * k), h: Math.round(c.h * k) }
}
