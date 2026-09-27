// 匯出作品：PNG（可選解析度）與 PDF（依畫布實際尺寸，可加出血）。
// 影像由 CanvasView.renderImage 產生（只含背景與物件）。

import { jsPDF } from 'jspdf'
import type { CanvasSpec } from './canvas'
import type { RenderOptions } from '../renderer/CanvasView.svelte'

export type Renderer = (o: RenderOptions) => string

const MM_PER_INCH = 25.4
const PT_PER_PX = 0.75

/** PNG 的輸出寬度：mm 畫布依 DPI 換算；px 畫布依倍率。 */
export function pngWidth(c: CanvasSpec, opt: { dpi: number; scale: number }): number {
  return Math.round(c.unit === 'mm' ? (c.w / MM_PER_INCH) * opt.dpi : c.w * opt.scale)
}

function download(url: string, filename: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
}

export function exportPng(render: Renderer, c: CanvasSpec, opt: { dpi: number; scale: number }, name: string) {
  download(render({ pixelWidth: pngWidth(c, opt) }), `${name}.png`)
}

/**
 * PDF：頁面尺寸 = 畫布實際尺寸（mm 畫布用 mm；px 畫布換算成 pt）＋ 出血。
 * 內容為高解析度影像（mm 畫布依 DPI、px 畫布 2 倍），適合印刷與分享。
 */
export function exportPdf(render: Renderer, c: CanvasSpec, opt: { dpi: number; bleedMm: number; cropMarks: boolean }, name: string) {
  const mm = c.unit === 'mm'
  // 出血只對 mm 畫布有意義（印刷用）
  const bleed = mm ? opt.bleedMm : 0
  const pixelWidth = mm ? Math.round((c.w / MM_PER_INCH) * opt.dpi) : Math.round(c.w * 2)
  const img = render({ pixelWidth, bleed, mime: 'image/jpeg', quality: 0.95 })

  const unit = mm ? 'mm' : 'pt'
  const k = mm ? 1 : PT_PER_PX
  const w = (c.w + 2 * bleed) * k
  const h = (c.h + 2 * bleed) * k
  // 有裁切標記時頁面外圍多留 10mm 放標記
  const margin = mm && opt.cropMarks && bleed > 0 ? 10 : 0
  const pageW = w + 2 * margin
  const pageH = h + 2 * margin
  const pdf = new jsPDF({ unit, format: [pageW, pageH], orientation: pageW > pageH ? 'landscape' : 'portrait', compress: true })
  pdf.addImage(img, 'JPEG', margin, margin, w, h, undefined, 'FAST')

  if (margin) {
    // 裁切標記：標示成品邊界（出血內側）
    pdf.setLineWidth(0.25)
    pdf.setDrawColor(0)
    const x0 = margin + bleed
    const y0 = margin + bleed
    const x1 = x0 + c.w
    const y1 = y0 + c.h
    const len = 6
    const gap = bleed + 1
    for (const x of [x0, x1]) {
      pdf.line(x, y0 - gap - len, x, y0 - gap)
      pdf.line(x, y1 + gap, x, y1 + gap + len)
    }
    for (const y of [y0, y1]) {
      pdf.line(x0 - gap - len, y, x0 - gap, y)
      pdf.line(x1 + gap, y, x1 + gap + len, y)
    }
  }
  pdf.save(`${name}.pdf`)
}
