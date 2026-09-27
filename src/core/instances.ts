// 版型實例：第一層（構圖）與第二層（視覺引導）共用。
// 每個實例可以套用在整張畫布、某個區塊、或任意矩形範圍（例如另一個構圖切出的區域），
// 所以同一張畫布可以有好幾個構圖，也能做「構圖裡再套構圖」。

import { computeTemplate, handlesOf, pointParamFromCanvas, type Handle } from './compute'
import { pt, rect as rectPrimitive, type Frame, type GuideOutput, type Primitive, type Pt, type Rect } from './geometry'
import type { ParamValues, PointValue } from './params'
import type { Template } from './registry'
import type { Orientation } from './transform'

/** 實例套用的範圍 */
export type FrameRef =
  | { kind: 'canvas' }
  /** 固定範圍（0–1 相對畫布），label 記錄來源方便辨識 */
  | { kind: 'rect'; rect: Rect; label?: string }
  /** 跟著某個區塊（區塊移動時一起移動） */
  | { kind: 'block'; blockId: string }
  /**
   * 跟著另一個構圖切出的區域（來源構圖調整時一起變動）。
   * rect 是選取當下的位置，來源不存在時退回使用。
   */
  | { kind: 'region'; source: string; region: string; rect: Rect; label?: string }

export interface TemplateInstance {
  uid: string
  templateId: string
  params: ParamValues
  orientation: Orientation
  visible: boolean
  frame: FrameRef
}

export const CANVAS_FRAME: FrameRef = { kind: 'canvas' }

/** 查詢某個實例切出的區域（畫布座標）；由呼叫端依計算順序提供 */
export type RegionLookup = (source: string, region: string) => Rect | undefined

/** 範圍 → 畫布座標的矩形。找不到區塊時退回整張畫布。 */
export function resolveFrame(
  frame: FrameRef,
  canvas: Frame,
  blocks: { uid: string; x: number; y: number; w: number; h: number }[],
  lookup?: RegionLookup,
): Rect {
  const whole = { x: 0, y: 0, w: canvas.w, h: canvas.h }
  if (frame.kind === 'region') {
    const live = lookup?.(frame.source, frame.region)
    if (live) return live
  }
  if (frame.kind === 'rect' || frame.kind === 'region') {
    const r = frame.rect
    return { x: r.x * canvas.w, y: r.y * canvas.h, w: r.w * canvas.w, h: r.h * canvas.h }
  }
  if (frame.kind === 'block') {
    const b = blocks.find((x) => x.uid === frame.blockId)
    return b ? { x: b.x * canvas.w, y: b.y * canvas.h, w: b.w * canvas.w, h: b.h * canvas.h } : whole
  }
  return whole
}

const move = (p: Pt, dx: number, dy: number): Pt => pt(p.x + dx, p.y + dy)

function translatePrimitive(p: Primitive, dx: number, dy: number): Primitive {
  switch (p.kind) {
    case 'line':
      return { ...p, a: move(p.a, dx, dy), b: move(p.b, dx, dy) }
    case 'polyline':
      return { ...p, points: p.points.map((q) => move(q, dx, dy)) }
    case 'circle':
      return { ...p, c: move(p.c, dx, dy) }
    case 'text':
      return { ...p, at: move(p.at, dx, dy) }
  }
}

export function translateOutput(out: GuideOutput, dx: number, dy: number): GuideOutput {
  if (dx === 0 && dy === 0) return out
  return {
    primitives: out.primitives.map((p) => translatePrimitive(p, dx, dy)),
    anchors: out.anchors.map((a) => ({ ...a, x: a.x + dx, y: a.y + dy })),
    regions: out.regions?.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy })),
  }
}

/** 計算實例在畫布上的圖元；範圍不是整張畫布時，額外畫出範圍外框。 */
export function computeInstance(t: Template, inst: TemplateInstance, frame: Rect, isCanvas: boolean): GuideOutput {
  const out = translateOutput(computeTemplate(t, { w: frame.w, h: frame.h }, inst.params, inst.orientation), frame.x, frame.y)
  if (isCanvas) return out
  return { ...out, primitives: [rectPrimitive(frame.x, frame.y, frame.w, frame.h, { weight: 'sub', dashed: true }), ...out.primitives] }
}

export function instanceHandles(t: Template, inst: TemplateInstance, frame: Rect): Handle[] {
  return handlesOf(t, { w: frame.w, h: frame.h }, inst.params, inst.orientation).map((h) => ({
    ...h,
    pos: move(h.pos, frame.x, frame.y),
  }))
}

export function instancePointFromCanvas(t: Template, inst: TemplateInstance, key: string, p: Pt, frame: Rect): PointValue {
  return pointParamFromCanvas(t, key, move(p, -frame.x, -frame.y), { w: frame.w, h: frame.h }, inst.orientation)
}

export function frameLabel(frame: FrameRef, blocks: { uid: string; name: string }[]): string {
  if (frame.kind === 'canvas') return '整張畫布'
  if (frame.kind === 'block') return `區塊：${blocks.find((b) => b.uid === frame.blockId)?.name ?? '（已刪除）'}`
  return frame.label ?? '自訂範圍'
}
