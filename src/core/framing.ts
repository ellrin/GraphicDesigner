// 圖片主體標記 ⊕ 的座標換算（圖片物件與背景共用）。
// 物件可能旋轉，所以畫布座標與物件框內座標之間要做旋轉換算。

import type { Frame, Pt } from './geometry'
import { imagePointAt, subjectInBox, type DesignObject, type ImageFit, type ImageFraming } from './objects'

export interface ImageSize {
  w: number
  h: number
}

/** 可以放主體標記的框：物件框（畫布座標，含旋轉）或整張畫布（背景） */
export interface FramingBox {
  x: number
  y: number
  w: number
  h: number
  /** 角度（度） */
  rotation: number
}

export const objectBox = (o: DesignObject, c: Frame): FramingBox => ({
  x: o.x * c.w,
  y: o.y * c.h,
  w: o.w * c.w,
  h: o.h * c.h,
  rotation: o.rotation,
})

export const canvasBox = (c: Frame): FramingBox => ({ x: 0, y: 0, w: c.w, h: c.h, rotation: 0 })

/** 框內相對位置（0–1）→ 畫布座標 */
function toCanvas(box: FramingBox, at: Pt): Pt {
  const lx = (at.x - 0.5) * box.w
  const ly = (at.y - 0.5) * box.h
  const a = (box.rotation * Math.PI) / 180
  return {
    x: box.x + box.w / 2 + lx * Math.cos(a) - ly * Math.sin(a),
    y: box.y + box.h / 2 + lx * Math.sin(a) + ly * Math.cos(a),
  }
}

/** 畫布座標 → 框內相對位置（0–1） */
export function toBox(box: FramingBox, p: Pt): Pt {
  const a = (-box.rotation * Math.PI) / 180
  const dx = p.x - (box.x + box.w / 2)
  const dy = p.y - (box.y + box.h / 2)
  const lx = dx * Math.cos(a) - dy * Math.sin(a)
  const ly = dx * Math.sin(a) + dy * Math.cos(a)
  return { x: lx / box.w + 0.5, y: ly / box.h + 0.5 }
}

/** 主體標記目前在畫布上的位置 */
export function subjectOnCanvas(size: ImageSize, box: FramingBox, fit: ImageFit, f: ImageFraming): Pt {
  return toCanvas(box, subjectInBox(size.w, size.h, box.w, box.h, fit, f))
}

/** 拖曳主體標記到畫布上的 p：照片跟著移動，讓主體落在 p（回傳新的 target） */
export function targetFromCanvas(box: FramingBox, p: Pt): Pt {
  const at = toBox(box, p)
  return { x: Math.min(1, Math.max(0, at.x)), y: Math.min(1, Math.max(0, at.y)) }
}

/** 在照片上點一下標記主體：照片不動，只記錄「這一點就是主體」 */
export function markSubject(size: ImageSize, box: FramingBox, fit: ImageFit, f: ImageFraming, p: Pt): Pick<ImageFraming, 'focus' | 'target'> {
  const at = toBox(box, p)
  const focus = imagePointAt(size.w, size.h, box.w, box.h, fit, f, at)
  return {
    focus: { x: Math.min(1, Math.max(0, focus.x)), y: Math.min(1, Math.max(0, focus.y)) },
    target: { x: at.x, y: at.y },
  }
}
