import presets from '../config/canvas-presets.json'

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

/** 畫布長寬上限（mm 或 px） */
export const CANVAS_MAX = 20000
