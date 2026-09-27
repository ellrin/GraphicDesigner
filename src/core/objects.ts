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
}

/** 畫布背景（第四層「插入背景」） */
export interface Background {
  color: string
  /** 背景圖片（assets 中的 id） */
  assetId: string | null
  fit: ImageFit
  opacity: number
}

export type ImageFit = 'cover' | 'contain' | 'stretch'

export const DEFAULT_BACKGROUND: Background = { color: '#ffffff', assetId: null, fit: 'cover', opacity: 1 }

export const objectRect = (o: Rect, c: Frame): Rect => ({ x: o.x * c.w, y: o.y * c.h, w: o.w * c.w, h: o.h * c.h })

/** 圖片在方框內的擺放：回傳圖片應繪製的矩形（相對方框左上角）。cover 時會超出方框，需裁切。 */
export function fitImage(imgW: number, imgH: number, boxW: number, boxH: number, fit: ImageFit): Rect {
  if (fit === 'stretch' || imgW <= 0 || imgH <= 0) return { x: 0, y: 0, w: boxW, h: boxH }
  const s = fit === 'cover' ? Math.max(boxW / imgW, boxH / imgH) : Math.min(boxW / imgW, boxH / imgH)
  const w = imgW * s
  const h = imgH * s
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h }
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
