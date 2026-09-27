// 第四層：物件的資料型別與單位換算。

import type { Frame, Rect } from './geometry'
import type { ParamValues } from './params'

/**
 * 設計物件。位置與尺寸以相對畫布的 0–1 儲存（和區塊一致），
 * x、y 是「未旋轉時」的左上角，旋轉以中心為軸。
 */
export interface DesignObject {
  uid: string
  /** 物件種類，對應 layers/4-objects/types/<type> */
  type: string
  name: string
  x: number
  y: number
  w: number
  h: number
  /** 角度（度） */
  rotation: number
  /** 空字串 = 無填色 */
  fill: string
  /** 空字串 = 無框線 */
  stroke: string
  /** 框線粗細，相對畫布短邊 */
  strokeWidth: number
  opacity: number
  visible: boolean
  /** 種類專屬的屬性（邊數、圓角、文字內容、字型、圖片…） */
  props: ParamValues
  /** 用某個區塊的形狀裁切（區塊 uid）；例如照片放進三角形、圓形區塊 */
  mask?: string | null
}

/** 可作為放置目標的錨點（0–1 相對座標） */
export interface AnchorOption {
  label: string
  x: number
  y: number
}

/**
 * 圖片的構圖控制（圖片物件與背景共用）：
 * - focus：照片裡「主體」的位置（相對照片 0–1）
 * - target：主體要放在框內的哪裡（相對框 0–1）；拖曳主體標記到錨點，就是改這個值
 * - zoom：在填滿的基礎上再放大（1 = 剛好填滿）
 */
export interface ImageFraming {
  zoom: number
  focus: { x: number; y: number }
  target: { x: number; y: number }
}

export const DEFAULT_FRAMING: ImageFraming = { zoom: 1, focus: { x: 0.5, y: 0.5 }, target: { x: 0.5, y: 0.5 } }

/** 畫布背景（第四層「插入背景」） */
export interface Background extends ImageFraming {
  color: string
  /** 背景圖片（assets 中的 id） */
  assetId: string | null
  fit: ImageFit
  opacity: number
}

export type ImageFit = 'cover' | 'contain' | 'stretch'

export const DEFAULT_BACKGROUND: Background = {
  color: '#ffffff',
  assetId: null,
  fit: 'cover',
  opacity: 1,
  ...structuredClone(DEFAULT_FRAMING),
}

export const objectRect = (o: Rect, c: Frame): Rect => ({ x: o.x * c.w, y: o.y * c.h, w: o.w * c.w, h: o.h * c.h })

/**
 * 圖片在方框內的擺放：回傳圖片應繪製的矩形（相對方框左上角）。cover 時會超出方框，需裁切。
 * 有 framing 時，讓照片的主體（focus）落在框內的 target 位置；cover 模式會限制在照片仍填滿框的範圍內。
 */
export function fitImage(imgW: number, imgH: number, boxW: number, boxH: number, fit: ImageFit, framing?: Partial<ImageFraming>): Rect {
  if (fit === 'stretch' || imgW <= 0 || imgH <= 0) return { x: 0, y: 0, w: boxW, h: boxH }
  const zoom = Math.max(0.1, framing?.zoom ?? 1)
  const base = fit === 'cover' ? Math.max(boxW / imgW, boxH / imgH) : Math.min(boxW / imgW, boxH / imgH)
  const s = base * zoom
  const w = imgW * s
  const h = imgH * s
  const focus = framing?.focus ?? { x: 0.5, y: 0.5 }
  const target = framing?.target ?? { x: 0.5, y: 0.5 }
  let x = target.x * boxW - focus.x * w
  let y = target.y * boxH - focus.y * h
  if (fit === 'cover') {
    x = Math.min(0, Math.max(boxW - w, x))
    y = Math.min(0, Math.max(boxH - h, y))
  }
  return { x, y, w, h }
}

/** 框內某一點（相對框 0–1）目前對應到照片上的哪一點（相對照片 0–1） */
export function imagePointAt(imgW: number, imgH: number, boxW: number, boxH: number, fit: ImageFit, framing: ImageFraming, at: { x: number; y: number }) {
  const r = fitImage(imgW, imgH, boxW, boxH, fit, framing)
  return { x: (at.x * boxW - r.x) / r.w, y: (at.y * boxH - r.y) / r.h }
}

/** 主體標記目前在框內的位置（被 cover 限制時，實際位置可能與 target 不同） */
export function subjectInBox(imgW: number, imgH: number, boxW: number, boxH: number, fit: ImageFit, framing: ImageFraming) {
  const r = fitImage(imgW, imgH, boxW, boxH, fit, framing)
  return { x: (r.x + framing.focus.x * r.w) / boxW, y: (r.y + framing.focus.y * r.h) / boxH }
}

// ── 字級單位 ──────────────────────────────────────────
// 字級以「相對畫布高度」儲存，改畫布尺寸時等比例縮放。
// 介面上：mm 畫布顯示 pt（印刷慣用），px 畫布顯示 px。

const MM_PER_PT = 25.4 / 72

export const fontUnitLabel = (c: { unit: 'mm' | 'px' }) => (c.unit === 'mm' ? 'pt' : 'px')

export function fontSizeToDisplay(rel: number, c: { h: number; unit: 'mm' | 'px' }): number {
  const abs = rel * c.h
  return c.unit === 'mm' ? abs / MM_PER_PT : abs
}

export function fontSizeFromDisplay(v: number, c: { h: number; unit: 'mm' | 'px' }): number {
  const abs = c.unit === 'mm' ? v * MM_PER_PT : v
  return abs / c.h
}
